'use client'

import { useMemo } from 'react'
import { useEventStore } from '@/lib/store/eventStore'
import {
  getActiveExpenses,
  getActiveGoals,
  getActiveDebts,
  getActiveTemplates,
  getExpensesByMonth,
  getSpendingExpenses,
  getIncomesByMonth,
} from '@/lib/engine/replay'
import type { Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'
import type { Goal } from '@/lib/types/goal'
import type { Debt } from '@/lib/types/debt'
import type { Template } from '@/lib/types/template'
import type { SavingsPlan } from '@/lib/types/savings'

/**
 * Hook chính để lấy toàn bộ data đã replay.
 * Dùng ở bất kỳ component nào cần read data.
 *
 * PERF: dùng selector + useMemo để tránh re-render khi các field
 * không liên quan (_eventsCache, _lastSync…) thay đổi.
 */
export function useAppData() {
  const replayedState = useEventStore(s => s.replayedState)
  const isLoading     = useEventStore(s => s.isLoading)
  const error         = useEventStore(s => s.error)

  // Memoize để reference stable giữa các render khi replayedState chưa đổi
  const data = useMemo(() => {
    const expenses:  Expense[]  = replayedState ? getActiveExpenses(replayedState)  : []
    const goals:     Goal[]     = replayedState ? getActiveGoals(replayedState)     : []
    const debts:     Debt[]     = replayedState ? getActiveDebts(replayedState)     : []
    const templates: Template[] = replayedState ? getActiveTemplates(replayedState) : []
    const savingsPlans: Record<string, SavingsPlan> = replayedState?.savingsPlans ?? {}
    const allIncomes: Income[] = replayedState?.incomes.filter(i => !i.deleted) ?? []
    return { expenses, goals, debts, templates, savingsPlans, allIncomes }
  }, [replayedState])

  return {
    ...data,
    isLoading,
    error,
    hasData: replayedState !== null,
  }
}

/**
 * Hook lấy data theo tháng — dùng ở Dashboard, Finance.
 */
export function useMonthData(monthKey: string) {
  const replayedState = useEventStore(s => s.replayedState)
  const isLoading     = useEventStore(s => s.isLoading)

  const data = useMemo(() => {
    const monthExpenses: Expense[] = replayedState
      ? getExpensesByMonth(replayedState, monthKey)
      : []

    const spendingExpenses: Expense[] = replayedState
      ? getSpendingExpenses(replayedState, monthKey)
      : []

    const monthIncomes: Income[] = replayedState
      ? getIncomesByMonth(replayedState, monthKey)
      : []

    const savingsPlan: SavingsPlan | null =
      replayedState?.savingsPlans[monthKey] ?? null

    return { monthExpenses, spendingExpenses, monthIncomes, savingsPlan }
  }, [replayedState, monthKey])

  return { ...data, isLoading }
}
