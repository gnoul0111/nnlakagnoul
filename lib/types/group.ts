import type { Timestamp } from 'firebase/firestore'

// ════════════════════════════════════════════════════════════════════════════
// MODULE CHI TIÊU CHUNG / NHÓM GIA ĐÌNH
//
// Đây là dữ liệu NHIỀU NGƯỜI DÙNG CHUNG đầu tiên trong app (app vốn 1 người 1 sổ).
// Đọc DESIGN_NOTES.local.md mục "Module CHI TIÊU CHUNG" trước khi sửa.
//
// Mô hình quyền xem: theo TỪNG KHOẢN. Mỗi khoản có `participants[]`. Chỉ người
// trong `participants` mới đọc được khoản đó (gate ở Firestore rules bằng
// `request.auth.uid in resource.data.participants`). Người ngoài không thấy.
// ════════════════════════════════════════════════════════════════════════════

// ─── Group (doc membership — plain, mutable; KHÔNG event-sourced) ────────────
//
// Group chỉ là "danh bạ thành viên + mã mời" — neo cho access control.
// Phần SỔ CHUNG (các khoản) mới là event-sourced (group_events).

export interface GroupMember {
  uid:      string
  name:     string   // denormalized — vì rules chặn đọc users/{uid} của người khác
  email:    string
  joinedAt: string   // ISO
}

export interface Group {
  id:         string
  name:       string
  ownerUid:   string
  memberUids: string[]                       // dùng cho membership check + query
  members:    Record<string, GroupMember>    // hồ sơ denormalized từng thành viên
  inviteCode: string                          // mã mời ngắn (uppercase)
  createdAt:  string                          // ISO
}

// ─── Split ───────────────────────────────────────────────────────────────────

export type SplitMode = 'equal' | 'percent' | 'custom'

export interface Split {
  uid:    string
  amount: number   // VND tuyệt đối (đã quy đổi từ % nếu cần)
}

// Trạng thái xử lý phần chia của MỖI người, hiển thị CÔNG KHAI trong nhóm tham gia.
//  pending = Chờ; done = Đã xử lý (đã kéo về sổ — CÁCH kéo thì riêng tư); skipped = Bỏ qua.
// Mỗi người chỉ đổi được trạng thái CỦA CHÍNH MÌNH (gate ở rules: data.uid == auth.uid).
export type EntryStatus = 'pending' | 'done' | 'skipped'

// ─── Group Entry (state — replay từ group_events) ─────────────────────────────

export interface GroupEntry {
  id:           string
  groupId:      string
  payerUid:     string          // người đã trả tiền
  total:        number          // tổng khoản
  note:         string
  date:         string          // YYYY-MM-DD (local) — dùng helper date.ts
  splitMode:    SplitMode
  splits:       Split[]         // tổng splits.amount === total
  participants: string[]        // uid được thấy khoản (gồm payer + creator)
  createdByUid: string          // CHỈ người này được sửa/xóa
  // Trạng thái xử lý CÔNG KHAI theo từng người (thiếu uid = 'pending').
  statuses?:    Record<string, EntryStatus>
  deleted:      boolean

  _updatedClientTimestamp?: string
  _deletedClientTimestamp?: string
}

// ─── Group Events (append-only, event-sourced) ────────────────────────────────

export const GROUP_EVENT_TYPES = {
  GROUP_ENTRY_ADDED:      'GROUP_ENTRY_ADDED',
  GROUP_ENTRY_UPDATED:    'GROUP_ENTRY_UPDATED',
  GROUP_ENTRY_DELETED:    'GROUP_ENTRY_DELETED',
  GROUP_ENTRY_STATUS_SET: 'GROUP_ENTRY_STATUS_SET',  // mỗi người set trạng thái CỦA MÌNH
} as const

export type GroupEventType = (typeof GROUP_EVENT_TYPES)[keyof typeof GROUP_EVENT_TYPES]

export interface GroupEventDoc {
  id:        string
  groupId:   string
  actorUid:  string          // người tạo event (rules: == request.auth.uid)
  participants: string[]     // ai đọc được event này (= participants của khoản)
  eventType: GroupEventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data:      Record<string, any>
  timestamp: Timestamp       // server time — incremental sync
  clientTimestamp?: string   // authoritative LWW key (như expense_events)
  createdAt: string          // ISO
}

export type GroupEventDocInput = Omit<GroupEventDoc, 'id' | 'timestamp'>

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Phần chia của 1 user trong khoản (0 nếu không tham gia chia). */
export function shareOf(entry: GroupEntry, uid: string): number {
  return entry.splits.find(s => s.uid === uid)?.amount ?? 0
}

/** Trạng thái xử lý của 1 user (mặc định 'pending'). */
export function statusOf(entry: GroupEntry, uid: string): EntryStatus {
  return entry.statuses?.[uid] ?? 'pending'
}

/** User có nằm trong khoản (thấy được) không. */
export function isParticipant(entry: GroupEntry, uid: string): boolean {
  return entry.participants.includes(uid)
}

/** Tổng các phần chia — phải khớp total. */
export function splitsTotal(splits: Split[]): number {
  return splits.reduce((s, x) => s + x.amount, 0)
}

/** Splits có hợp lệ không: khớp total (sai số ≤ 1đ do làm tròn) và không âm. */
export function isSplitsValid(splits: Split[], total: number): boolean {
  if (splits.some(s => s.amount < 0)) return false
  return Math.abs(splitsTotal(splits) - total) <= 1
}

// ─── Build splits theo từng mode ──────────────────────────────────────────────
//
// equal:   chia đều, phần dư (do làm tròn) dồn vào người ĐẦU TIÊN.
// percent: raw[uid] = phần trăm (0..100) → quy ra tiền, dư dồn người đầu.
// custom:  raw[uid] = số tiền tuyệt đối (caller tự đảm bảo khớp total).

export function buildSplits(
  total: number,
  mode: SplitMode,
  uids: string[],
  raw?: Record<string, number>,
): Split[] {
  if (uids.length === 0) return []

  if (mode === 'equal') {
    const base = Math.floor(total / uids.length)
    const rem  = total - base * uids.length
    return uids.map((uid, i) => ({ uid, amount: base + (i === 0 ? rem : 0) }))
  }

  if (mode === 'percent') {
    const pct = raw ?? {}
    let allocated = 0
    const splits = uids.map((uid, i) => {
      const amount = i === uids.length - 1
        ? total - allocated                                 // người cuối nhận phần dư → khớp tuyệt đối
        : Math.round((total * (pct[uid] ?? 0)) / 100)
      allocated += amount
      return { uid, amount }
    })
    return splits
  }

  // custom
  const custom = raw ?? {}
  return uids.map(uid => ({ uid, amount: Math.max(0, Math.round(custom[uid] ?? 0)) }))
}
