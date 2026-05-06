import { create } from 'zustand'
import { getAllEvents, getNewEventsSince } from '@/lib/services/eventService'
import { replay, type ReplayedState } from '@/lib/engine/replay'
import type { EventDoc } from '@/lib/types/events'

// ─── Cache constants ──────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'chitieu_events_cache_'

// FIX S-06: sessionStorage thay localStorage (xem comment gốc)
const storage = typeof window !== 'undefined' ? sessionStorage : null

interface CachePayload {
  events:   EventDoc[]
  lastSync: number
}

function getCacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`
}

function readLocalCache(userId: string): CachePayload | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(getCacheKey(userId))
    return raw ? (JSON.parse(raw) as CachePayload) : null
  } catch {
    return null
  }
}

function writeLocalCache(userId: string, payload: CachePayload): void {
  if (!storage) return
  try {
    storage.setItem(getCacheKey(userId), JSON.stringify(payload))
  } catch (e) {
    console.warn('[EventStore] sessionStorage write failed:', e)
    try {
      storage.removeItem(getCacheKey(userId))
      storage.setItem(getCacheKey(userId), JSON.stringify(payload))
    } catch {
      // Quota quá nhỏ — in-memory vẫn hoạt động
    }
  }
}

function clearLocalCache(userId: string): void {
  storage?.removeItem(getCacheKey(userId))
}

// ─── Sync mutex ───────────────────────────────────────────────────────────────
//
// FIX SYNC-03: Dùng một Promise thay vì boolean flag để serialise tất cả
// sync operations (syncBackground + syncEvents).
//
// Vấn đề gốc:
//   - _syncInProgress chỉ guard syncBackground. syncEvents không check flag này.
//   - Khi flushQueue() gọi syncEvents() cùng lúc với loadEvents() đang chạy
//     syncBackground(), cả hai đọc cùng snapshot cache, fetch cùng new events,
//     merge độc lập, và last set() call thắng → contribution của cái kia bị mất.
//   - Timeline nguy hiểm:
//       T0: syncBackground reads cache=[evt_1], _syncInProgress=true
//       T1: syncEvents reads same stale cache=[evt_1] (no mutex check)
//       T2: syncBackground gets newEvents=[evt_2], merges → [evt_1, evt_2]
//       T3: syncBackground set({ _eventsCache: [evt_1, evt_2] })  ← correct
//       T4: syncEvents gets newEvents=[evt_2, evt_3], merges from STALE base
//           → [evt_1, evt_2, evt_3] if lucky, [evt_1, evt_3] if timing differs
//       T5: syncEvents set({ _eventsCache: [evt_1, evt_3] })  ← LOST evt_2!
//
// Fix: replace boolean flag with a Promise chain (_syncChain).
// Every sync operation appends to the chain → they run sequentially.
// No operation can race another; each one sees the latest committed cache.

let _syncChain: Promise<void> = Promise.resolve()

function enqueueSyncOperation(op: () => Promise<void>): Promise<void> {
  _syncChain = _syncChain.then(op).catch(() => {
    // Don't let one failure block all future syncs
  })
  return _syncChain
}

// ─── Store state ──────────────────────────────────────────────────────────────

interface EventStoreState {
  _eventsCache:    EventDoc[] | null
  _lastSync:       number | null
  _currentUserId:  string | null
  replayedState:   ReplayedState | null
  isLoading:       boolean
  error:           string | null

  loadEvents:       (userId: string) => Promise<void>
  syncEvents:       (userId: string) => Promise<void>
  invalidateCache:  (userId: string) => void
  clearAllCache:    (userId: string) => void
  appendLocalEvent: (event: EventDoc) => void
  removeLocalEvent: (eventId: string) => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useEventStore = create<EventStoreState>((set, get) => {

  // FIX SYNC-03: syncBackground and syncEvents both enqueue via _syncChain
  // → strictly sequential, no interleaving possible.

  const _doSync = async (userId: string, lastSync: number) => {
    const newEvents = await getNewEventsSince(userId, lastSync)
    if (newEvents.length === 0) return

    const currentCache = get()._eventsCache ?? []
    const cleanedCache = pruneReplacedOptimistic(currentCache, newEvents)
    const merged       = mergeEvents(cleanedCache, newEvents)
    const newLastSync  = Date.now()

    writeLocalCache(userId, { events: merged, lastSync: newLastSync })

    const replayedState = replay(merged)
    set({
      _eventsCache:   merged,
      _lastSync:      newLastSync,
      _currentUserId: userId,
      replayedState,
    })
  }

  return {
    _eventsCache:   null,
    _lastSync:      null,
    _currentUserId: null,
    replayedState:  null,
    isLoading:      false,
    error:          null,

    loadEvents: async (userId: string) => {
      set({ error: null })

      const { _eventsCache, _lastSync, _currentUserId } = get()
      const sameUser = _currentUserId === userId

      // Tầng 1: in-memory cache
      if (sameUser && _eventsCache && _lastSync) {
        enqueueSyncOperation(() => _doSync(userId, _lastSync))
        return
      }

      // Tầng 2: sessionStorage cache
      const localCache = readLocalCache(userId)
      if (localCache && localCache.events.length > 0) {
        const staleState = replay(localCache.events)
        set({
          _eventsCache:   localCache.events,
          _lastSync:      localCache.lastSync,
          _currentUserId: userId,
          replayedState:  staleState,
          isLoading:      false,
        })
        enqueueSyncOperation(() => _doSync(userId, localCache.lastSync))
        return
      }

      // Tầng 3: cold start
      set({ isLoading: true, _currentUserId: userId })
      try {
        const events   = await getAllEvents(userId)
        const lastSync = Date.now()
        writeLocalCache(userId, { events, lastSync })

        const replayedState = replay(events)
        set({
          _eventsCache:   events,
          _lastSync:      lastSync,
          replayedState,
          isLoading:      false,
        })
      } catch (err) {
        console.error('[EventStore] loadEvents full fetch failed:', err)
        set({
          isLoading: false,
          error:     err instanceof Error ? err.message : 'Lỗi tải dữ liệu.',
        })
      }
    },

    // FIX SYNC-03: syncEvents now enqueues via _syncChain instead of running
    // immediately. This prevents concurrent execution with syncBackground
    // (which is also enqueued). Both operations are guaranteed to see the
    // latest committed cache state rather than a stale snapshot.
    syncEvents: async (userId: string) => {
      const { _eventsCache, _lastSync } = get()
      if (!_eventsCache || !_lastSync) {
        await get().loadEvents(userId)
        return
      }

      await enqueueSyncOperation(async () => {
        try {
          // Re-read _lastSync inside the queued operation — it may have been
          // updated by a preceding operation in the chain.
          const freshLastSync = get()._lastSync ?? _lastSync
          const newEvents = await getNewEventsSince(userId, freshLastSync)
          if (newEvents.length === 0) return

          const currentCache = get()._eventsCache ?? []
          const cleanedCache = pruneReplacedOptimistic(currentCache, newEvents)
          const merged       = mergeEvents(cleanedCache, newEvents)
          const lastSync     = Date.now()

          writeLocalCache(userId, { events: merged, lastSync })
          const replayedState = replay(merged)
          set({ _eventsCache: merged, _lastSync: lastSync, replayedState })
        } catch (err) {
          console.error('[EventStore] syncEvents failed:', err)
        }
      })
    },

    appendLocalEvent: (event: EventDoc) => {
      const { _eventsCache, _currentUserId, _lastSync } = get()
      if (!_eventsCache || !_currentUserId) return

      const merged        = mergeEvents(_eventsCache, [event])
      const replayedState = replay(merged)

      if (_lastSync !== null) {
        writeLocalCache(_currentUserId, { events: merged, lastSync: _lastSync })
      }
      set({ _eventsCache: merged, replayedState })
    },

    removeLocalEvent: (eventId: string) => {
      const { _eventsCache, _currentUserId, _lastSync } = get()
      if (!_eventsCache || !_currentUserId) return

      const filtered = _eventsCache.filter(e => e.id !== eventId)
      if (filtered.length === _eventsCache.length) return

      const replayedState = replay(filtered)
      if (_lastSync !== null) {
        writeLocalCache(_currentUserId, { events: filtered, lastSync: _lastSync })
      }
      set({ _eventsCache: filtered, replayedState })
    },

    invalidateCache: (userId: string) => {
      clearLocalCache(userId)
      // Reset the sync chain so pending operations don't run against stale state
      _syncChain = Promise.resolve()
      set({ _eventsCache: null, _lastSync: null, replayedState: null })
    },

    clearAllCache: (userId: string) => {
      clearLocalCache(userId)
      _syncChain = Promise.resolve()
      set({
        _eventsCache:   null,
        _lastSync:      null,
        _currentUserId: null,
        replayedState:  null,
      })
    },
  }
})

// ─── Merge helper ─────────────────────────────────────────────────────────────
//
// FIX SYNC-04: thêm tiebreaker bằng createdAt ISO string.
//
// Vấn đề gốc: sort chỉ dùng timestamp.toMillis().
// Khi appendEventsBatch đã fix SYNC-01 (per-event timestamps từ createdAt),
// timestamps sẽ strictly-increasing → tiebreaker hiếm khi cần.
// Nhưng với single appendEvent (online path), Timestamp.now() có độ phân giải
// 1 giây → hai events trong cùng 1 giây sẽ có cùng timestamp.toMillis().
// createdAt (ISO string với milliseconds) đảm bảo stable sort trong mọi trường hợp.

function mergeEvents(existing: EventDoc[], incoming: EventDoc[]): EventDoc[] {
  if (incoming.length === 0) return existing
  const idSet   = new Set(existing.map(e => e.id))
  const newOnes = incoming.filter(e => !idSet.has(e.id))
  if (newOnes.length === 0) return existing
  return [...existing, ...newOnes].sort((a, b) => {
    const aMs = a.timestamp?.toMillis?.() ?? 0
    const bMs = b.timestamp?.toMillis?.() ?? 0
    if (aMs !== bMs) return aMs - bMs
    // FIX SYNC-04: ISO string tiebreaker — createdAt has ms precision
    // whereas Firestore Timestamp only has second precision in some cases.
    // This guarantees a stable, deterministic order for same-second events.
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  })
}

// ─── Prune optimistic events ──────────────────────────────────────────────────

function getDomainSignature(event: EventDoc): string | null {
  const data      = event.data ?? {}
  const eventType = String(event.eventType).toUpperCase()

  if (data.id) return `${eventType}:${data.id}`
  if (data.goalId && data.depositId)
    return `${eventType}:${data.goalId}:${data.depositId}`
  if (data.goalId && data.deposit && typeof data.deposit === 'object' && 'id' in data.deposit)
    return `${eventType}:${data.goalId}:${(data.deposit as { id: string }).id}`
  if (data.debtId && data.paymentId)
    return `${eventType}:${data.debtId}:${data.paymentId}`
  if (data.debtId && data.payment && typeof data.payment === 'object' && 'id' in data.payment)
    return `${eventType}:${data.debtId}:${(data.payment as { id: string }).id}`
  if (data.monthKey && data.depositId)    return `${eventType}:${data.monthKey}:${data.depositId}`
  if (data.monthKey && data.withdrawalId) return `${eventType}:${data.monthKey}:${data.withdrawalId}`
  if (data.monthKey && data.allocationId) return `${eventType}:${data.monthKey}:${data.allocationId}`
  const nested = data.deposit ?? data.withdrawal
  if (data.monthKey && nested && typeof nested === 'object' && 'id' in nested)
    return `${eventType}:${data.monthKey}:${(nested as { id: string }).id}`
  if (data.monthKey) return `${eventType}:${data.monthKey}`

  return null
}

function pruneReplacedOptimistic(cache: EventDoc[], incoming: EventDoc[]): EventDoc[] {
  if (cache.length === 0) return cache
  const incomingSignatures = new Set<string>()
  for (const e of incoming) {
    const sig = getDomainSignature(e)
    if (sig) incomingSignatures.add(sig)
  }
  if (incomingSignatures.size === 0) return cache
  return cache.filter(e => {
    if (!e.id.startsWith('optimistic_')) return true
    const sig = getDomainSignature(e)
    if (!sig) return true
    return !incomingSignatures.has(sig)
  })
}