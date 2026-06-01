'use client'

import { useEffect, useCallback, useMemo } from 'react'
import { useAppData } from './useAppData'
import { useAuthStore } from '@/lib/store/authStore'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import { isConsumptionExpense, isLinkedExpense } from '@/lib/types/expense'

// ─── Finance data helpers ─────────────────────────────────────────────────────

/** Chi tiêu + thu nhập cho 1 ngày cụ thể */
export function useDayFinanceData(dateStr: string) {
  const { expenses, allIncomes } = useAppData()
  return useMemo(() => {
    const dayExpenses      = expenses.filter(e => e.date === dateStr)
    const spendingExpenses = dayExpenses.filter(isConsumptionExpense)
    const linkedExpenses = dayExpenses.filter(isLinkedExpense)
    const dayIncomes   = allIncomes.filter(i => i.date === dateStr)
    const totalSpending = spendingExpenses.reduce((s, e) => s + e.amount, 0)
    const totalIncome   = dayIncomes.reduce((s, i) => s + i.amount, 0)
    return { dayExpenses, spendingExpenses, linkedExpenses, dayIncomes, totalSpending, totalIncome }
  }, [expenses, allIncomes, dateStr])
}

/**
 * Map ngày → tổng chi tiêu thực (loại linked) cho 1 tháng.
 * Dùng cho month-view / week-view để hiện số tiền trên từng ô.
 */
export function useDailySpendingMap(monthKey: string): Record<string, number> {
  const { expenses } = useAppData()
  return useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses) {
      if (!e.date.startsWith(monthKey)) continue
      if (isLinkedExpense(e)) continue
      map[e.date] = (map[e.date] ?? 0) + e.amount
    }
    return map
  }, [expenses, monthKey])
}

/** Tổng thu / chi / số dư cho 1 khoảng thời gian — dùng cho FinanceSummaryBar */
export function usePeriodFinanceSummary(start: string, end: string) {
  const { expenses, allIncomes } = useAppData()
  return useMemo(() => {
    const spendingExpenses = expenses.filter(
      e => e.date >= start && e.date <= end && isConsumptionExpense(e),
    )
    const periodIncomes = allIncomes.filter(i => i.date >= start && i.date <= end)
    const totalSpending = spendingExpenses.reduce((s, e) => s + e.amount, 0)
    const totalIncome   = periodIncomes.reduce((s, i) => s + i.amount, 0)
    return { totalSpending, totalIncome, balance: totalIncome - totalSpending }
  }, [expenses, allIncomes, start, end])
}

// ─── Work Calendar Events ─────────────────────────────────────────────────────

import { useCalendarStore } from '@/lib/store/calendarStore'

/**
 * Hook đọc work calendar events.
 *
 * Nay dùng shared store → nhiều component gọi hook này chỉ fetch 1 lần.
 * Tự động load khi mount. Gọi `refresh()` sau khi add/edit/delete event.
 */
export function useCalendarEvents() {
  const user     = useAuthStore(s => s.user)
  const events   = useCalendarStore(s => s.events)
  const loading  = useCalendarStore(s => s.loading)
  const load     = useCalendarStore(s => s.load)
  const refresh  = useCalendarStore(s => s.refresh)

  // Load 1 lần khi user sẵn sàng (store dedup bên trong)
  useEffect(() => {
    if (user) load(user.uid)
  }, [user, load])

  const refreshFn = useCallback(async () => {
    if (user) await refresh(user.uid)
  }, [user, refresh])

  const getEventsForDate = useCallback(
    (dateStr: string) => events.filter(e => e.date === dateStr),
    [events],
  )

  const getEventsForMonth = useCallback(
    (monthKey: string) => events.filter(e => e.date.startsWith(monthKey)),
    [events],
  )

  return { events, loading, refresh: refreshFn, getEventsForDate, getEventsForMonth }
}
