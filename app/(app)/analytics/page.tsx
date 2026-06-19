'use client'

import { useState, useMemo } from 'react'
import { PeriodSelector, getDefaultRange } from '@/components/analytics/period-selector'
import { StatsCards }       from '@/components/analytics/stats-cards'
import { DonutChart }        from '@/components/analytics/donut-chart'
import { IncomeExpenseBarChart } from '@/components/analytics/bar-chart'
import { SpendingLineChart } from '@/components/analytics/line-chart'
import { TopExpenses }       from '@/components/analytics/top-expenses'
import { CompareCard }       from '@/components/analytics/compare-card'
import { CashflowCard }      from '@/components/analytics/cashflow-card'
import { TrendChart }        from '@/components/analytics/trend-chart'
import { CategorySummary }   from '@/components/analytics/category-summary'
import { AnalyticsSkeleton } from '@/components/analytics/analytics-skeleton'
import { AiSummaryWidget }   from '@/components/ai/AiSummaryWidget'

import {
  useAnalyticsData, useCompareData,
  buildWeeklyData, buildMonthlyData,
  type PeriodRange,
} from '@/hooks/useAnalyticsData'
import { useAppData }        from '@/hooks/useAppData'
import { useBudget }         from '@/hooks/useBudget'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { calcCashflow }      from '@/lib/utils/budgetCalc'
import { thisMonth }         from '@/lib/utils/date'

export default function AnalyticsPage() {
  const [range, setRange] = useState<PeriodRange>(getDefaultRange('month'))
  const moneyHidden = false

  const { expenses, allIncomes: incomes, debts, goals, savingsPlans, isLoading } = useAppData()
  const {
    totalExpense, totalIncome, txCount, avgPerTx,
    categories, topExpenses, dailyData,
  } = useAnalyticsData(range)

  const compareData = useCompareData(range)

  // Budget cho tháng hiện tại (analytics chỉ dùng cho month view)
  const monthKey = range.type === 'month' ? range.start.slice(0, 7) : thisMonth()
  const { budget } = useBudget(monthKey)
  const budgetAmount = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0

  // Chart data theo period type
  const chartData = useMemo(() => {
    if (range.type === 'week')  return dailyData
    if (range.type === 'month') return buildWeeklyData(dailyData)
    return buildMonthlyData(expenses, incomes, parseInt(range.start.slice(0, 4)))
  }, [dailyData, range.type, expenses, incomes])

  // Cashflow chỉ cho month view
  const cashflow = useMemo(() => {
    if (range.type !== 'month') return null
    const savingsPlan = savingsPlans[monthKey] ?? null
    return calcCashflow(expenses, incomes, debts, goals, savingsPlan, monthKey)
  }, [expenses, incomes, debts, goals, savingsPlans, monthKey, range.type])

  if (isLoading) return <AnalyticsSkeleton />

  return (
    <div className="space-y-4 animate-fade-in min-w-0 overflow-x-hidden">
      {/* Period selector */}
      <PeriodSelector value={range} onChange={setRange} />

      {/* Stats cards */}
      <StatsCards
        totalExpense={totalExpense}
        totalIncome={totalIncome}
        txCount={txCount}
        avgPerTx={avgPerTx}
        budgetAmount={budgetAmount}
        moneyHidden={moneyHidden}
        periodType={range.type}
      />

      {/* Donut — category breakdown */}
      <DonutChart data={categories} moneyHidden={moneyHidden} />

      {/* Bar chart — income vs expense */}
      <IncomeExpenseBarChart data={chartData} periodType={range.type} moneyHidden={moneyHidden} />

      {/* Line chart — daily spending (only for week/month) */}
      {range.type !== 'year' && (
        <SpendingLineChart data={dailyData} moneyHidden={moneyHidden} />
      )}

      {/* Top expenses */}
      <TopExpenses expenses={topExpenses} moneyHidden={moneyHidden} />

      {/* Compare with previous period */}
      <CompareCard {...compareData} moneyHidden={moneyHidden} />

      {/* Cashflow (month only) */}
      {cashflow && (
        <CashflowCard {...cashflow} moneyHidden={moneyHidden} />
      )}

      {/* AI summary — chỉ hiện ở month view vì cần monthKey cụ thể */}
      {range.type === 'month' && (
        <AiSummaryWidget monthKey={monthKey} />
      )}

      {/* 6-month trend */}
      <TrendChart moneyHidden={moneyHidden} />

      {/* Category summary custom range */}
      <CategorySummary moneyHidden={moneyHidden} />
    </div>
  )
}