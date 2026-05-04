import type { Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'
import type { Budget } from '@/lib/types/budget'
import type { Debt } from '@/lib/types/debt'
import type { Goal } from '@/lib/types/goal'
import type { SavingsPlan } from '@/lib/types/savings'
import { getBudgetAlertLevel, type BudgetAlertLevel } from '@/lib/types/budget'

// ─── Filter helpers ───────────────────────────────────────────────────────────

/** Spending expenses: loại TẤT CẢ linked expenses — dùng cho budget */
export function getSpendingExpenses(
  expenses: Expense[],
  monthKey: string,
): Expense[] {
  return expenses.filter(
    e =>
      !e.deleted &&
      e.date.startsWith(monthKey) &&
      !e._debtId &&
      !e._goalId &&
      !e._savingsMonthKey,
  )
}

/** Tổng chi tiêu thực (không linked) trong tháng */
export function sumSpending(expenses: Expense[], monthKey: string): number {
  return getSpendingExpenses(expenses, monthKey).reduce((sum, e) => sum + e.amount, 0)
}

/** Tổng thu nhập trong tháng */
export function sumIncome(incomes: Income[], monthKey: string): number {
  return incomes
    .filter(i => !i.deleted && i.month === monthKey)
    .reduce((sum, i) => sum + i.amount, 0)
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
  const budgetAmount = budget
    ? (budget.spendingAmount ?? budget.amount ?? 0)
    : 0
  const savingsTarget = budget?.savingsTarget ?? 0
  const usedAmount = sumSpending(expenses, monthKey)
  const remainingAmount = Math.max(0, budgetAmount - usedAmount)
  const usedPercent =
    budgetAmount > 0 ? Math.round((usedAmount / budgetAmount) * 100) : 0
  const alertLevel = getBudgetAlertLevel(usedAmount, budgetAmount)

  return {
    budgetAmount,
    usedAmount,
    remainingAmount,
    usedPercent,
    alertLevel,
    savingsTarget,
  }
}

// ─── Per-category spending ────────────────────────────────────────────────────

export interface CategorySpending {
  category: string
  amount: number
  count: number
  percent: number
}

export function calcCategorySpending(
  expenses: Expense[],
  monthKey: string,
): CategorySpending[] {
  const spending = getSpendingExpenses(expenses, monthKey)
  const total = spending.reduce((sum, e) => sum + e.amount, 0)
  const map = new Map<string, { amount: number; count: number }>()

  for (const e of spending) {
    const existing = map.get(e.category) ?? { amount: 0, count: 0 }
    map.set(e.category, {
      amount: existing.amount + e.amount,
      count: existing.count + 1,
    })
  }

  return Array.from(map.entries())
    .map(([category, { amount, count }]) => ({
      category,
      amount,
      count,
      percent: total > 0 ? Math.round((amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
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
  const totalIncome = sumIncome(incomes, monthKey)
  const spendingTotal = sumSpending(expenses, monthKey)

  // Tiền trả nợ — từ debt payments trong tháng (không từ linked expenses)
  const debtPaidTotal = debts
    .filter(d => !d.deleted)
    .flatMap(d => d.payments)
    .filter(p => p.date.startsWith(monthKey))
    .reduce((sum, p) => sum + p.amount, 0)

  // Tiền nạp goal — từ goal deposits trong tháng
  const goalSavedTotal = goals
    .filter(g => !g.deleted)
    .flatMap(g => g.deposits)
    .filter(d => d.date.startsWith(monthKey))
    .reduce((sum, d) => sum + d.amount, 0)

  // Tiền tiết kiệm — từ expenses có _savingsMonthKey (expense đã bị filter khỏi spending)
  const savingsTotal = expenses
    .filter(
      e =>
        !e.deleted &&
        e.date.startsWith(monthKey) &&
        !!e._savingsMonthKey,
    )
    .reduce((sum, e) => sum + e.amount, 0)

  const totalCashOut = spendingTotal + debtPaidTotal + goalSavedTotal + savingsTotal
  const netBalance = totalIncome - totalCashOut

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
    const item = spending.find(s => s.category === category)
    const used = item?.amount ?? 0
    const percent = Math.round((used / budget) * 100)
    const alertLevel = getBudgetAlertLevel(used, budget)
    if (alertLevel !== 'ok') {
      alerts.push({ category, used, budget, percent, alertLevel })
    }
  }

  return alerts.sort((a, b) => b.percent - a.percent)
}
