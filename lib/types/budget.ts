import type { Timestamp } from 'firebase/firestore'

// Budget dùng direct write, KHÔNG qua event sourcing
// Document ID = {userId}_{YYYY-MM}
export interface Budget {
  userId: string
  month: string         // YYYY-MM
  amount: number        // Legacy field — fallback khi spendingAmount chưa có
  spendingAmount: number // Field mới — ưu tiên đọc field này
  savingsTarget: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

// Input khi set budget
export interface BudgetInput {
  month: string
  spendingAmount: number
  savingsTarget: number
}

// Per-category budget — lưu trong user_settings với key `cat-budgets-{YYYY-MM}`
export type CategoryBudgets = Record<string, number> // { food: 500000, transport: 300000 }

// ─── Budget alert thresholds ─────────────────────────────────────────────────
export const BUDGET_ALERT_LEVELS = {
  OK: 'ok',           // < 70%
  WARNING: 'warning', // 70% – 90%
  DANGER: 'danger',   // > 90%
  OVER: 'over',       // > 100%
} as const

export type BudgetAlertLevel = (typeof BUDGET_ALERT_LEVELS)[keyof typeof BUDGET_ALERT_LEVELS]

export function getBudgetAlertLevel(used: number, total: number): BudgetAlertLevel {
  if (total <= 0) return BUDGET_ALERT_LEVELS.OK
  const pct = used / total
  if (pct >= 1) return BUDGET_ALERT_LEVELS.OVER    // FIX BUG-02: >= not > (exact 100% → OVER)
  if (pct > 0.9) return BUDGET_ALERT_LEVELS.DANGER
  if (pct > 0.7) return BUDGET_ALERT_LEVELS.WARNING
  return BUDGET_ALERT_LEVELS.OK
}