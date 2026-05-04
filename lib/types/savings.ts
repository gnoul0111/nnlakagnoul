export interface SavingsAllocation {
  id: string
  goalId: string
  amount: number
  date: string
}

export interface SavingsDeposit {
  id: string
  amount: number
  date: string        // YYYY-MM-DD
  note: string
  allocations: SavingsAllocation[]
}

export const SAVINGS_WITHDRAWAL_TYPES = {
  SPEND: 'spend',   // Rút để tiêu
  GOAL: 'goal',     // Rút để chuyển vào mục tiêu
} as const

export type SavingsWithdrawalType =
  (typeof SAVINGS_WITHDRAWAL_TYPES)[keyof typeof SAVINGS_WITHDRAWAL_TYPES]

export interface SavingsWithdrawal {
  id: string
  amount: number
  date: string        // YYYY-MM-DD
  reason: string
  type: SavingsWithdrawalType
  goalId?: string | null
  goalDepositId?: string | null // Link sang goal deposit (tạo khi withdraw to goal)
}

export interface SavingsPlan {
  monthKey: string    // YYYY-MM
  userId: string
  targetAmount: number
  deposits: SavingsDeposit[]
  withdrawals: SavingsWithdrawal[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tổng đã nạp */
export function computeTotalDeposited(plan: SavingsPlan): number {
  return plan.deposits.reduce((sum, d) => sum + d.amount, 0)
}

/** Tổng đã rút */
export function computeTotalWithdrawn(plan: SavingsPlan): number {
  return plan.withdrawals.reduce((sum, w) => sum + w.amount, 0)
}

/** Số dư = tổng nạp - tổng rút */
export function computeBalance(plan: SavingsPlan): number {
  return computeTotalDeposited(plan) - computeTotalWithdrawn(plan)
}

/** % tiến độ tiết kiệm */
export function computeSavingsProgress(plan: SavingsPlan): number {
  if (plan.targetAmount <= 0) return 0
  return Math.min(computeTotalDeposited(plan) / plan.targetAmount, 1)
}
