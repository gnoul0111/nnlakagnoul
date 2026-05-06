// addDoc và getDocs không được re-export bởi @/lib/firebase/firestore
// → import thẳng từ SDK
import { addDoc, getDocs } from 'firebase/firestore'
import {
  collection,
  query,
  where,
  orderBy,
  Timestamp,
  db,
  COLLECTIONS,
} from '@/lib/firebase/firestore'
import type { EventDoc, EventDocInput } from '@/lib/types/events'

// ─── Constants ────────────────────────────────────────────────────────────────

// Lùi 30 giây để tránh clock skew giữa client và Firestore
const CLOCK_SKEW_BUFFER_MS = 30 * 1000

// ─── Append event ─────────────────────────────────────────────────────────────

export async function appendEvent(input: EventDocInput): Promise<string> {
  const ref = collection(db, COLLECTIONS.EXPENSE_EVENTS)
  const docRef = await addDoc(ref, {
    ...input,
    timestamp: Timestamp.now(),
    createdAt: new Date().toISOString(),
  })
  return docRef.id
}

// ─── Fetch all events (full fetch) ───────────────────────────────────────────

export async function getAllEvents(userId: string): Promise<EventDoc[]> {
  const ref = collection(db, COLLECTIONS.EXPENSE_EVENTS)
  const q = query(
    ref,
    where('userId', '==', userId),
    orderBy('timestamp', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as EventDoc)
}

// ─── Incremental fetch — chỉ fetch events mới hơn lastSync ───────────────────
// Lùi 30s để tránh miss event do clock skew

export async function getNewEventsSince(
  userId: string,
  lastSync: number, // Unix ms
): Promise<EventDoc[]> {
  const syncPoint = new Timestamp(
    Math.floor((lastSync - CLOCK_SKEW_BUFFER_MS) / 1000),
    0,
  )
  const ref = collection(db, COLLECTIONS.EXPENSE_EVENTS)
  const q = query(
    ref,
    where('userId', '==', userId),
    where('timestamp', '>', syncPoint),
    orderBy('timestamp', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as EventDoc)
}

// ─── Batch append (dùng khi flush offline queue) ─────────────────────────────
//
// FIX SYNC-01: Bản gốc dùng `const now = Timestamp.now()` một lần duy nhất
// cho toàn bộ batch. Kết quả: tất cả events trong batch có CÙNG timestamp
// trong Firestore.
//
// Vấn đề:
//   - Firestore query `orderBy('timestamp', 'asc')` không có secondary sort key
//     → khi nhiều events có cùng timestamp, thứ tự trả về là document-insertion
//     order (Firestore internal), KHÔNG phải thứ tự logical của action.
//   - Nếu Firestore trả về [DELETE, UPDATE, ADD] thay vì [ADD, UPDATE, DELETE]:
//     replay() xử lý DELETE trước khi ADD → no-op → sau đó ADD tạo lại expense
//     → expense xuất hiện lại dù đã xóa (silent data corruption).
//   - Đây là lỗi intermittent: chỉ xảy ra khi Firestore trả về sai thứ tự,
//     rất khó reproduce trong dev nhưng có thể xảy ra trong production.
//
// Fix: dùng `createdAt` của từng event (ISO string từ queuedAt lúc enqueue)
// để derive một Timestamp riêng cho mỗi event, đảm bảo strictly-increasing.
// Nếu createdAt bằng nhau (unlikely), thêm offset microsecond theo index.

export async function appendEventsBatch(inputs: EventDocInput[]): Promise<void> {
  const BATCH_SIZE = 400

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const chunk = inputs.slice(i, i + BATCH_SIZE)
    await Promise.all(
      chunk.map((input, chunkIdx) => {
        // FIX SYNC-01: derive a unique, strictly-increasing timestamp per event
        // using the event's own createdAt field (set at enqueue time from queuedAt).
        // This preserves the original chronological order of offline actions.
        const baseMs = input.createdAt
          ? new Date(input.createdAt).getTime()
          : Date.now()

        // Add a sub-millisecond offset (in nanoseconds) by chunk position
        // to guarantee strict ordering even when createdAt strings are identical.
        const globalIdx = i + chunkIdx
        const seconds     = Math.floor(baseMs / 1000)
        const nanoseconds = (baseMs % 1000) * 1_000_000 + globalIdx * 1000  // +1µs per event

        const timestamp = new Timestamp(seconds, nanoseconds)

        return addDoc(collection(db, COLLECTIONS.EXPENSE_EVENTS), {
          ...input,
          timestamp,
          // Preserve original createdAt from client — do NOT overwrite with server time
          // so that the human-readable timestamp matches the Firestore sort key.
          createdAt: input.createdAt ?? new Date(baseMs).toISOString(),
        })
      }),
    )
  }
}