import { addExpense, updateExpense, deleteExpense } from './expenseService'
import { addDebt, deleteDebt } from './debtService'
import { setEntryStatus } from './groupService'
import { newDebtId } from '@/lib/utils/id'
import { shareOf, type GroupEntry } from '@/lib/types/group'
import type { Expense, CategoryValue } from '@/lib/types/expense'

// ════════════════════════════════════════════════════════════════════════════
// CẦU NỐI box (nhóm) ↔ sổ riêng (cá nhân).
//
// Nguyên tắc (xem DESIGN_NOTES): bên nhóm KHÔNG ghi được sổ người khác. Mỗi user
// tự kéo phần MÌNH về sổ. "Kéo" tạo bút toán cá nhân (riêng tư) + set trạng thái
// 'done' công khai trên khoản. CÁCH kéo (chi tiêu/nợ) là riêng tư.
// ════════════════════════════════════════════════════════════════════════════

// Khoản nhóm kéo về mặc định gợi ý category 'food' (đa số là đi chợ/ăn uống),
// nhưng user chọn lại được ngay lúc kéo (xem CategoryPickerModal ở trang nhóm).
const DEFAULT_CATEGORY: CategoryValue = 'food'

function entryNote(entry: GroupEntry, groupName: string): string {
  return `[Nhóm] ${entry.note || groupName}`
}

/** Tìm bút toán cá nhân đã kéo từ 1 khoản nhóm (nếu có). */
export function findLinkedExpense(entryId: string, expenses: Expense[]): Expense | null {
  return expenses.find(e => !e.deleted && e._groupEntryId === entryId) ?? null
}

/** Ghi phần của mình thành CHI TIÊU thường. */
export async function pullAsExpense(
  uid: string, entry: GroupEntry, groupName: string, category: CategoryValue = DEFAULT_CATEGORY,
): Promise<void> {
  const share = shareOf(entry, uid)
  await addExpense(uid, {
    amount: share,
    category,
    date: entry.date,
    note: entryNote(entry, groupName),
    _groupId: entry.groupId,
    _groupEntryId: entry.id,
    _groupShareSnapshot: share,
    _groupEntryVersion: entry._updatedClientTimestamp ?? null,
  })
  await setEntryStatus(uid, entry, 'done')
}

/**
 * Ghi phần của mình thành NỢ (mình nợ người trả).
 * Model FULL: tạo debt borrow + expense liên kết (_debtId) → vừa vào TỔNG CHI
 * (tiêu dùng tài trợ bằng nợ) vừa theo dõi trả nợ. KHÔNG double count.
 */
export async function pullAsDebt(
  uid: string, entry: GroupEntry, groupName: string, payerName: string, category: CategoryValue = DEFAULT_CATEGORY,
): Promise<void> {
  const share = shareOf(entry, uid)
  const debtId = newDebtId()
  await addDebt(uid, {
    id: debtId,
    name: payerName,
    amount: share,
    type: 'borrow',
    date: entry.date,
    note: entryNote(entry, groupName),
    _groupId: entry.groupId,
    _groupEntryId: entry.id,
  })
  await addExpense(uid, {
    amount: share,
    category,
    date: entry.date,
    note: entryNote(entry, groupName),
    _debtId: debtId,
    _groupId: entry.groupId,
    _groupEntryId: entry.id,
    _groupShareSnapshot: share,
    _groupEntryVersion: entry._updatedClientTimestamp ?? null,
  })
  await setEntryStatus(uid, entry, 'done')
}

/** Hoàn tác: xóa bút toán cá nhân (+ debt liên kết nếu có) → trạng thái về Chờ. */
export async function undoPull(uid: string, entry: GroupEntry, linked: Expense | null): Promise<void> {
  if (linked) {
    await deleteExpense(uid, linked.id)
    if (linked._debtId) await deleteDebt(uid, linked._debtId)
  }
  await setEntryStatus(uid, entry, 'pending')
}

/** Bỏ qua: không ghi gì vào sổ, chỉ đánh dấu công khai 'skipped'. */
export async function skipEntry(uid: string, entry: GroupEntry): Promise<void> {
  await setEntryStatus(uid, entry, 'skipped')
}

/** Hoàn tác bỏ qua → về Chờ. */
export async function unskipEntry(uid: string, entry: GroupEntry): Promise<void> {
  await setEntryStatus(uid, entry, 'pending')
}

/**
 * Đối soát: khoản gốc đổi share → cập nhật lại bút toán cá nhân cho khớp.
 * Cập nhật cả amount lẫn snapshot/version (để hết báo lệch). Nếu có debt liên
 * kết, cập nhật luôn amount của debt.
 */
export async function resyncShare(uid: string, entry: GroupEntry, linked: Expense): Promise<void> {
  const share = shareOf(entry, uid)
  await updateExpense(uid, linked.id, {
    amount: share,
    _groupShareSnapshot: share,
    _groupEntryVersion: entry._updatedClientTimestamp ?? null,
  })
  if (linked._debtId) {
    const { updateDebt } = await import('./debtService')
    await updateDebt(uid, linked._debtId, { amount: share })
  }
}
