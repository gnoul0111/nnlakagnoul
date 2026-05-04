export interface GoalDeposit {
  id: string
  amount: number
  date: string    // YYYY-MM-DD
  note: string
}

export interface Goal {
  id: string
  userId: string
  name: string
  icon: string    // Emoji icon
  targetAmount: number
  // currentAmount KHÔNG tin tưởng — luôn tính lại từ sum(deposits)
  currentAmount: number
  deadline: string       // YYYY-MM-DD
  deposits: GoalDeposit[]
  deleted: boolean
  createdTimestamp: number // Unix seconds
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Tính currentAmount thực từ deposits (không dùng field currentAmount) */
export function computeGoalBalance(goal: Goal): number {
  return goal.deposits.reduce((sum, d) => sum + d.amount, 0)
}

/** % tiến độ */
export function computeGoalProgress(goal: Goal): number {
  if (goal.targetAmount <= 0) return 0
  return Math.min(computeGoalBalance(goal) / goal.targetAmount, 1)
}

/** Số ngày còn đến deadline */
export function daysUntilDeadline(goal: Goal, today: string): number | null {
  if (!goal.deadline) return null
  const t = new Date(today)
  const d = new Date(goal.deadline)
  const days = Math.ceil((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
  return isNaN(days) ? null : days
}