import type { EventDocInput } from '@/lib/types/events'
import { appendEventsBatch } from '@/lib/services/eventService'
import { auth } from '@/lib/firebase/config'

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_STORAGE_KEY = 'offline-event-queue'
const MAX_QUEUE_SIZE    = 500
const MAX_EVENT_AGE_MS  = 7 * 24 * 60 * 60 * 1000  // 7 days

// ─── Queue types ──────────────────────────────────────────────────────────────

export interface QueuedEvent {
  id:       string
  input:    EventDocInput
  queuedAt: string   // ISO string — used for age filter AND for SYNC-01 timestamp derivation
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readQueue(): QueuedEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      console.warn('[OfflineQueue] Corrupt queue data, resetting')
      localStorage.removeItem(QUEUE_STORAGE_KEY)
      return []
    }
    return parsed as QueuedEvent[]
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue))
}

function generateQueueId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── Flush mutex ──────────────────────────────────────────────────────────────
//
// FIX SYNC-02: Bản gốc không có mutex trên flushQueue.
//
// Vấn đề:
//   - setupOfflineQueueListener gắn handler cho window 'online' event.
//   - Nếu đồng thời có code khác gọi flushQueue() (vd: useAppend khi reconnect,
//     hay component lifecycle), cả hai đọc cùng snapshot queue từ localStorage,
//     cùng gọi appendEventsBatch với cùng events.
//   - Mỗi addDoc() tạo một Firestore document MỚI → duplicate event documents.
//   - pruneReplacedOptimistic bảo vệ UI khỏi hiển thị double, nhưng Firestore
//     tích lũy orphan documents → tăng storage cost + slow queries theo thời gian.
//
// Fix: _flushInProgress flag. Nếu flush đang chạy, call mới skip ngay lập tức.
// Không dùng Promise chain như _syncChain trong eventStore vì flushQueue là
// fire-and-forget — nếu đang flush rồi, skip là đúng (không cần queue thêm).

let _flushInProgress = false

// ─── Public API ───────────────────────────────────────────────────────────────

export function enqueueEvent(input: EventDocInput): void {
  const queue = readQueue()

  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[OfflineQueue] Queue full (${MAX_QUEUE_SIZE}), dropping oldest event`)
    queue.shift()
  }

  queue.push({
    id:       generateQueueId(),
    input:    {
      ...input,
      // Ensure createdAt is set at enqueue time — this is the source of truth
      // for SYNC-01 fix: appendEventsBatch derives per-event timestamps from this.
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
    queuedAt: new Date().toISOString(),
  })
  writeQueue(queue)
}

export function getPendingCount(): number {
  return readQueue().length
}

export function clearQueue(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(QUEUE_STORAGE_KEY)
  }
}

/**
 * Flush queue to Firestore.
 *
 * SYNC-02 FIX: _flushInProgress mutex prevents concurrent double-flush.
 * SYNC-01 FIX: events forwarded with their original createdAt so
 *   appendEventsBatch (fixed) can derive per-event strictly-increasing timestamps.
 * BUG-B FIX: post-flush syncEvents prunes stale optimistic events.
 * BUG-E FIX: chunk-level error isolation; succeeded chunks removed from queue.
 */
export async function flushQueue(): Promise<void> {
  // FIX SYNC-02: bail out immediately if another flush is in progress.
  // The running flush will handle all currently-queued events.
  if (_flushInProgress) {
    console.log('[OfflineQueue] Flush already in progress — skipping concurrent call')
    return
  }

  const currentUser = auth.currentUser
  if (!currentUser) {
    console.warn('[OfflineQueue] No authenticated user — skipping flush')
    return
  }

  const queue = readQueue()
  if (queue.length === 0) return

  _flushInProgress = true

  try {
    const now = Date.now()
    let filteredByUser = 0
    let filteredByAge  = 0

    const validQueue = queue.filter(q => {
      if (q.input.userId !== currentUser.uid) {
        filteredByUser++
        return false
      }
      const age = now - new Date(q.queuedAt).getTime()
      if (age > MAX_EVENT_AGE_MS) {
        filteredByAge++
        return false
      }
      return true
    })

    if (filteredByUser > 0) {
      console.warn(`[OfflineQueue] Dropped ${filteredByUser} events with mismatched userId`)
    }
    if (filteredByAge > 0) {
      console.warn(`[OfflineQueue] Dropped ${filteredByAge} events older than 7 days`)
    }

    if (validQueue.length === 0) {
      clearQueue()
      return
    }

    // BUG-E FIX: per-chunk error isolation
    // SYNC-01: inputs carry their original createdAt → appendEventsBatch (fixed)
    //   derives strictly-increasing timestamps from these values.
    const CHUNK_SIZE = 100
    const succeeded: QueuedEvent[] = []
    const failed:    QueuedEvent[] = []

    for (let i = 0; i < validQueue.length; i += CHUNK_SIZE) {
      const chunk = validQueue.slice(i, i + CHUNK_SIZE)
      try {
        await appendEventsBatch(chunk.map(q => q.input))
        succeeded.push(...chunk)
      } catch (err) {
        console.error(`[OfflineQueue] Chunk ${Math.floor(i / CHUNK_SIZE)} failed:`, err)
        failed.push(...chunk)
      }
    }

    if (failed.length === 0) {
      clearQueue()
    } else {
      const remaining = queue.filter(q => failed.some(f => f.id === q.id))
      writeQueue(remaining)
      console.warn(`[OfflineQueue] ${failed.length} events failed to flush, will retry`)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('offlinequeue:flushed'))
    }

    // BUG-B FIX: trigger delta sync to prune stale optimistic events
    if (succeeded.length > 0) {
      try {
        const { useEventStore } = await import('@/lib/store/eventStore')
        await useEventStore.getState().syncEvents(currentUser.uid)
      } catch (err) {
        console.warn('[OfflineQueue] Post-flush sync failed (non-fatal):', err)
      }
    }

  } finally {
    // Always release the mutex — even on unexpected errors
    _flushInProgress = false
  }
}

// ─── Online/Offline listener setup ───────────────────────────────────────────

let listenerAttached = false

export function setupOfflineQueueListener(): void {
  if (typeof window === 'undefined' || listenerAttached) return
  listenerAttached = true

  window.addEventListener('online', async () => {
    const count = getPendingCount()
    if (count > 0) {
      console.log(`[OfflineQueue] Online. Flushing ${count} pending events...`)
      try {
        await flushQueue()
        console.log('[OfflineQueue] Flush complete.')
      } catch (err) {
        console.error('[OfflineQueue] Flush failed:', err)
      }
    }
  })
}