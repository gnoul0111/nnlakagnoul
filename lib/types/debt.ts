export const DEBT_TYPES = {
  LEND:   'lend',    // Mình cho người khác vay
  BORROW: 'borrow',  // Mình đang nợ người khác
} as const

export type DebtType = (typeof DEBT_TYPES)[keyof typeof DEBT_TYPES]

export interface DebtPayment {
  id: string
  amount: number
  date: string    // YYYY-MM-DD
}

export interface Debt {
  id: string
  userId: string
  name: string          // Tên người liên quan
  amount: number        // Tổng số nợ gốc
  type: DebtType
  date?: string | null   // YYYY-MM-DD — ngày phát sinh khoản nợ/vay (optional cho data cũ)
  dueDate: string | null // YYYY-MM-DD, null nếu không có hạn
  note: string
  paidAmount: number    // KHÔNG tin tưởng — luôn tính lại từ sum(payments)
  payments: DebtPayment[]
  deleted: boolean
  createdAt: number     // Unix seconds

  // Khoản nợ phát sinh từ "kéo về sổ" của module nhóm → KHÔNG cho xóa tay
  // (chỉ gỡ qua "Hoàn tác" bên nhóm) để tránh lệch dữ liệu.
  _groupId?: string | null
  _groupEntryId?: string | null

  _deletedClientTimestamp?: string
  _updatedClientTimestamp?: string
}

/** Khoản nợ này phát sinh từ module nhóm (kéo về sổ) → khóa xóa tay. */
export function isGroupLinkedDebt(debt: Pick<Debt, '_groupEntryId'>): boolean {
  return !!debt._groupEntryId
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function computePaidAmount(debt: Debt): number {
  return debt.payments.reduce((sum, p) => sum + p.amount, 0)
}

export function computeRemaining(debt: Debt): number {
  return Math.max(0, debt.amount - computePaidAmount(debt))
}

export function isDebtSettled(debt: Debt): boolean {
  return computeRemaining(debt) <= 0
}

export function isDebtOverdue(debt: Debt, today: string): boolean {
  if (!debt.dueDate) return false
  return !isDebtSettled(debt) && debt.dueDate < today
}

export function isDebtUpcoming(debt: Debt, today: string): boolean {
  if (isDebtSettled(debt)) return false
  if (!debt.dueDate) return false
  const t = new Date(today)
  const d = new Date(debt.dueDate)
  const diff = Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 && diff <= 7
}