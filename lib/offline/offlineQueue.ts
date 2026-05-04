import type { EventDocInput } from '@/lib/types/events'
import { appendEventsBatch } from '@/lib/services/eventService'
import { auth } from '@/lib/firebase/config'

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_STORAGE_KEY = 'offline-event-queue'

// FIX S-11: giới hạn kích thước queue để tránh localStorage bị dùng làm attack vector
const MAX_QUEUE_SIZE = 500

// FIX S-05: loại bỏ event quá cũ (có thể bị inject từ session khác)
const MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 ngày

// ─── Queue types ──────────────────────────────────────────────────────────────

export interface QueuedEvent {
  id: string
  input: EventDocInput
  queuedAt: string  // ISO string
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readQueue(): QueuedEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Validate cơ bản: phải là array
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

/**
 * Thêm 1 event vào queue (khi offline).
 * FIX S-11: nếu queue đã đầy → drop event cũ nhất (FIFO) để tránh spam.
 */
export function enqueueEvent(input: EventDocInput): void {
  const queue = readQueue()

  if (queue.length >= MAX_QUEUE_SIZE) {
    // Drop event cũ nhất thay vì từ chối ghi mới
    // Ưu tiên giữ event mới nhất vì đó thường là intent của user
    console.warn(`[OfflineQueue] Queue full (${MAX_QUEUE_SIZE}), dropping oldest event`)
    queue.shift()
  }

  queue.push({
    id: generateQueueId(),
    input,
    queuedAt: new Date().toISOString(),
  })
  writeQueue(queue)
}

/** Số events đang chờ trong queue */
export function getPendingCount(): number {
  return readQueue().length
}

/** Xóa toàn bộ queue */
export function clearQueue(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(QUEUE_STORAGE_KEY)
  }
}

/**
 * Flush queue lên Firestore.
 *
 * FIX S-05: trước khi flush, validate từng event:
 *   1. userId trong event phải khớp với auth.currentUser.uid
 *      → chặn trường hợp queue bị tamper hoặc có event từ user khác
 *   2. Event không được quá cũ (> 7 ngày)
 *      → chặn replay attack từ session cũ
 *
 * FIX S-11: batch size đã được giới hạn bởi MAX_QUEUE_SIZE ở enqueueEvent.
 */
export async function flushQueue(): Promise<void> {
  // Không flush nếu chưa đăng nhập
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

  // FIX S-05 + S-11: filter kép — userId + age
  const validInputs = queue
    .filter(q => {
      // Reject: userId không khớp với user hiện tại
      if (q.input.userId !== currentUser.uid) {
        filteredByUser++
        return false
      }
      // Reject: event quá cũ (> 7 ngày)
      const age = now - new Date(q.queuedAt).getTime()
      if (age > MAX_EVENT_AGE_MS) {
        filteredByAge++
        return false
      }
      return true
    })
    .map(q => q.input)

  if (filteredByUser > 0) {
    console.warn(`[OfflineQueue] Dropped ${filteredByUser} events with mismatched userId`)
  }
  if (filteredByAge > 0) {
    console.warn(`[OfflineQueue] Dropped ${filteredByAge} events older than 7 days`)
  }

  if (validInputs.length > 0) {
    await appendEventsBatch(validInputs)
  }

  clearQueue()

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offlinequeue:flushed'))
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