import { create } from 'zustand'
import { getAllEvents, getNewEventsSince } from '@/lib/services/eventService'
import { replay, type ReplayedState } from '@/lib/engine/replay'
import type { EventDoc } from '@/lib/types/events'

// ─── Cache constants ──────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'chitieu_events_cache_'

// FIX S-06: Event cache chứa toàn bộ lịch sử chi tiêu dạng plaintext.
// Dùng sessionStorage thay localStorage → data tự xóa khi đóng tab/browser.
// Đây là tradeoff: mất "stale-while-revalidate" qua lần mở app tiếp theo,
// nhưng bảo vệ user trên shared device.
//
// Nếu muốn giữ localStorage (vd: PWA offline), cần encrypt cache bằng
// Web Crypto API với key derive từ Firebase ID token trước khi ghi.
// Đó là roadmap — hiện tại sessionStorage là fix đơn giản và an toàn hơn.

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
    // QuotaExceededError: sessionStorage thường nhỏ hơn localStorage (~5MB)
    // Nếu full: xóa cache cũ và thử lại với data hiện tại
    console.warn('[EventStore] sessionStorage write failed:', e)
    try {
      storage.removeItem(getCacheKey(userId))
      storage.setItem(getCacheKey(userId), JSON.stringify(payload))
    } catch {
      // Quota quá nhỏ ngay cả với data hiện tại — bỏ qua, in-memory vẫn hoạt động
    }
  }
}

function clearLocalCache(userId: string): void {
  storage?.removeItem(getCacheKey(userId))
}

// ─── Sync mutex ───────────────────────────────────────────────────────────────

let _syncInProgress = false

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

  const syncBackground = async (userId: string, lastSync: number) => {
    if (_syncInProgress) return
    _syncInProgress = true

    try {
      const newEvents = await getNewEventsSince(userId, lastSync)
      if (newEvents.length === 0) {
        _syncInProgress = false
        return
      }

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
    } catch (err) {
      console.error('[EventStore] syncBackground failed:', err)
    } finally {
      _syncInProgress = false
    }
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
        syncBackground(userId, _lastSync)
        return
      }

      // Tầng 2: sessionStorage cache (FIX S-06: was localStorage)
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
        syncBackground(userId, localCache.lastSync)
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

    syncEvents: async (userId: string) => {
      const { _eventsCache, _lastSync } = get()
      if (!_eventsCache || !_lastSync) {
        await get().loadEvents(userId)
        return
      }
      try {
        const newEvents = await getNewEventsSince(userId, _lastSync)
        if (newEvents.length === 0) return

        const currentCache = get()._eventsCache ?? []
        const cleanedCache = pruneReplacedOptimistic(currentCache, newEvents)
        const merged     = mergeEvents(cleanedCache, newEvents)
        const lastSync   = Date.now()

        writeLocalCache(userId, { events: merged, lastSync })
        const replayedState = replay(merged)
        set({ _eventsCache: merged, _lastSync: lastSync, replayedState })
      } catch (err) {
        console.error('[EventStore] syncEvents failed:', err)
      }
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
      _syncInProgress = false
      set({ _eventsCache: null, _lastSync: null, replayedState: null })
    },

    clearAllCache: (userId: string) => {
      clearLocalCache(userId)
      _syncInProgress = false
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

function mergeEvents(existing: EventDoc[], incoming: EventDoc[]): EventDoc[] {
  if (incoming.length === 0) return existing
  const idSet  = new Set(existing.map(e => e.id))
  const newOnes = incoming.filter(e => !idSet.has(e.id))
  if (newOnes.length === 0) return existing
  return [...existing, ...newOnes].sort((a, b) => {
    const aMs = a.timestamp?.toMillis?.() ?? 0
    const bMs = b.timestamp?.toMillis?.() ?? 0
    return aMs - bMs
  })
}

// ─── Prune optimistic events ──────────────────────────────────────────────────

function getDomainSignature(event: EventDoc): string | null {
  const data = event.data ?? {}
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