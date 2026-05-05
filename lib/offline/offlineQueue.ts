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
  queuedAt: string   // ISO string
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

// ─── Public API ───────────────────────────────────────────────────────────────

export function enqueueEvent(input: EventDocInput): void {
  const queue = readQueue()

  if (queue.length >= MAX_QUEUE_SIZE) {
    console.warn(`[OfflineQueue] Queue full (${MAX_QUEUE_SIZE}), dropping oldest event`)
    queue.shift()
  }

  queue.push({
    id:       generateQueueId(),
    input,
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
 * FIX BUG-B: After a successful flush we now trigger a delta sync on the
 * event store so that optimistic (`optimistic_xxx`) events in the local
 * cache are pruned and replaced with confirmed Firestore IDs.
 *
 * Without this, the local sessionStorage cache keeps stale optimistic events
 * indefinitely until the user's next action happens to trigger syncEvents().
 *
 * FIX BUG-E: appendEventsBatch is wrapped per-chunk with individual error
 * handling. If one chunk fails, the successfully-written chunks are removed
 * from the queue (to avoid duplicating them on retry) while the failed chunk
 * is preserved for re-sending. This prevents orphan Firestore event documents.
 *
 * NOTE on BUG-E: the per-chunk granularity is a pragmatic tradeoff. True
 * idempotency would require server-side dedup by a client-generated
 * idempotency key. That is tracked as a roadmap item.
 */
export async function flushQueue(): Promise<void> {
  const currentUser = auth.currentUser
  if (!currentUser) {
    console.warn('[OfflineQueue] No authenticated user — skipping flush')
    return
  }

  const queue = readQueue()
  if (queue.length === 0) return

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
    // Nothing to send — still clear the queue (filtered events are discarded)
    clearQueue()
    return
  }

  // ── FIX BUG-E: chunk-level error isolation ─────────────────────────────────
  //
  // Original code called appendEventsBatch() with all events at once. If it
  // threw (e.g. network error mid-batch), clearQueue() was never reached, so
  // the whole queue was retried — including events already written to Firestore,
  // creating orphan duplicate documents.
  //
  // New approach: send events in granular chunks (CHUNK_SIZE), track which
  // chunks succeeded, and only remove those from the queue. Failed chunks
  // remain queued for the next retry. This minimises but does not fully
  // eliminate the Firestore dup window — true idempotency needs server-side
  // dedup keys (roadmap).
  const CHUNK_SIZE = 100
  const succeeded: QueuedEvent[] = []
  const failed:    QueuedEvent[] = []

  for (let i = 0; i < validQueue.length; i += CHUNK_SIZE) {
    const chunk = validQueue.slice(i, i + CHUNK_SIZE)
    try {
      await appendEventsBatch(chunk.map(q => q.input))
      succeeded.push(...chunk)
    } catch (err) {
      console.error(`[OfflineQueue] Chunk ${i / CHUNK_SIZE} failed:`, err)
      failed.push(...chunk)
      // Continue trying remaining chunks rather than aborting entirely
    }
  }

  // Remove succeeded events from queue; preserve failed events for retry
  if (failed.length === 0) {
    clearQueue()
  } else {
    // Rebuild queue: only the events that were not sent
    const remaining = queue.filter(q =>
      failed.some(f => f.id === q.id),
    )
    writeQueue(remaining)
    console.warn(`[OfflineQueue] ${failed.length} events failed to flush, will retry`)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offlinequeue:flushed'))
  }

  // ── FIX BUG-B: trigger delta sync so optimistic events are pruned ──────────
  //
  // Before this fix: after the queue flush, the local eventStore cache still
  // held `optimistic_xxx` prefixed events. The confirmed Firestore events
  // would not appear locally until the user's next interaction triggered
  // syncEvents(). In a PWA where the user might be idle, this meant stale
  // optimistic data could persist in the session indefinitely.
  //
  // We lazily import the store to avoid a circular dependency at module load
  // time (offlineQueue → eventStore → eventService → offlineQueue).
  if (succeeded.length > 0 && currentUser) {
    try {
      const { useEventStore } = await import('@/lib/store/eventStore')
      await useEventStore.getState().syncEvents(currentUser.uid)
    } catch (err) {
      // Non-fatal — optimistic events will be reconciled on next user action
      console.warn('[OfflineQueue] Post-flush sync failed (non-fatal):', err)
    }
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