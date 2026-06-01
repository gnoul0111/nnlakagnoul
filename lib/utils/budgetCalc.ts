import { isConsumptionExpense, type Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'
import type { Budget } from '@/lib/types/budget'
import type { Debt } from '@/lib/types/debt'
import type { Goal } from '@/lib/types/goal'
import type { SavingsPlan } from '@/lib/types/savings'
import { getBudgetAlertLevel, type BudgetAlertLevel } from '@/lib/types/budget'

// ─── Filter helpers ───────────────────────────────────────────────────────────

/** Spending expenses: loại TẤT CẢ linked expenses — dùng cho budget */
export function getConsumptionExpenses(
  expenses: Expense[],
  monthKey: string,
): Expense[] {
  return expenses.filter(
    e => !e.deleted && e.date.startsWith(monthKey) && isConsumptionExpense(e),
  )
}

/** Tổng chi tiêu thực (không linked) trong tháng
 *
 *  FIX float guard: VND is integer-only by design, but Math.round protects
 *  against float creep from CSV imports or Firestore parsing edge cases.
 */
export function sumSpending(expenses: Expense[], monthKey: string): number {
  return Math.round(
    getConsumptionExpenses(expenses, monthKey).reduce((sum, e) => sum + e.amount, 0),
  )
}

/** Tổng thu nhập trong tháng */
export function sumIncome(incomes: Income[], monthKey: string): number {
  return Math.round(
    incomes
      .filter(i => !i.deleted && i.month === monthKey)
      .reduce((sum, i) => sum + i.amount, 0),
  )
}

// ─── Budget calculation ───────────────────────────────────────────────────────

export interface BudgetSummary {
  budgetAmount: number    // spendingAmount (hoặc amount fallback)
  usedAmount: number      // chi tiêu thực (filtered)
  remainingAmount: number
  usedPercent: number
  alertLevel: BudgetAlertLevel
  savingsTarget: number
}

export function calcBudgetSummary(
  expenses: Expense[],
  budget: Budget | null,
  monthKey: string,
): BudgetSummary {
  const budgetAmount  = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0
  const savingsTarget = budget?.savingsTarget ?? 0
  const usedAmount    = sumSpending(expenses, monthKey)
  const remainingAmount = Math.max(0, budgetAmount - usedAmount)

  // NOTE: usedPercent is NOT clamped at 100 — allows displaying 120%, 150%, etc.
  // for OVER state. UI components (ProgressBar) apply their own visual clamp.
  const usedPercent =
    budgetAmount > 0 ? Math.round((usedAmount / budgetAmount) * 100) : 0

  const alertLevel = getBudgetAlertLevel(usedAmount, budgetAmount)

  return { budgetAmount, usedAmount, remainingAmount, usedPercent, alertLevel, savingsTarget }
}

// ─── Per-category spending ────────────────────────────────────────────────────

export interface CategorySpending {
  category: string
  amount: number
  count: number
  percent: number
}

/**
 * FIX BUG-01 — Percent distribution uses the Largest-Remainder (Hamilton) method.
 *
 * Problem: independent Math.round per category causes percents to NOT sum to 100.
 * Classic example: 3 equal categories → 33.33% each → rounds to 33+33+33 = 99.
 *
 * Fix: floor all percents first, then distribute the remaining points one-by-one
 * to the categories with the largest fractional remainders. Guarantees sum = 100.
 */
export function calcCategorySpending(
  expenses: Expense[],
  monthKey: string,
): CategorySpending[] {
  const spending = getConsumptionExpenses(expenses, monthKey)
  const total    = Math.round(spending.reduce((sum, e) => sum + e.amount, 0))

  const map = new Map<string, { amount: number; count: number }>()
  for (const e of spending) {
    const prev = map.get(e.category) ?? { amount: 0, count: 0 }
    map.set(e.category, { amount: prev.amount + e.amount, count: prev.count + 1 })
  }

  const items = Array.from(map.entries())
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount)

  if (total === 0) return items.map(i => ({ ...i, percent: 0 }))

  // Largest-remainder: floor each exact percent, collect fractional remainders
  const withRemainders = items.map(item => {
    const exact     = (item.amount / total) * 100
    const floored   = Math.floor(exact)
    const remainder = exact - floored
    return { ...item, floored, remainder }
  })

  // Distribute leftover percentage points to the largest remainders
  const flooredSum   = withRemainders.reduce((s, i) => s + i.floored, 0)
  let   toDistribute = 100 - flooredSum

  const sorted = [...withRemainders].sort((a, b) => b.remainder - a.remainder)
  for (let i = 0; i < sorted.length && toDistribute > 0; i++) {
    sorted[i].floored++
    toDistribute--
  }

  // Re-apply final percents, preserving original amount-desc sort
  const percentMap = new Map(sorted.map(s => [s.category, s.floored]))
  return items.map(item => ({
    category: item.category,
    amount:   item.amount,
    count:    item.count,
    percent:  percentMap.get(item.category) ?? 0,
  }))
}

// ─── Cashflow calculation ─────────────────────────────────────────────────────
/**
 * Cashflow thực tế = tổng tiền thực sự ra khỏi ví
 * QUAN TRỌNG: không dùng linked expenses để tính nợ/goal/savings
 * mà dùng thẳng từ source để tránh double count
 */

export interface CashflowSummary {
  totalIncome: number
  spendingTotal: number    // chi tiêu thường (filtered)
  debtPaidTotal: number    // từ debt.payments
  goalSavedTotal: number   // từ goal.deposits
  savingsTotal: number     // từ expenses có _savingsMonthKey
  totalCashOut: number     // spendingTotal + debtPaid + goalSaved + savings
  netBalance: number       // totalIncome - totalCashOut
}

export function calcCashflow(
  expenses: Expense[],
  incomes: Income[],
  debts: Debt[],
  goals: Goal[],
  savingsPlan: SavingsPlan | null,
  monthKey: string,
): CashflowSummary {
  const totalIncome   = sumIncome(incomes, monthKey)
  const spendingTotal = sumSpending(expenses, monthKey)

  // Tiền trả nợ — từ debt.payments trong tháng (không từ linked expenses → tránh double count)
  const debtPaidTotal = Math.round(
    debts
      .filter(d => !d.deleted)
      .flatMap(d => d.payments)
      .filter(p => p.date.startsWith(monthKey))
      .reduce((sum, p) => sum + p.amount, 0),
  )

  // Tiền nạp goal — từ goal.deposits trong tháng
  const goalSavedTotal = Math.round(
    goals
      .filter(g => !g.deleted)
      .flatMap(g => g.deposits)
      .filter(d => d.date.startsWith(monthKey))
      .reduce((sum, d) => sum + d.amount, 0),
  )

  // Tiền tiết kiệm — từ expenses có _savingsMonthKey
  // (đã bị filter khỏi spendingTotal nên không double count)
  const savingsTotal = Math.round(
    expenses
      .filter(
        e => !e.deleted && e.date.startsWith(monthKey) && !!e._savingsMonthKey,
      )
      .reduce((sum, e) => sum + e.amount, 0),
  )

  const totalCashOut = spendingTotal + debtPaidTotal + goalSavedTotal + savingsTotal
  const netBalance   = totalIncome - totalCashOut

  return {
    totalIncome,
    spendingTotal,
    debtPaidTotal,
    goalSavedTotal,
    savingsTotal,
    totalCashOut,
    netBalance,
  }
}

// ─── Category budget alert ────────────────────────────────────────────────────

export interface CategoryAlert {
  category: string
  used: number
  budget: number
  percent: number
  alertLevel: BudgetAlertLevel
}

export function calcCategoryAlerts(
  expenses: Expense[],
  categoryBudgets: Record<string, number>,
  monthKey: string,
): CategoryAlert[] {
  const spending = calcCategorySpending(expenses, monthKey)
  const alerts: CategoryAlert[] = []

  for (const [category, budget] of Object.entries(categoryBudgets)) {
    if (budget <= 0) continue
    const item     = spending.find(s => s.category === category)
    const used     = item?.amount ?? 0
    const percent  = Math.round((used / budget) * 100)
    const alertLevel = getBudgetAlertLevel(used, budget)
    if (alertLevel !== 'ok') {
      alerts.push({ category, used, budget, percent, alertLevel })
    }
  }

  return alerts.sort((a, b) => b.percent - a.percent)
}
