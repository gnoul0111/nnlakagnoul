import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  writeBatch,
  onSnapshot,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './config'

// ─── Collection names ────────────────────────────────────────────────────────

export const COLLECTIONS = {
  EXPENSE_EVENTS: 'expense_events',
  EXPENSE_SNAPSHOTS: 'expense_snapshots',
  // Module chi tiêu chung / nhóm gia đình (multi-user)
  GROUPS:         'groups',
  GROUP_EVENTS:   'group_events',
  BUDGETS:        'budgets',
  USERS:          'users',
  USER_SETTINGS:  'user_settings',
  USER_TAGS:      'user_tags',
  WORK_CALENDAR:  'work_calendar',
  // Legacy v4 — chỉ đọc khi import
  EXPENSES:       'expenses',
  INCOMES:        'incomes',
  DEBTS:          'debts',
  GOALS:          'goals',
  TEMPLATES:      'templates',
} as const

// ─── Generic helpers ──────────────────────────────────────────────────────────

export async function getDocument<T = DocumentData>(
  collectionName: string,
  docId: string,
): Promise<T | null> {
  const ref = doc(db, collectionName, docId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as T
}

export async function setDocument<T extends object>(
  collectionName: string,
  docId: string,
  data: T,
  merge = false,
): Promise<void> {
  const ref = doc(db, collectionName, docId)
  if (merge) {
    await setDoc(ref, data, { merge: true })
  } else {
    await setDoc(ref, data)
  }
}

export async function updateDocument<T extends object>(
  collectionName: string,
  docId: string,
  data: Partial<T>,
): Promise<void> {
  const ref = doc(db, collectionName, docId)
  await updateDoc(ref, data as DocumentData)
}

export async function deleteDocument(
  collectionName: string,
  docId: string,
): Promise<void> {
  const ref = doc(db, collectionName, docId)
  await deleteDoc(ref)
}

export async function queryDocuments<T = DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[],
): Promise<T[]> {
  const ref = collection(db, collectionName)
  const q = query(ref, ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as T)
}

// Re-export Firestore utilities dùng nhiều nơi
export {
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp,
  writeBatch,
  onSnapshot,
  db,
}
export type { Unsubscribe }
