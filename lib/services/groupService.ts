// addDoc/getDocs không re-export bởi '@/lib/firebase/firestore' → import thẳng SDK
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
  updateDocument,
} from '@/lib/firebase/firestore'
import {
  GROUP_EVENT_TYPES,
  type Group,
  type GroupMember,
  type GroupEntry,
  type GroupEventDoc,
  type GroupEventDocInput,
  type Split,
  type SplitMode,
  type EntryStatus,
} from '@/lib/types/group'
import { newGroupId, newGroupEntryId } from '@/lib/utils/id'

const CLOCK_SKEW_BUFFER_MS = 30 * 1000

// ─── Invite code ──────────────────────────────────────────────────────────────
// Mã ngắn dễ đọc (bỏ ký tự gây nhầm: 0/O, 1/I/L). 6 ký tự.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateInviteCode(len = 6): string {
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  let out = ''
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length]
  return out
}

// ─── Group (membership doc) ─────────────────────────────────────────────────

/** Tạo nhóm mới (client-side). Người tạo là owner + thành viên đầu tiên. */
export async function createGroup(
  owner: { uid: string; name: string; email: string },
  name: string,
): Promise<Group> {
  const id        = newGroupId()
  const now       = new Date().toISOString()
  const ownerMember: GroupMember = {
    uid: owner.uid, name: owner.name, email: owner.email, joinedAt: now,
  }

  const group: Group = {
    id,
    name: name.trim() || 'Nhóm gia đình',
    ownerUid:   owner.uid,
    memberUids: [owner.uid],
    members:    { [owner.uid]: ownerMember },
    inviteCode: generateInviteCode(),
    createdAt:  now,
  }

  await setDocument(COLLECTIONS.GROUPS, id, group)
  return group
}

export async function getGroup(groupId: string): Promise<Group | null> {
  return getDocument<Group>(COLLECTIONS.GROUPS, groupId)
}

/** Đổi tên nhóm (client-side; rules cho owner sửa field thường, khóa memberUids/ownerUid). */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  await updateDocument(COLLECTIONS.GROUPS, groupId, { name: name.trim() || 'Nhóm gia đình' })
}

/** Các nhóm user đang là thành viên. */
export async function getUserGroups(uid: string): Promise<Group[]> {
  const ref = collection(db, COLLECTIONS.GROUPS)
  const q   = query(ref, where('memberUids', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as Group)
}

// ─── Group events (append-only) ───────────────────────────────────────────────

export async function appendGroupEvent(input: GroupEventDocInput): Promise<string> {
  const ref = collection(db, COLLECTIONS.GROUP_EVENTS)
  const docRef = await addDoc(ref, {
    ...input,
    clientTimestamp: input.clientTimestamp ?? new Date().toISOString(),
    timestamp: Timestamp.now(),
    createdAt: input.createdAt ?? new Date().toISOString(),
  })
  return docRef.id
}

/** Tất cả event của 1 nhóm mà user được phép thấy (uid ∈ participants). */
export async function getGroupEvents(groupId: string, uid: string): Promise<GroupEventDoc[]> {
  const ref = collection(db, COLLECTIONS.GROUP_EVENTS)
  const q = query(
    ref,
    where('groupId', '==', groupId),
    where('participants', 'array-contains', uid),
    orderBy('timestamp', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GroupEventDoc)
}

/**
 * TẤT CẢ event của user trên MỌI nhóm (1 query) — để đếm "khoản chờ" cho badge.
 * Chỉ array-contains (không orderBy) → dùng index mặc định, KHÔNG cần composite index.
 */
export async function getAllUserGroupEvents(uid: string): Promise<GroupEventDoc[]> {
  const ref = collection(db, COLLECTIONS.GROUP_EVENTS)
  const q = query(ref, where('participants', 'array-contains', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GroupEventDoc)
}

/** Incremental — chỉ event mới hơn lastSync (lùi 30s tránh clock skew). */
export async function getNewGroupEventsSince(
  groupId: string,
  uid: string,
  lastSync: number,
): Promise<GroupEventDoc[]> {
  const syncPoint = new Timestamp(Math.floor((lastSync - CLOCK_SKEW_BUFFER_MS) / 1000), 0)
  const ref = collection(db, COLLECTIONS.GROUP_EVENTS)
  const q = query(
    ref,
    where('groupId', '==', groupId),
    where('participants', 'array-contains', uid),
    where('timestamp', '>', syncPoint),
    orderBy('timestamp', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as GroupEventDoc)
}

// ─── Entry mutations (build event + append) ───────────────────────────────────

export interface AddEntryInput {
  groupId:   string
  payerUid:  string
  total:     number
  note:      string
  date:      string
  splitMode: SplitMode
  splits:    Split[]
}

function deriveParticipants(payerUid: string, createdByUid: string, splits: Split[]): string[] {
  return Array.from(new Set([payerUid, createdByUid, ...splits.map(s => s.uid)]))
}

/** Tạo khoản chung. Trả về GroupEntry (để optimistic update). */
export async function addGroupEntry(
  actorUid: string,
  input: AddEntryInput,
): Promise<GroupEntry> {
  const id = newGroupEntryId()
  const participants = deriveParticipants(input.payerUid, actorUid, input.splits)

  const entry: GroupEntry = {
    id,
    groupId:      input.groupId,
    payerUid:     input.payerUid,
    total:        input.total,
    note:         input.note,
    date:         input.date,
    splitMode:    input.splitMode,
    splits:       input.splits,
    participants,
    createdByUid: actorUid,
    deleted:      false,
  }

  await appendGroupEvent({
    groupId:      input.groupId,
    actorUid,
    participants,
    eventType:    GROUP_EVENT_TYPES.GROUP_ENTRY_ADDED,
    createdAt:    new Date().toISOString(),
    data:         entry,
  })

  return entry
}

/**
 * Sửa khoản. CHỈ người tạo (kiểm ở UI/service — xem DESIGN_NOTES known-limit).
 * participants của event = hợp của cũ + mới → người bị gỡ vẫn nhận được update
 * để client của họ đối soát ("bạn đã bị gỡ khỏi khoản").
 */
export async function updateGroupEntry(
  actorUid: string,
  next: GroupEntry,
  prevParticipants: string[],
): Promise<void> {
  const participants = Array.from(new Set([...prevParticipants, ...next.participants]))
  await appendGroupEvent({
    groupId:   next.groupId,
    actorUid,
    participants,
    eventType: GROUP_EVENT_TYPES.GROUP_ENTRY_UPDATED,
    createdAt: new Date().toISOString(),
    data: {
      id:        next.id,
      payerUid:  next.payerUid,
      total:     next.total,
      note:      next.note,
      date:      next.date,
      splitMode: next.splitMode,
      splits:    next.splits,
      participants: next.participants,
    },
  })
}

export async function deleteGroupEntry(actorUid: string, entry: GroupEntry): Promise<void> {
  await appendGroupEvent({
    groupId:   entry.groupId,
    actorUid,
    participants: entry.participants,
    eventType: GROUP_EVENT_TYPES.GROUP_ENTRY_DELETED,
    createdAt: new Date().toISOString(),
    data: { id: entry.id },
  })
}

/**
 * Set trạng thái xử lý CỦA CHÍNH actor (pending/done/skipped) — công khai trong nhóm.
 * Rules đảm bảo actor chỉ set được status của uid == mình.
 */
export async function setEntryStatus(
  actorUid: string,
  entry: GroupEntry,
  status: EntryStatus,
): Promise<void> {
  await appendGroupEvent({
    groupId:      entry.groupId,
    actorUid,
    participants: entry.participants,
    eventType:    GROUP_EVENT_TYPES.GROUP_ENTRY_STATUS_SET,
    createdAt:    new Date().toISOString(),
    data: { id: entry.id, uid: actorUid, status },
  })
}
