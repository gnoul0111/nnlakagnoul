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
  getDocument,
  setDocument,
  onSnapshot,
  type Unsubscribe,
} from '@/lib/firebase/firestore'
import type { EventDoc, EventDocInput } from '@/lib/types/events'
import type { ReplayedState } from '@/lib/engine/replay'

// ─── Constants ────────────────────────────────────────────────────────────────

// Lùi 30 giây để tránh clock skew giữa client và Firestore
const CLOCK_SKEW_BUFFER_MS = 30 * 1000

// ─── Append event ─────────────────────────────────────────────────────────────
//
// FIX CONC-01: clientTimestamp từ input được GIỮ NGUYÊN, không bị overwrite.
// Server chỉ thêm `timestamp` (Firestore Timestamp) cho incremental sync query.
// Xem useAppend.ts — clientTimestamp được set tại thời điểm user thao tác.

export async function appendEvent(input: EventDocInput): Promise<string> {
  const ref = collection(db, COLLECTIONS.EXPENSE_EVENTS)
  const docRef = await addDoc(ref, {
    ...input,
    // Preserve clientTimestamp — never overwrite với server time
    clientTimestamp: input.clientTimestamp ?? new Date().toISOString(),
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

// ─── Realtime listener — PHA B ─────────────────────────────────────────────────
//
// Subscribe các event mới hơn `sinceMs` (lùi buffer ngoài hàm này). Firestore
// đẩy về realtime: lần đầu callback nhận TẤT CẢ doc khớp query (dưới dạng
// 'added'), sau đó chỉ nhận delta. Event là append-only nên thực tế chỉ có
// 'added'; vẫn nhận 'modified' phòng hờ. Dedup theo id do caller xử lý
// (mergeEvents) → an toàn với phần đã có trong cache.

export function subscribeNewEvents(
  userId: string,
  sinceMs: number,
  onEvents: (events: EventDoc[]) => void,
): Unsubscribe {
  const syncPoint = new Timestamp(Math.floor(sinceMs / 1000), 0)
  const ref = collection(db, COLLECTIONS.EXPENSE_EVENTS)
  const q = query(
    ref,
    where('userId', '==', userId),
    where('timestamp', '>', syncPoint),
    orderBy('timestamp', 'asc'),
  )
  return onSnapshot(
    q,
    snap => {
      const changed = snap.docChanges()
        .filter(c => c.type === 'added' || c.type === 'modified')
        .map(c => ({ id: c.doc.id, ...c.doc.data() }) as EventDoc)
      if (changed.length > 0) onEvents(changed)
    },
    err => console.error('[eventService] realtime listener error:', err),
  )
}

// ─── Batch append (dùng khi flush offline queue) ─────────────────────────────
//
// FIX SYNC-01: mỗi event dùng createdAt riêng để derive Timestamp độc lập
// → strictly-increasing, đảm bảo replay() xử lý đúng thứ tự.
//
// FIX CONC-01: clientTimestamp từ input được giữ nguyên, không bị overwrite.

export async function appendEventsBatch(inputs: EventDocInput[]): Promise<void> {
  const BATCH_SIZE = 400

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const chunk = inputs.slice(i, i + BATCH_SIZE)
    await Promise.all(
      chunk.map((input, chunkIdx) => {
        const baseMs = input.createdAt
          ? new Date(input.createdAt).getTime()
          : Date.now()

        const globalIdx   = i + chunkIdx
        const seconds     = Math.floor(baseMs / 1000)
        const nanoseconds = (baseMs % 1000) * 1_000_000 + globalIdx * 1000

        const timestamp = new Timestamp(seconds, nanoseconds)

        return addDoc(collection(db, COLLECTIONS.EXPENSE_EVENTS), {
          ...input,
          // Preserve clientTimestamp — không overwrite
          clientTimestamp: input.clientTimestamp ?? new Date(baseMs).toISOString(),
          timestamp,
          createdAt: input.createdAt ?? new Date(baseMs).toISOString(),
        })
      }),
    )
  }
}

// ─── Snapshot functions ───────────────────────────────────────────────────────

export interface SnapshotDoc {
  userId: string
  lastEventId: string
  lastEventTimestamp: { seconds: number; nanoseconds: number } | Timestamp
  lastEvent: EventDoc
  state: ReplayedState
  updatedAt: string
}

export async function getLatestSnapshot(userId: string): Promise<SnapshotDoc | null> {
  try {
    const snap = await getDocument<SnapshotDoc>(COLLECTIONS.EXPENSE_SNAPSHOTS, userId)
    return snap
  } catch (err) {
    console.error('[eventService] Failed to fetch snapshot:', err)
    return null
  }
}

export async function saveSnapshot(
  userId: string,
  snapshot: Omit<SnapshotDoc, 'updatedAt'>,
): Promise<void> {
  const ts = snapshot.lastEventTimestamp
  const timestampObj = ts instanceof Timestamp 
    ? ts 
    : new Timestamp(ts.seconds, ts.nanoseconds)

  await setDocument(
    COLLECTIONS.EXPENSE_SNAPSHOTS,
    userId,
    {
      ...snapshot,
      lastEventTimestamp: timestampObj,
      updatedAt: new Date().toISOString(),
    },
    false, // overwrite
  )
}

export async function getEventsSinceTimestamp(
  userId: string,
  sinceTimestamp: { seconds: number; nanoseconds: number } | Timestamp,
): Promise<EventDoc[]> {
  const ts = sinceTimestamp instanceof Timestamp
    ? sinceTimestamp
    : new Timestamp(sinceTimestamp.seconds, sinceTimestamp.nanoseconds)

  const ref = collection(db, COLLECTIONS.EXPENSE_EVENTS)
  const q = query(
    ref,
    where('userId', '==', userId),
    where('timestamp', '>=', ts),
    orderBy('timestamp', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as EventDoc)
}