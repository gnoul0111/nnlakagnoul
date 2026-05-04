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

export async function appendEventsBatch(inputs: EventDocInput[]): Promise<void> {
  const BATCH_SIZE = 400
  const now = Timestamp.now()

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const chunk = inputs.slice(i, i + BATCH_SIZE)
    await Promise.all(
      chunk.map(input =>
        addDoc(collection(db, COLLECTIONS.EXPENSE_EVENTS), {
          ...input,
          timestamp: now,
          createdAt: new Date().toISOString(),
        }),
      ),
    )
  }
}