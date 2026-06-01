/**
 * QA Test Suite — Financial Calculation Logic
 *
 * Covers:
 *   - budgetCalc.ts  : sumSpending, sumIncome, calcBudgetSummary,
 *                      calcCategorySpending, calcCashflow, calcCategoryAlerts
 *   - budget.ts      : getBudgetAlertLevel
 *
 * All amounts are VND integers (no decimals by design).
 * Tests deliberately exercise:
 *   - Floating-point accumulation edge cases
 *   - Rounding / percent distribution
 *   - Boundary thresholds (0%, 70%, 90%, 100%, overflow)
 *   - Empty / null / zero inputs
 *   - Linked-expense exclusion (debt / goal / savings)
 *   - Double-count guard in cashflow
 */

import {
  getConsumptionExpenses,
  sumSpending,
  sumIncome,
  calcBudgetSummary,
  calcCategorySpending,
  calcCashflow,
  calcCategoryAlerts,
} from '../budgetCalc'
import { getBudgetAlertLevel } from '@/lib/types/budget'
import type { Expense, CategoryValue } from '@/lib/types/expense'
import type { Income }  from '@/lib/types/income'
import type { Budget }  from '@/lib/types/budget'
import type { Debt }    from '@/lib/types/debt'
import type { Goal }    from '@/lib/types/goal'
import type { Timestamp } from 'firebase/firestore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTimestamp(ms = 0): Timestamp {
  return {
    toMillis: () => ms,
    toDate:   () => new Date(ms),
    seconds:  Math.floor(ms / 1000),
    nanoseconds: 0,
  } as unknown as Timestamp
}

let _id = 0
function exp(
  amount: number,
  date: string,
  category: CategoryValue = 'food',
  overrides: Partial<Expense> = {},
): Expense {
  return {
    id: `exp_${++_id}`,
    userId: 'u1',
    amount,
    category,
    date,
    note: '',
    deleted: false,
    ...overrides,
  }
}

function inc(amount: number, month: string, date?: string): Income {
  return {
    id: `inc_${++_id}`,
    userId: 'u1',
    amount,
    source: 'Lương',
    month,
    date: date ?? `${month}-01`,
    note: '',
    deleted: false,
  }
}

function makeBudget(spendingAmount: number, savingsTarget = 0): Budget {
  return {
    userId: 'u1',
    month: '2026-03',
    amount: spendingAmount,          // legacy fallback
    spendingAmount,
    savingsTarget,
    createdAt: makeTimestamp(),
    updatedAt: makeTimestamp(),
  }
}

beforeEach(() => { _id = 0 })

// ─── getBudgetAlertLevel ──────────────────────────────────────────────────────

describe('getBudgetAlertLevel', () => {
  // BUG-02: exact 100% must return OVER, not DANGER
  test('exact 100% → OVER (boundary fix)', () => {
    expect(getBudgetAlertLevel(1_000_000, 1_000_000)).toBe('over')
  })

  test('0% → ok', () => {
    expect(getBudgetAlertLevel(0, 1_000_000)).toBe('ok')
  })

  test('69.9% → ok (just below warning threshold)', () => {
    expect(getBudgetAlertLevel(699_999, 1_000_000)).toBe('ok')
  })

  test('70.0% → ok (threshold is STRICTLY > 0.7)', () => {
    expect(getBudgetAlertLevel(700_000, 1_000_000)).toBe('ok')
  })

  test('70.1% → warning (just above threshold)', () => {
    expect(getBudgetAlertLevel(700_001, 1_000_000)).toBe('warning')
  })

  test('90.0% → warning (threshold is STRICTLY > 0.9)', () => {
    expect(getBudgetAlertLevel(900_000, 1_000_000)).toBe('warning')
  })

  test('90.1% → danger (just above threshold)', () => {
    expect(getBudgetAlertLevel(900_001, 1_000_000)).toBe('danger')
  })

  test('90.1% → danger', () => {
    expect(getBudgetAlertLevel(901_000, 1_000_000)).toBe('danger')
  })

  test('100.1% → over', () => {
    expect(getBudgetAlertLevel(1_001_000, 1_000_000)).toBe('over')
  })

  test('total = 0 → ok (guard against division-by-zero)', () => {
    expect(getBudgetAlertLevel(500_000, 0)).toBe('ok')
  })

  test('both zero → ok', () => {
    expect(getBudgetAlertLevel(0, 0)).toBe('ok')
  })

  test('very large amounts stay numerically stable', () => {
    // 999_999_999 / 1_000_000_000 = 0.999... → danger not over
    expect(getBudgetAlertLevel(999_999_999, 1_000_000_000)).toBe('danger')
  })
})

// ─── getConsumptionExpenses ──────────────────────────────────────────────────────

describe('getConsumptionExpenses', () => {
  const MK = '2026-03'

  test('excludes deleted expenses', () => {
    const expenses = [
      exp(100_000, '2026-03-01'),
      exp(200_000, '2026-03-02', 'food', { deleted: true }),
    ]
    expect(getConsumptionExpenses(expenses, MK)).toHaveLength(1)
  })

  test('excludes linked debt expenses (_debtId)', () => {
    const expenses = [
      exp(100_000, '2026-03-01'),
      exp(500_000, '2026-03-05', 'other', { _debtId: 'debt_1' }),
    ]
    expect(getConsumptionExpenses(expenses, MK)).toHaveLength(1)
  })

  test('excludes linked goal expenses (_goalId)', () => {
    const expenses = [
      exp(100_000, '2026-03-01'),
      exp(500_000, '2026-03-10', 'other', { _goalId: 'goal_1' }),
    ]
    expect(getConsumptionExpenses(expenses, MK)).toHaveLength(1)
  })

  test('excludes savings expenses (_savingsMonthKey)', () => {
    const expenses = [
      exp(100_000, '2026-03-01'),
      exp(200_000, '2026-03-15', 'other', { _savingsMonthKey: MK }),
    ]
    expect(getConsumptionExpenses(expenses, MK)).toHaveLength(1)
  })

  test('excludes expenses from different month', () => {
    const expenses = [
      exp(100_000, '2026-03-01'),
      exp(200_000, '2026-02-28'), // previous month
    ]
    expect(getConsumptionExpenses(expenses, MK)).toHaveLength(1)
  })

  test('empty input returns empty array', () => {
    expect(getConsumptionExpenses([], MK)).toHaveLength(0)
  })
})

// ─── sumSpending ──────────────────────────────────────────────────────────────

describe('sumSpending', () => {
  const MK = '2026-03'

  test('sums only unlinked, non-deleted expenses in month', () => {
    const expenses = [
      exp(100_000, '2026-03-01'),
      exp(200_000, '2026-03-10'),
      exp(999_000, '2026-03-15', 'other', { _debtId: 'd1' }),   // excluded
      exp(500_000, '2026-02-28'),                                  // excluded (wrong month)
      exp(150_000, '2026-03-20', 'food', { deleted: true }),      // excluded
    ]
    expect(sumSpending(expenses, MK)).toBe(300_000)
  })

  test('returns 0 for empty array', () => {
    expect(sumSpending([], MK)).toBe(0)
  })

  test('returns 0 when all expenses are linked', () => {
    const expenses = [
      exp(100_000, '2026-03-01', 'other', { _goalId: 'g1' }),
      exp(200_000, '2026-03-05', 'other', { _savingsMonthKey: MK }),
    ]
    expect(sumSpending(expenses, MK)).toBe(0)
  })

  // Floating-point accumulation guard
  // VND values should always be integers but we guard defensively.
  test('float accumulation: many small amounts produce exact integer', () => {
    // 3 × 333.33... — if stored as floats, naive reduce drifts
    const expenses = Array.from({ length: 3 }, () => exp(333_333, '2026-03-01'))
    // Expected: 999_999 (not 999_999.0000001 etc.)
    const result = sumSpending(expenses, MK)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(999_999)
  })
})

// ─── sumIncome ────────────────────────────────────────────────────────────────

describe('sumIncome', () => {
  const MK = '2026-03'

  test('sums active incomes for the month', () => {
    const incomes = [
      inc(5_000_000, MK),
      inc(1_000_000, MK),
      inc(3_000_000, '2026-02'), // wrong month → excluded
    ]
    expect(sumIncome(incomes, MK)).toBe(6_000_000)
  })

  test('excludes deleted incomes', () => {
    const incomes = [
      inc(5_000_000, MK),
      { ...inc(2_000_000, MK), deleted: true },
    ]
    expect(sumIncome(incomes, MK)).toBe(5_000_000)
  })

  test('returns 0 for empty array', () => {
    expect(sumIncome([], MK)).toBe(0)
  })
})

// ─── calcBudgetSummary ────────────────────────────────────────────────────────

describe('calcBudgetSummary', () => {
  const MK = '2026-03'

  test('normal spend within budget', () => {
    const budget   = makeBudget(10_000_000, 2_000_000)
    const expenses = [exp(3_000_000, '2026-03-10')]
    const summary  = calcBudgetSummary(expenses, budget, MK)

    expect(summary.budgetAmount).toBe(10_000_000)
    expect(summary.usedAmount).toBe(3_000_000)
    expect(summary.remainingAmount).toBe(7_000_000)
    expect(summary.usedPercent).toBe(30)
    expect(summary.savingsTarget).toBe(2_000_000)
    expect(summary.alertLevel).toBe('ok')
  })

  test('usedPercent rounds correctly for 1/3 spend', () => {
    const budget   = makeBudget(3_000_000)
    const expenses = [exp(1_000_000, '2026-03-01')]
    const summary  = calcBudgetSummary(expenses, budget, MK)
    // 1_000_000 / 3_000_000 = 33.33... → round → 33
    expect(summary.usedPercent).toBe(33)
  })

  test('spendingAmount takes priority over legacy amount field', () => {
    const budget: Budget = {
      userId: 'u1',
      month: MK,
      amount: 5_000_000,           // legacy
      spendingAmount: 8_000_000,   // new field — should win
      savingsTarget: 0,
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    }
    const summary = calcBudgetSummary([], budget, MK)
    expect(summary.budgetAmount).toBe(8_000_000)
  })

  test('null budget → all zeros, alertLevel ok', () => {
    const summary = calcBudgetSummary([exp(500_000, '2026-03-01')], null, MK)
    expect(summary.budgetAmount).toBe(0)
    expect(summary.usedAmount).toBe(500_000)    // spending still tracked
    expect(summary.remainingAmount).toBe(0)      // Math.max(0, 0 - 500_000) = 0
    expect(summary.usedPercent).toBe(0)
    expect(summary.alertLevel).toBe('ok')
  })

  // BUG-02: exact 100% usage must trigger OVER
  test('exact 100% spend → alertLevel OVER', () => {
    const budget   = makeBudget(1_000_000)
    const expenses = [exp(1_000_000, '2026-03-01')]
    const summary  = calcBudgetSummary(expenses, budget, MK)
    expect(summary.alertLevel).toBe('over')
    expect(summary.remainingAmount).toBe(0)
    expect(summary.usedPercent).toBe(100)
  })

  test('150% spend → alertLevel OVER, remainingAmount clamped to 0', () => {
    const budget   = makeBudget(1_000_000)
    const expenses = [exp(1_500_000, '2026-03-01')]
    const summary  = calcBudgetSummary(expenses, budget, MK)
    expect(summary.alertLevel).toBe('over')
    expect(summary.remainingAmount).toBe(0)
    expect(summary.usedPercent).toBe(150)
  })

  test('warning threshold: >70% triggers warning', () => {
    const budget   = makeBudget(1_000_000)
    const expenses = [exp(700_001, '2026-03-01')]
    const summary  = calcBudgetSummary(expenses, budget, MK)
    expect(summary.alertLevel).toBe('warning')
  })

  test('danger threshold: >90% triggers danger', () => {
    const budget   = makeBudget(1_000_000)
    const expenses = [exp(900_001, '2026-03-01')]
    const summary  = calcBudgetSummary(expenses, budget, MK)
    expect(summary.alertLevel).toBe('danger')
  })

  test('no expenses → 0% spent, ok', () => {
    const budget  = makeBudget(5_000_000)
    const summary = calcBudgetSummary([], budget, MK)
    expect(summary.usedAmount).toBe(0)
    expect(summary.usedPercent).toBe(0)
    expect(summary.alertLevel).toBe('ok')
  })
})

// ─── calcCategorySpending ─────────────────────────────────────────────────────

describe('calcCategorySpending', () => {
  const MK = '2026-03'

  test('groups amounts by category, sorts by amount desc', () => {
    const expenses = [
      exp(300_000, '2026-03-01', 'transport'),
      exp(500_000, '2026-03-05', 'food'),
      exp(200_000, '2026-03-10', 'food'),
    ]
    const result = calcCategorySpending(expenses, MK)
    expect(result[0].category).toBe('food')
    expect(result[0].amount).toBe(700_000)
    expect(result[0].count).toBe(2)
    expect(result[1].category).toBe('transport')
    expect(result[1].amount).toBe(300_000)
  })

  // BUG-01: percent distribution must sum to 100 (largest-remainder fix)
  test('category percents sum to exactly 100 (largest-remainder fix)', () => {
    // Classic case: 3 equal categories → each 33.33% → naive sum = 99
    const expenses = [
      exp(333_333, '2026-03-01', 'food'),
      exp(333_333, '2026-03-05', 'transport'),
      exp(333_334, '2026-03-10', 'bills'),   // +1 to make total 1_000_000
    ]
    const result = calcCategorySpending(expenses, MK)
    const sum = result.reduce((s, c) => s + c.percent, 0)
    expect(sum).toBe(100)
  })

  test('single category → 100%', () => {
    const expenses = [exp(1_000_000, '2026-03-01', 'food')]
    const result = calcCategorySpending(expenses, MK)
    expect(result[0].percent).toBe(100)
  })

  test('empty expenses → empty array', () => {
    expect(calcCategorySpending([], MK)).toHaveLength(0)
  })

  test('linked expenses excluded from category totals', () => {
    const expenses = [
      exp(500_000, '2026-03-01', 'food'),
      exp(200_000, '2026-03-05', 'food', { _debtId: 'd1' }),
    ]
    const result = calcCategorySpending(expenses, MK)
    expect(result[0].amount).toBe(500_000)  // linked expense not counted
  })

  test('2-category percent split: 750k + 250k = 75% + 25%', () => {
    const expenses = [
      exp(750_000, '2026-03-01', 'food'),
      exp(250_000, '2026-03-05', 'transport'),
    ]
    const result = calcCategorySpending(expenses, MK)
    const food      = result.find(c => c.category === 'food')!
    const transport = result.find(c => c.category === 'transport')!
    expect(food.percent).toBe(75)
    expect(transport.percent).toBe(25)
    expect(food.percent + transport.percent).toBe(100)
  })

  // Tricky: 10 categories at 10% each — no rounding issue but verifies logic
  test('5 equal categories → each 20%, sum = 100', () => {
    const categories: CategoryValue[] = ['food', 'transport', 'shopping', 'bills', 'health']
    const expenses = categories.map(cat => exp(200_000, '2026-03-01', cat))
    const result = calcCategorySpending(expenses, MK)
    expect(result.reduce((s, c) => s + c.percent, 0)).toBe(100)
  })
})

// ─── calcCashflow ─────────────────────────────────────────────────────────────

describe('calcCashflow', () => {
  const MK = '2026-03'
  const noDebts: Debt[]            = []
  const noGoals: Goal[]            = []

  test('basic cashflow: income − spending = positive balance', () => {
    const expenses = [exp(2_000_000, '2026-03-10')]
    const incomes  = [inc(5_000_000, MK)]
    const result   = calcCashflow(expenses, incomes, noDebts, noGoals, null, MK)

    expect(result.totalIncome).toBe(5_000_000)
    expect(result.spendingTotal).toBe(2_000_000)
    expect(result.debtPaidTotal).toBe(0)
    expect(result.goalSavedTotal).toBe(0)
    expect(result.savingsTotal).toBe(0)
    expect(result.totalCashOut).toBe(2_000_000)
    expect(result.netBalance).toBe(3_000_000)
  })

  test('savings expense counted in savingsTotal, excluded from spendingTotal', () => {
    const expenses = [
      exp(1_000_000, '2026-03-01'),                                               // spending
      exp(500_000,   '2026-03-15', 'other', { _savingsMonthKey: MK }),            // savings
    ]
    const incomes = [inc(3_000_000, MK)]
    const result  = calcCashflow(expenses, incomes, noDebts, noGoals, null, MK)

    expect(result.spendingTotal).toBe(1_000_000)
    expect(result.savingsTotal).toBe(500_000)
    expect(result.totalCashOut).toBe(1_500_000)
    expect(result.netBalance).toBe(1_500_000)
  })

  test('debt payments counted from debt.payments, not from linked expenses', () => {
    const debt: Debt = {
      id: 'debt_1', userId: 'u1', name: 'Bạn A',
      amount: 2_000_000, type: 'borrow',
      paidAmount: 500_000,
      payments: [
        { id: 'pay_1', amount: 500_000, date: '2026-03-05' },
      ],
      deleted: false,
      dueDate: null,
      note: '',
      createdAt: 0,
    }
    // Linked expense for the payment — should NOT double-count
    const expenses = [
      exp(1_000_000, '2026-03-01'),
      exp(500_000,   '2026-03-05', 'other', { _debtId: 'debt_1' }),  // linked → excluded from spending
    ]
    const incomes = [inc(5_000_000, MK)]
    const result  = calcCashflow(expenses, incomes, [debt], noGoals, null, MK)

    expect(result.spendingTotal).toBe(1_000_000)   // linked exp excluded
    expect(result.debtPaidTotal).toBe(500_000)      // from debt.payments
    expect(result.totalCashOut).toBe(1_500_000)     // no double-count
  })

  test('goal deposits counted from goal.deposits in the month', () => {
    const goal: Goal = {
      id: 'goal_1', userId: 'u1', name: 'iPhone',
      icon: '📱', targetAmount: 10_000_000, currentAmount: 2_000_000,
      deposits: [
        { id: 'dep_1', amount: 2_000_000, date: '2026-03-10', note: '' },
      ],
      deleted: false,
      deadline: null,
      createdTimestamp: 0,
    }
    const expenses = [exp(1_000_000, '2026-03-01')]
    const incomes  = [inc(5_000_000, MK)]
    const result   = calcCashflow(expenses, incomes, noDebts, [goal], null, MK)

    expect(result.goalSavedTotal).toBe(2_000_000)
    expect(result.totalCashOut).toBe(3_000_000)
    expect(result.netBalance).toBe(2_000_000)
  })

  test('negative net balance (overspent) reported correctly', () => {
    const expenses = [exp(8_000_000, '2026-03-01')]
    const incomes  = [inc(5_000_000, MK)]
    const result   = calcCashflow(expenses, incomes, noDebts, noGoals, null, MK)

    expect(result.netBalance).toBe(-3_000_000)
  })

  test('deleted debts excluded from debtPaidTotal', () => {
    const deletedDebt: Debt = {
      id: 'debt_d', userId: 'u1', name: 'X',
      amount: 1_000_000, type: 'borrow',
      paidAmount: 500_000,
      payments: [{ id: 'p1', amount: 500_000, date: '2026-03-01' }],
      deleted: true,
      dueDate: null, note: '', createdAt: 0,
    }
    const result = calcCashflow([], [], [deletedDebt], noGoals, null, MK)
    expect(result.debtPaidTotal).toBe(0)
  })

  test('payments from previous month excluded', () => {
    const debt: Debt = {
      id: 'debt_1', userId: 'u1', name: 'A',
      amount: 2_000_000, type: 'borrow',
      paidAmount: 1_000_000,
      payments: [
        { id: 'p1', amount: 500_000, date: '2026-02-15' },  // previous month → excluded
        { id: 'p2', amount: 500_000, date: '2026-03-10' },  // this month → included
      ],
      deleted: false,
      dueDate: null, note: '', createdAt: 0,
    }
    const result = calcCashflow([], [], [debt], noGoals, null, MK)
    expect(result.debtPaidTotal).toBe(500_000)
  })

  test('all zeros: empty state → all zeros', () => {
    const result = calcCashflow([], [], noDebts, noGoals, null, MK)
    expect(result.totalIncome).toBe(0)
    expect(result.totalCashOut).toBe(0)
    expect(result.netBalance).toBe(0)
  })
})

// ─── calcCategoryAlerts ───────────────────────────────────────────────────────

describe('calcCategoryAlerts', () => {
  const MK = '2026-03'

  test('returns only categories that are warning or above', () => {
    const expenses = [
      exp(400_000, '2026-03-01', 'food'),         // 40% of 1M → ok, excluded
      exp(800_000, '2026-03-05', 'transport'),     // 80% of 1M → warning
      exp(1_100_000, '2026-03-10', 'bills'),       // 110% of 1M → over
    ]
    const budgets = { food: 1_000_000, transport: 1_000_000, bills: 1_000_000 }
    const alerts  = calcCategoryAlerts(expenses, budgets, MK)

    expect(alerts).toHaveLength(2)
    expect(alerts.some(a => a.category === 'food')).toBe(false)
    expect(alerts.find(a => a.category === 'bills')?.alertLevel).toBe('over')
    expect(alerts.find(a => a.category === 'transport')?.alertLevel).toBe('warning')
  })

  test('sorted by percent desc', () => {
    const expenses = [
      exp(800_000, '2026-03-01', 'food'),         // 80% → warning
      exp(950_000, '2026-03-02', 'transport'),    // 95% → danger
    ]
    const budgets = { food: 1_000_000, transport: 1_000_000 }
    const alerts  = calcCategoryAlerts(expenses, budgets, MK)

    expect(alerts[0].category).toBe('transport')
    expect(alerts[1].category).toBe('food')
  })

  test('budget = 0 categories are skipped', () => {
    const expenses = [exp(500_000, '2026-03-01', 'food')]
    const budgets  = { food: 0 }
    const alerts   = calcCategoryAlerts(expenses, budgets, MK)
    expect(alerts).toHaveLength(0)
  })

  test('no budgets → empty alerts', () => {
    const expenses = [exp(500_000, '2026-03-01', 'food')]
    const alerts   = calcCategoryAlerts(expenses, {}, MK)
    expect(alerts).toHaveLength(0)
  })

  // BUG-02: exact 100% category spend must be OVER, not DANGER
  test('exact 100% category spend → OVER', () => {
    const expenses = [exp(1_000_000, '2026-03-01', 'food')]
    const budgets  = { food: 1_000_000 }
    const alerts   = calcCategoryAlerts(expenses, budgets, MK)
    expect(alerts[0].alertLevel).toBe('over')
  })
})