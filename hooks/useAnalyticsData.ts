'use client'

import { useMemo } from 'react'
import { useAppData } from './useAppData'
import { getSpendingExpenses, getIncomesByMonth } from '@/lib/engine/replay'
import { calcCashflow, calcCategorySpending } from '@/lib/utils/budgetCalc'
import { toLocalDateString, parseLocalDate, getWeekRange, prevMonth, last6Months } from '@/lib/utils/date'
import {
  buildSpendingByDate,
  buildSpendingByMonth,
  buildIncomesByDate,
  buildDailyData,
  buildMonthlyData,
} from '@/lib/utils/analyticsCalc'
import type { Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'

// Re-export types + pure functions từ analyticsCalc — single source of truth
export type { PeriodType, PeriodRange, DailyData } from '@/lib/utils/analyticsCalc'
export {
  buildSpendingByDate, buildSpendingByMonth, buildIncomesByDate,
  buildDailyData, buildMonthlyData,
} from '@/lib/utils/analyticsCalc'

// Re-import types for use in this file
import type { PeriodRange, DailyData } from '@/lib/utils/analyticsCalc'

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

// ─── Build weekly grouped data ────────────────────────────────────────────────

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

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useAnalyticsData(range: PeriodRange) {
  const { expenses, allIncomes: incomes, debts, goals, savingsPlans, isLoading } = useAppData()

  const spendingByDate  = useMemo(() => buildSpendingByDate(expenses),  [expenses])
  const incomesByDate   = useMemo(() => buildIncomesByDate(incomes),     [incomes])
  const spendingByMonth = useMemo(() => buildSpendingByMonth(expenses),  [expenses])

  return useMemo(() => {
    const periodExpenses = getSpendingForPeriod(expenses, range)
    const periodIncomes  = getPeriodIncomes(incomes, range)

    const totalExpense = periodExpenses.reduce((s, e) => s + e.amount, 0)
    const totalIncome  = periodIncomes.reduce((s, i) => s + i.amount, 0)
    const txCount      = periodExpenses.length
    const avgPerTx     = txCount > 0 ? Math.round(totalExpense / txCount) : 0

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

    const topExpenses = [...periodExpenses]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    const dailyData = buildDailyData(expenses, incomes, range, spendingByDate, incomesByDate)

    return {
      totalExpense, totalIncome, txCount, avgPerTx,
      categories, topExpenses, dailyData,
      isLoading,
    }
  }, [expenses, incomes, range, isLoading, spendingByDate, incomesByDate])
}

// ─── Trend data (6 months) ───────────────────────────────────────────────────

export function useTrendData(filterCategory?: string) {
  const { expenses, isLoading } = useAppData()
  const spendingByMonth = useMemo(() => buildSpendingByMonth(expenses), [expenses])

  return useMemo(() => {
    const months = last6Months()
    return {
      data: months.map(month => {
        const monthExp = (spendingByMonth.get(month) ?? []).filter(e =>
          !filterCategory || filterCategory === 'all' || e.category === filterCategory,
        )
        return {
          month,
          amount: monthExp.reduce((s, e) => s + e.amount, 0),
          count:  monthExp.length,
        }
      }),
      isLoading,
    }
  }, [spendingByMonth, filterCategory, isLoading])
}

// ─── Compare with previous period ────────────────────────────────────────────

export function useCompareData(range: PeriodRange) {
  const { expenses, isLoading } = useAppData()
  const spendingByDate = useMemo(() => buildSpendingByDate(expenses), [expenses])

  return useMemo(() => {
    const startDate = parseLocalDate(range.start)
    const endDate   = parseLocalDate(range.end)
    const daysDiff  = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const prevStart = new Date(startDate)
    prevStart.setDate(prevStart.getDate() - daysDiff)
    const prevEnd = new Date(prevStart)
    prevEnd.setDate(prevEnd.getDate() + daysDiff - 1)

    const prevRange: PeriodRange = {
      type:  range.type,
      start: toLocalDateString(prevStart),
      end:   toLocalDateString(prevEnd),
      label: 'Kỳ trước',
    }

    let current  = 0
    let previous = 0
    const catMap = new Map<string, { current: number; previous: number }>()

    const curStart = parseLocalDate(range.start)
    const curEnd   = parseLocalDate(range.end)
    for (let d = new Date(curStart); d <= curEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateString(new Date(d))
      for (const e of (spendingByDate.get(dateStr) ?? [])) {
        current += e.amount
        const ex = catMap.get(e.category) ?? { current: 0, previous: 0 }
        catMap.set(e.category, { ...ex, current: ex.current + e.amount })
      }
    }

    const prvStart = parseLocalDate(prevRange.start)
    const prvEnd   = parseLocalDate(prevRange.end)
    for (let d = new Date(prvStart); d <= prvEnd; d.setDate(d.getDate() + 1)) {
      const dateStr = toLocalDateString(new Date(d))
      for (const e of (spendingByDate.get(dateStr) ?? [])) {
        previous += e.amount
        const ex = catMap.get(e.category) ?? { current: 0, previous: 0 }
        catMap.set(e.category, { ...ex, previous: ex.previous + e.amount })
      }
    }

    const diff    = current - previous
    const pctDiff = previous > 0 ? Math.round((diff / previous) * 100) : 0

    const categoryCompare = Array.from(catMap.entries())
      .map(([category, { current, previous }]) => ({
        category, current, previous,
        diff: current - previous,
        pctDiff: previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0,
      }))
      .filter(c => c.current > 0 || c.previous > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 5)

    return { current, previous, diff, pctDiff, categoryCompare, hasPrevious: previous > 0, isLoading }
  }, [expenses, range, isLoading, spendingByDate])
}