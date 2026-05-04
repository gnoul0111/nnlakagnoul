'use client'

import { useMemo } from 'react'
import { useAppData } from './useAppData'
import { getSpendingExpenses, getIncomesByMonth } from '@/lib/engine/replay'
import { calcCashflow, calcCategorySpending } from '@/lib/utils/budgetCalc'
import { toLocalDateString, parseLocalDate, getWeekRange, prevMonth, last6Months } from '@/lib/utils/date'
import type { Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'

export type PeriodType = 'week' | 'month' | 'year'

export interface PeriodRange {
  type: PeriodType
  start: string   // YYYY-MM-DD
  end: string     // YYYY-MM-DD
  label: string
}

// ─── Period helpers ───────────────────────────────────────────────────────────

export function getPeriodExpenses(expenses: Expense[], range: PeriodRange): Expense[] {
  return expenses.filter(e => !e.deleted && e.date >= range.start && e.date <= range.end)
}

export function getSpendingForPeriod(expenses: Expense[], range: PeriodRange): Expense[] {
  return getPeriodExpenses(expenses, range).filter(
    e => !e._debtId && !e._goalId && !e._savingsMonthKey,
  )
}

export function getPeriodIncomes(incomes: Income[], range: PeriodRange): Income[] {
  return incomes.filter(i => !i.deleted && i.date >= range.start && i.date <= range.end)
}

// ─── Build daily data for line/bar chart ─────────────────────────────────────

export interface DailyData {
  date: string      // YYYY-MM-DD or display label
  expense: number
  income: number
}

export function buildDailyData(
  expenses: Expense[],
  incomes: Income[],
  range: PeriodRange,
): DailyData[] {
  const days: DailyData[] = []
  const start = parseLocalDate(range.start)
  const end   = parseLocalDate(range.end)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toLocalDateString(new Date(d))
    const exp = expenses
      .filter(e => !e.deleted && e.date === dateStr && !e._debtId && !e._goalId && !e._savingsMonthKey)
      .reduce((s, e) => s + e.amount, 0)
    const inc = incomes
      .filter(i => !i.deleted && i.date === dateStr)
      .reduce((s, i) => s + i.amount, 0)
    days.push({ date: dateStr, expense: exp, income: inc })
  }
  return days
}

// ─── Build weekly grouped data (for month view bar chart) ────────────────────

export function buildWeeklyData(dailyData: DailyData[]): DailyData[] {
  const weeks: Record<number, DailyData> = {}
  dailyData.forEach((d, i) => {
    const weekNum = Math.floor(i / 7)
    if (!weeks[weekNum]) weeks[weekNum] = { date: `Tuần ${weekNum + 1}`, expense: 0, income: 0 }
    weeks[weekNum].expense += d.expense
    weeks[weekNum].income  += d.income
  })
  return Object.values(weeks)
}

// ─── Build monthly data (for year view) ──────────────────────────────────────

export function buildMonthlyData(
  expenses: Expense[],
  incomes: Income[],
  year: number,
): DailyData[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0')
    const key   = `${year}-${month}`
    const exp   = expenses
      .filter(e => !e.deleted && e.date.startsWith(key) && !e._debtId && !e._goalId && !e._savingsMonthKey)
      .reduce((s, e) => s + e.amount, 0)
    const inc = incomes
      .filter(i => !i.deleted && i.month === key)
      .reduce((s, i) => s + i.amount, 0)
    return { date: `T${i + 1}`, expense: exp, income: inc }
  })
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useAnalyticsData(range: PeriodRange) {
  const { expenses, allIncomes: incomes, debts, goals, savingsPlans, isLoading } = useAppData()

  return useMemo(() => {
    const periodExpenses = getSpendingForPeriod(expenses, range)
    const periodIncomes  = getPeriodIncomes(incomes, range)

    const totalExpense   = periodExpenses.reduce((s, e) => s + e.amount, 0)
    const totalIncome    = periodIncomes.reduce((s, i) => s + i.amount, 0)
    const txCount        = periodExpenses.length
    const avgPerTx       = txCount > 0 ? Math.round(totalExpense / txCount) : 0

    // Category breakdown
    const allPeriodExpenses = getPeriodExpenses(expenses, range)
    const categoryData = calcCategorySpending(allPeriodExpenses, range.start.slice(0, 7))
      // Re-calculate for period (not just month)
    const catMap = new Map<string, { amount: number; count: number }>()
    for (const e of periodExpenses) {
      const ex = catMap.get(e.category) ?? { amount: 0, count: 0 }
      catMap.set(e.category, { amount: ex.amount + e.amount, count: ex.count + 1 })
    }
    const categories = Array.from(catMap.entries())
      .map(([category, { amount, count }]) => ({
        category, amount, count,
        percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount)

    // Top expenses
    const topExpenses = [...periodExpenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    // Daily/weekly/monthly chart data
    const dailyData   = buildDailyData(expenses, incomes, range)

    return {
      totalExpense, totalIncome, txCount, avgPerTx,
      categories, topExpenses, dailyData,
      isLoading,
    }
  }, [expenses, incomes, range, isLoading])
}

// ─── Trend data (6 months) ───────────────────────────────────────────────────

export function useTrendData(filterCategory?: string) {
  const { expenses, isLoading } = useAppData()

  return useMemo(() => {
    const months = last6Months()
    return {
      data: months.map(month => {
        const monthExp = expenses.filter(e =>
          !e.deleted &&
          e.date.startsWith(month) &&
          !e._debtId && !e._goalId && !e._savingsMonthKey &&
          (!filterCategory || filterCategory === 'all' || e.category === filterCategory),
        )
        return {
          month,
          amount: monthExp.reduce((s, e) => s + e.amount, 0),
          count:  monthExp.length,
        }
      }),
      isLoading,
    }
  }, [expenses, filterCategory, isLoading])
}

// ─── Compare with previous period ────────────────────────────────────────────

export function useCompareData(range: PeriodRange) {
  const { expenses, isLoading } = useAppData()

  return useMemo(() => {
    // Build previous range
    const startDate = parseLocalDate(range.start)
    const endDate   = parseLocalDate(range.end)
    const daysDiff  = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const prevStart = new Date(startDate)
    prevStart.setDate(prevStart.getDate() - daysDiff)
    const prevEnd = new Date(prevStart)
    prevEnd.setDate(prevEnd.getDate() + daysDiff - 1)

    const prevRange: PeriodRange = {
      type: range.type,
      start: toLocalDateString(prevStart),
      end:   toLocalDateString(prevEnd),
      label: 'Kỳ trước',
    }

    const current = getSpendingForPeriod(expenses, range).reduce((s, e) => s + e.amount, 0)
    const previous = getSpendingForPeriod(expenses, prevRange).reduce((s, e) => s + e.amount, 0)

    const diff   = current - previous
    const pctDiff = previous > 0 ? Math.round((diff / previous) * 100) : 0

    // Per-category compare
    const catMap = new Map<string, { current: number; previous: number }>()
    getSpendingForPeriod(expenses, range).forEach(e => {
      const ex = catMap.get(e.category) ?? { current: 0, previous: 0 }
      catMap.set(e.category, { ...ex, current: ex.current + e.amount })
    })
    getSpendingForPeriod(expenses, prevRange).forEach(e => {
      const ex = catMap.get(e.category) ?? { current: 0, previous: 0 }
      catMap.set(e.category, { ...ex, previous: ex.previous + e.amount })
    })

    const categoryCompare = Array.from(catMap.entries())
      .map(([category, { current, previous }]) => ({
        category,
        current,
        previous,
        diff: current - previous,
        pctDiff: previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0,
      }))
      .filter(c => c.current > 0 || c.previous > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5)

    return { current, previous, diff, pctDiff, categoryCompare, hasPrevious: previous > 0, isLoading }
  }, [expenses, range, isLoading])
}