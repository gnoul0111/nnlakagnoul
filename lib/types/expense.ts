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

// ─── Expense ──────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  userId: string
  amount: number
  category: CategoryValue
  date: string        // YYYY-MM-DD, local timezone
  note: string
  title?: string          // optional display title (separate from note)

  // Linked transaction fields — khi có giá trị, loại khỏi budget calculation
  _debtId?: string | null
  _paymentId?: string | null
  _goalId?: string | null
  _depositId?: string | null
  _savingsMonthKey?: string | null
  _savingsDepositId?: string | null

  // Module chi tiêu chung: khoản này được "kéo" từ một khoản chung trong nhóm.
  // CHỈ là metadata liên kết — KHÔNG đổi hành vi tiêu dùng/ngân sách (vẫn là chi
  // tiêu thật của user). Dùng để: suy ra trạng thái box (Đã kéo) + đối soát khi
  // khoản gốc đổi. Xem DESIGN_NOTES "Module CHI TIÊU CHUNG".
  _groupId?: string | null
  _groupEntryId?: string | null
  _groupShareSnapshot?: number | null   // share tại thời điểm kéo (để phát hiện lệch)
  _groupEntryVersion?: string | null    // version khoản gốc lúc kéo (clientTimestamp)

  // Soft delete
  deleted?: boolean
  deletedAt?: string

  /**
   * Tombstone timestamp — set bởi replay() khi xử lý EXPENSE_DELETED.
   * Dùng để so sánh với EXPENSE_UPDATED.clientTimestamp trong conflict resolution.
   * Không bao giờ được set từ UI — chỉ replay() ghi vào đây.
   * Xem: replay.ts CONC-04 tombstone guard.
   */
  _deletedClientTimestamp?: string
  _updatedClientTimestamp?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Kiểm tra expense có phải linked (không tính vào budget) không */
export function isLinkedExpense(expense: Expense): boolean {
  return !!(expense._debtId || expense._goalId || expense._savingsMonthKey)
}

/**
 * Chi tiêu "tiêu dùng" — tính vào TỔNG CHI / ngân sách.
 *
 * GỒM: chi tiêu thường + chi tài trợ bằng nợ (`_debtId`) — vì đó là tiêu dùng
 * THẬT, chỉ khác ở chỗ được tài trợ bằng khoản vay. Việc trả nợ gốc sau đó là
 * CHUYỂN DỊCH tiền (không phải tiêu dùng mới) nên được tính riêng, không cộng
 * lại vào TỔNG CHI → tránh double count.
 *
 * KHÔNG GỒM: nạp mục tiêu (`_goalId`) và tiết kiệm (`_savingsMonthKey`) — đó là
 * chuyển tiền sang quỹ của CHÍNH MÌNH, tiền không mất đi, nên không phải tiêu dùng.
 *
 * SINGLE SOURCE OF TRUTH cho "đâu là chi tiêu được tính". Mọi nơi tính tổng chi
 * tiêu PHẢI dùng hàm này. KHÔNG kiểm tra `deleted` (call site tự lọc).
 */
export function isConsumptionExpense(expense: Expense): boolean {
  return !expense._goalId && !expense._savingsMonthKey
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