/**
 * Tests cho Fix 3.2 — index builders và buildDailyData/buildMonthlyData.
 *
 * Verify:
 *   1. Index builders cho kết quả đúng
 *   2. buildDailyData với index = buildDailyData không có index
 *   3. buildMonthlyData với index = buildMonthlyData không có index
 *   4. Linked expenses (debt/goal/savings) bị loại đúng khỏi spending index
 */

import {
  buildSpendingByDate,
  buildSpendingByMonth,
  buildIncomesByDate,
  buildDailyData,
  buildMonthlyData,
} from '@/lib/utils/analyticsCalc'
import type { PeriodRange, DailyData } from '@/hooks/useAnalyticsData'
import type { Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'

// ─── Test data helpers ───────────────────────────────────────────────────────

let _id = 0
function makeExpense(overrides: Partial<Expense> & { date: string; amount: number }): Expense {
  _id++
  return {
    id:       `exp_${_id}`,
    category: 'food',
    note:     '',
    deleted:  false,
    userId:   'u1',
    createdAt: overrides.date,
    ...overrides,
  } as Expense
}

function makeIncome(overrides: Partial<Income> & { date: string; amount: number; month: string }): Income {
  _id++
  return {
    id:      `inc_${_id}`,
    source:  'Lương',
    note:    '',
    deleted: false,
    userId:  'u1',
    ...overrides,
  } as Income
}

beforeEach(() => { _id = 0 })

// ─── buildSpendingByDate ──────────────────────────────────────────────────────

describe('buildSpendingByDate', () => {
  test('groups expenses by date correctly', () => {
    const expenses = [
      makeExpense({ date: '2026-03-01', amount: 50000 }),
      makeExpense({ date: '2026-03-01', amount: 30000 }),
      makeExpense({ date: '2026-03-02', amount: 20000 }),
    ]
    const idx = buildSpendingByDate(expenses)
    expect(idx.get('2026-03-01')).toHaveLength(2)
    expect(idx.get('2026-03-02')).toHaveLength(1)
    expect(idx.get('2026-03-03')).toBeUndefined()
  })

  test('excludes deleted expenses', () => {
    const expenses = [
      makeExpense({ date: '2026-03-01', amount: 50000 }),
      makeExpense({ date: '2026-03-01', amount: 30000, deleted: true }),
    ]
    const idx = buildSpendingByDate(expenses)
    expect(idx.get('2026-03-01')).toHaveLength(1)
  })

  test('excludes debt-linked expenses', () => {
    const expenses = [
      makeExpense({ date: '2026-03-01', amount: 50000 }),
      makeExpense({ date: '2026-03-01', amount: 30000, _debtId: 'debt_1' } as Expense),
    ]
    const idx = buildSpendingByDate(expenses)
    expect(idx.get('2026-03-01')).toHaveLength(1)
  })

  test('excludes goal-linked expenses', () => {
    const expenses = [
      makeExpense({ date: '2026-03-05', amount: 100000, _goalId: 'goal_1' } as Expense),
    ]
    const idx = buildSpendingByDate(expenses)
    expect(idx.get('2026-03-05')).toBeUndefined()
  })

  test('excludes savings-linked expenses', () => {
    const expenses = [
      makeExpense({ date: '2026-03-10', amount: 200000, _savingsMonthKey: '2026-03' } as Expense),
    ]
    const idx = buildSpendingByDate(expenses)
    expect(idx.get('2026-03-10')).toBeUndefined()
  })

  test('returns empty map for empty array', () => {
    expect(buildSpendingByDate([])).toEqual(new Map())
  })
})

// ─── buildSpendingByMonth ─────────────────────────────────────────────────────

describe('buildSpendingByMonth', () => {
  test('groups expenses by YYYY-MM correctly', () => {
    const expenses = [
      makeExpense({ date: '2026-03-01', amount: 50000 }),
      makeExpense({ date: '2026-03-15', amount: 30000 }),
      makeExpense({ date: '2026-04-01', amount: 20000 }),
    ]
    const idx = buildSpendingByMonth(expenses)
    expect(idx.get('2026-03')).toHaveLength(2)
    expect(idx.get('2026-04')).toHaveLength(1)
  })

  test('excludes deleted and linked expenses', () => {
    const expenses = [
      makeExpense({ date: '2026-03-01', amount: 50000 }),
      makeExpense({ date: '2026-03-10', amount: 30000, deleted: true }),
      makeExpense({ date: '2026-03-15', amount: 20000, _debtId: 'debt_1' } as Expense),
    ]
    const idx = buildSpendingByMonth(expenses)
    expect(idx.get('2026-03')).toHaveLength(1)
  })
})

// ─── buildIncomesByDate ───────────────────────────────────────────────────────

describe('buildIncomesByDate', () => {
  test('groups incomes by date', () => {
    const incomes = [
      makeIncome({ date: '2026-03-01', amount: 5000000, month: '2026-03' }),
      makeIncome({ date: '2026-03-01', amount: 1000000, month: '2026-03' }),
      makeIncome({ date: '2026-03-15', amount: 500000,  month: '2026-03' }),
    ]
    const idx = buildIncomesByDate(incomes)
    expect(idx.get('2026-03-01')).toHaveLength(2)
    expect(idx.get('2026-03-15')).toHaveLength(1)
  })

  test('excludes deleted incomes', () => {
    const incomes = [
      makeIncome({ date: '2026-03-01', amount: 5000000, month: '2026-03' }),
      makeIncome({ date: '2026-03-01', amount: 1000000, month: '2026-03', deleted: true }),
    ]
    const idx = buildIncomesByDate(incomes)
    expect(idx.get('2026-03-01')).toHaveLength(1)
  })
})

// ─── buildDailyData: với index = không có index ───────────────────────────────

describe('buildDailyData — invariant: with index ≡ without index', () => {
  const expenses = [
    makeExpense({ date: '2026-03-01', amount: 50000 }),
    makeExpense({ date: '2026-03-01', amount: 30000 }),
    makeExpense({ date: '2026-03-03', amount: 20000 }),
    makeExpense({ date: '2026-03-03', amount: 10000, _debtId: 'debt_1' } as Expense),
    makeExpense({ date: '2026-03-05', amount: 15000, deleted: true }),
  ]
  const incomes = [
    makeIncome({ date: '2026-03-01', amount: 5000000, month: '2026-03' }),
    makeIncome({ date: '2026-03-04', amount: 1000000, month: '2026-03' }),
  ]
  const range: PeriodRange = { type: 'week', start: '2026-03-01', end: '2026-03-07', label: 'Test' }

  test('totals match between indexed and non-indexed', () => {
    const noIndex  = buildDailyData(expenses, incomes, range)
    const withIndex = buildDailyData(
      expenses, incomes, range,
      buildSpendingByDate(expenses),
      buildIncomesByDate(incomes),
    )

    expect(withIndex).toHaveLength(noIndex.length)
    withIndex.forEach((day, i) => {
      expect(day.date).toBe(noIndex[i].date)
      expect(day.expense).toBe(noIndex[i].expense)
      expect(day.income).toBe(noIndex[i].income)
    })
  })

  test('debt-linked expenses excluded from daily totals', () => {
    const result = buildDailyData(expenses, incomes, range, buildSpendingByDate(expenses), buildIncomesByDate(incomes))
    const march3 = result.find(d => d.date === '2026-03-03')!
    // Chỉ tính 20000, không tính 10000 (_debtId linked)
    expect(march3.expense).toBe(20000)
  })

  test('deleted expenses excluded', () => {
    const result = buildDailyData(expenses, incomes, range, buildSpendingByDate(expenses), buildIncomesByDate(incomes))
    const march5 = result.find(d => d.date === '2026-03-05')!
    expect(march5.expense).toBe(0)
  })

  test('days with no transactions have 0', () => {
    const result = buildDailyData(expenses, incomes, range, buildSpendingByDate(expenses), buildIncomesByDate(incomes))
    const march2 = result.find(d => d.date === '2026-03-02')!
    expect(march2.expense).toBe(0)
    expect(march2.income).toBe(0)
  })
})

// ─── buildMonthlyData: với index = không có index ────────────────────────────

describe('buildMonthlyData — invariant: with index ≡ without index', () => {
  const expenses = [
    makeExpense({ date: '2026-01-15', amount: 100000 }),
    makeExpense({ date: '2026-03-10', amount: 200000 }),
    makeExpense({ date: '2026-03-20', amount: 150000 }),
    makeExpense({ date: '2026-12-01', amount: 500000 }),
    makeExpense({ date: '2026-06-15', amount: 80000, _goalId: 'g1' } as Expense),
  ]
  const incomes = [
    makeIncome({ date: '2026-01-01', amount: 10000000, month: '2026-01' }),
    makeIncome({ date: '2026-03-01', amount: 10000000, month: '2026-03' }),
  ]

  test('monthly totals match between indexed and non-indexed', () => {
    const noIndex   = buildMonthlyData(expenses, incomes, 2026)
    const withIndex = buildMonthlyData(
      expenses, incomes, 2026,
      buildSpendingByMonth(expenses),
    )

    expect(withIndex).toHaveLength(12)
    withIndex.forEach((month, i) => {
      expect(month.expense).toBe(noIndex[i].expense)
      expect(month.income).toBe(noIndex[i].income)
    })
  })

  test('month labels are T1..T12', () => {
    const result = buildMonthlyData(expenses, incomes, 2026)
    expect(result[0].date).toBe('T1')
    expect(result[11].date).toBe('T12')
  })

  test('goal-linked excluded from monthly spending', () => {
    const result = buildMonthlyData(expenses, incomes, 2026, buildSpendingByMonth(expenses))
    // Tháng 6 chỉ có goal-linked → 0
    expect(result[5].expense).toBe(0)
  })
})