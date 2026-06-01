/**
 * analyticsCalc.ts — Pure analytics types + utility functions.
 *
 * Không import bất kỳ thứ gì từ Firebase, React, hay store.
 * Types được định nghĩa ở đây để tránh circular dependency với useAnalyticsData.ts.
 */

import { toLocalDateString, parseLocalDate } from '@/lib/utils/date'
import { isLinkedExpense, type Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'

// ─── Types (nguồn gốc duy nhất — useAnalyticsData.ts re-export lại) ───────────

export type PeriodType = 'week' | 'month' | 'year'

export interface PeriodRange {
  type: PeriodType
  start: string   // YYYY-MM-DD
  end: string     // YYYY-MM-DD
  label: string
}

export interface DailyData {
  date: string
  expense: number
  income: number
}

// ─── Index builders ───────────────────────────────────────────────────────────

export function buildSpendingByDate(expenses: Expense[]): Map<string, Expense[]> {
  const map = new Map<string, Expense[]>()
  for (const e of expenses) {
    if (e.deleted || isLinkedExpense(e)) continue
    const bucket = map.get(e.date)
    if (bucket) bucket.push(e)
    else map.set(e.date, [e])
  }
  return map
}

export function buildSpendingByMonth(expenses: Expense[]): Map<string, Expense[]> {
  const map = new Map<string, Expense[]>()
  for (const e of expenses) {
    if (e.deleted || isLinkedExpense(e)) continue
    const month = e.date.slice(0, 7)
    const bucket = map.get(month)
    if (bucket) bucket.push(e)
    else map.set(month, [e])
  }
  return map
}

export function buildIncomesByDate(incomes: Income[]): Map<string, Income[]> {
  const map = new Map<string, Income[]>()
  for (const i of incomes) {
    if (i.deleted) continue
    const bucket = map.get(i.date)
    if (bucket) bucket.push(i)
    else map.set(i.date, [i])
  }
  return map
}

// ─── Chart data builders ──────────────────────────────────────────────────────

export function buildDailyData(
  expenses: Expense[],
  incomes: Income[],
  range: PeriodRange,
  spendingByDate?: Map<string, Expense[]>,
  incomesByDate?: Map<string, Income[]>,
): DailyData[] {
  const expIdx = spendingByDate ?? buildSpendingByDate(expenses)
  const incIdx = incomesByDate  ?? buildIncomesByDate(incomes)

  const days: DailyData[] = []
  const start = parseLocalDate(range.start)
  const end   = parseLocalDate(range.end)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = toLocalDateString(new Date(d))
    const exp = (expIdx.get(dateStr) ?? []).reduce((s, e) => s + e.amount, 0)
    const inc = (incIdx.get(dateStr) ?? []).reduce((s, i) => s + i.amount, 0)
    days.push({ date: dateStr, expense: exp, income: inc })
  }
  return days
}

export function buildMonthlyData(
  expenses: Expense[],
  incomes: Income[],
  year: number,
  spendingByMonth?: Map<string, Expense[]>,
  incomesByMonth?: Map<string, Income[]>,
): DailyData[] {
  const expIdx = spendingByMonth ?? buildSpendingByMonth(expenses)
  const incIdx: Map<string, Income[]> = incomesByMonth ?? (() => {
    const m = new Map<string, Income[]>()
    for (const i of incomes) {
      if (i.deleted) continue
      const bucket = m.get(i.month)
      if (bucket) bucket.push(i)
      else m.set(i.month, [i])
    }
    return m
  })()

  return Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0')
    const key   = `${year}-${month}`
    const exp = (expIdx.get(key) ?? []).reduce((s, e) => s + e.amount, 0)
    const inc = (incIdx.get(key) ?? []).reduce((s, i) => s + i.amount, 0)
    return { date: `T${i + 1}`, expense: exp, income: inc }
  })
}