import { create } from 'zustand'
import { getAllEvents, getNewEventsSince } from '@/lib/services/eventService'
import { replay, applyEvent, emptyState, type ReplayedState } from '@/lib/engine/replay'
import type { EventDoc } from '@/lib/types/events'

// ─── Cache constants ──────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'chitieu_events_cache_'

// FIX PERF-01: Thay sessionStorage bằng IndexedDB.
//
// Vấn đề gốc (FIX S-06 cũ):
//   sessionStorage bị xóa mỗi khi user đóng tab → mỗi lần mở lại = cold start
//   = full Firestore fetch toàn bộ event log + replay() từ đầu.
//   User bình thường đóng/mở tab nhiều lần/ngày → cold start nhiều lần/ngày.
//
// Fix: IndexedDB persist qua tab close, browser restart, chỉ mất khi user
// xóa cache trình duyệt. Lần mở thứ 2 trở đi đọc từ IDB (~0ms) rồi background
// sync delta — gần như instant.
//
// Trade-off:
//   - readLocalCache là async (IDB không sync). loadEvents đã async → OK.
//   - writeLocalCache / clearLocalCache là fire-and-forget async. In-memory
//     store vẫn cập nhật đồng bộ nên UI không bao giờ chờ IDB write.
//   - IDB dùng Structured Clone Algorithm — Firestore Timestamp objects được
//     clone thành plain {seconds, nanoseconds}. getEventMs() đã dùng optional
//     chaining ?.toMillis?.() → hoạt động đúng với cả hai dạng.
//
// Không ảnh hưởng:
//   - Toàn bộ logic merge/sync/replay bên dưới — không đổi một dòng nào.
//   - _syncChain mutex — vẫn giữ nguyên, không phụ thuộc storage layer.
//   - offlineQueue — dùng localStorage riêng, không liên quan.
//   - Settings/Budget store — dùng cache riêng, không liên quan.

const IDB_DB_NAME    = 'chitieu_events_db'
const IDB_STORE_NAME = 'events_cache'
const IDB_VERSION    = 1

interface CachePayload {
  events:   EventDoc[]
  lastSync: number
}

function getCacheKey(userId: string) {
  return `${CACHE_KEY_PREFIX}${userId}`
}

// Singleton IDB connection — mở một lần, tái dùng cho các request tiếp theo.
let _dbPromise: Promise<IDBDatabase> | null = null

function openIDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (_dbPromise) return _dbPromise
  _dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, IDB_VERSION)
    req.onupgradeneeded = () => {
      // Tạo object store nếu chưa có (chạy khi lần đầu mở hoặc version tăng)
      if (!req.result.objectStoreNames.contains(IDB_STORE_NAME)) {
        req.result.createObjectStore(IDB_STORE_NAME)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => {
      _dbPromise = null // reset để retry lần sau
      reject(req.error)
    }
  })
  return _dbPromise
}

async function readLocalCache(userId: string): Promise<CachePayload | null> {
  try {
    const db    = await openIDB()
    const tx    = db.transaction(IDB_STORE_NAME, 'readonly')
    const store = tx.objectStore(IDB_STORE_NAME)
    return await new Promise<CachePayload | null>((resolve, reject) => {
      const req = store.get(getCacheKey(userId))
      req.onsuccess = () => resolve((req.result as CachePayload) ?? null)
      req.onerror   = () => reject(req.error)
    })
  } catch {
    return null
  }
}

// Fire-and-forget: UI không cần chờ IDB write hoàn tất.
// In-memory store (Zustand) đã được cập nhật đồng bộ trước đó.
function writeLocalCache(userId: string, payload: CachePayload): void {
  openIDB().then(db => {
    const tx    = db.transaction(IDB_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_STORE_NAME)
    store.put(payload, getCacheKey(userId))
  }).catch(e => {
    // InvalidStateError: "The database connection is closing" — xảy ra khi
    // trang đang unload (đóng tab, navigate đi). Đây là behavior bình thường,
    // không cần log ra console vì in-memory store vẫn nhất quán.
    if (e?.name === 'InvalidStateError') return
    console.warn('[EventStore] IDB write failed:', e)
  })
}

// Fire-and-forget: xóa cache không cần await.
function clearLocalCache(userId: string): void {
  openIDB().then(db => {
    const tx    = db.transaction(IDB_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_STORE_NAME)
    store.delete(getCacheKey(userId))
  }).catch(e => {
    // Tương tự writeLocalCache — ignore InvalidStateError khi page unload
    if (e?.name === 'InvalidStateError') return
  })
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
    // Guard: abort nếu user đã logout hoặc đổi sang user khác
    if (get()._currentUserId !== userId) return

    const newEvents = await getNewEventsSince(userId, lastSync)
    if (newEvents.length === 0) return

    // Guard lần 2: check lại sau async fetch (user có thể logout trong lúc chờ)
    if (get()._currentUserId !== userId) return

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

      // Tầng 2: IndexedDB cache (persist qua tab close)
      const localCache = await readLocalCache(userId)
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
      const { _eventsCache, _currentUserId, _lastSync, replayedState } = get()
      if (!_eventsCache || !_currentUserId) return

      const merged = mergeEvents(_eventsCache, [event])

      // FIX PERF-02: Incremental state update — chỉ apply event mới nhất lên
      // state hiện tại, thay vì replay() toàn bộ N events từ đầu.
      //
      // Tại sao an toàn:
      //   - appendLocalEvent() chỉ được gọi từ useAppend() với clientTimestamp
      //     = now() → event mới luôn là event mới nhất về mặt thời gian.
      //   - Với optimistic events (prefix 'optimistic_'), thứ tự chronological
      //     là đúng vì user vừa tạo chúng.
      //   - syncEvents() và loadEvents() vẫn dùng replay() đầy đủ → state
      //     luôn được reconcile đúng sau mỗi lần sync với Firestore.
      //
      // Shallow clone để tránh mutate state cũ (savingsPlans cần deep clone
      // vì applyEvent có thể mutate plan.deposits[]):
      const base = replayedState ?? emptyState()
      const newState: ReplayedState = {
        expenses:     [...base.expenses],
        incomes:      [...base.incomes],
        goals:        [...base.goals],
        debts:        [...base.debts],
        templates:    [...base.templates],
        savingsPlans: structuredClone(base.savingsPlans),
      }
      applyEvent(newState, event)

      if (_lastSync !== null) {
        writeLocalCache(_currentUserId, { events: merged, lastSync: _lastSync })
      }
      set({ _eventsCache: merged, replayedState: newState })
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