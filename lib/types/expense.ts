// ─── Category ────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { value: 'food',          label: 'Ăn uống',   icon: '🍜' },
  { value: 'transport',     label: 'Di chuyển', icon: '🚗' },
  { value: 'shopping',      label: 'Mua sắm',   icon: '🛍️' },
  { value: 'entertainment', label: 'Giải trí',  icon: '🎮' },
  { value: 'bills',         label: 'Hóa đơn',   icon: '📱' },
  { value: 'health',        label: 'Sức khỏe',  icon: '💊' },
  { value: 'education',     label: 'Học tập',   icon: '📚' },
  { value: 'other',         label: 'Khác',      icon: '📦' },
] as const

export type CategoryValue = (typeof CATEGORIES)[number]['value']

export interface Category {
  value: CategoryValue
  label: string
  icon: string
}

// ─── Expense ─────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  userId: string
  amount: number
  category: CategoryValue
  date: string        // YYYY-MM-DD, local timezone
  note: string

  // Linked transaction fields — khi có giá trị, loại khỏi budget calculation
  _debtId?: string | null
  _paymentId?: string | null
  _goalId?: string | null
  _depositId?: string | null
  _savingsMonthKey?: string | null
  _savingsDepositId?: string | null

  // Soft delete
  deleted?: boolean
  deletedAt?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Kiểm tra expense có phải linked (không tính vào budget) không */
export function isLinkedExpense(expense: Expense): boolean {
  return !!(expense._debtId || expense._goalId || expense._savingsMonthKey)
}

/** Expense từ trả nợ */
export function isDebtExpense(expense: Expense): boolean {
  return !!expense._debtId
}

/** Expense từ nạp tiền goal */
export function isGoalExpense(expense: Expense): boolean {
  return !!expense._goalId
}

/** Expense từ nạp tiền tiết kiệm — READ ONLY ở tab Expenses */
export function isSavingsExpense(expense: Expense): boolean {
  return !!expense._savingsMonthKey
}
