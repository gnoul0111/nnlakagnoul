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

  // Budget/cashflow/AI summary cần 1 periodKey cụ thể — chỉ có ý nghĩa cho
  // month/cycle view (week/year không map 1-1 vào 1 kỳ ngân sách).
  // monthKey="YYYY-MM" | cycleKey="YYYY-MM-DD" (= range.start, xem lib/utils/date.ts)
  const isSinglePeriod = range.type === 'month' || range.type === 'cycle'
  const monthKey = range.type === 'month' ? range.start.slice(0, 7)
    : range.type === 'cycle' ? range.start
    : thisMonth()
  const { budget } = useBudget(monthKey)
  const budgetAmount = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0

  // Chart data theo period type
  const chartData = useMemo(() => {
    if (range.type === 'week')  return dailyData
    if (range.type === 'month' || range.type === 'cycle') return buildWeeklyData(dailyData)
    return buildMonthlyData(expenses, incomes, parseInt(range.start.slice(0, 4)))
  }, [dailyData, range.type, expenses, incomes])

  // Cashflow chỉ cho month/cycle view
  const cashflow = useMemo(() => {
    if (!isSinglePeriod) return null
    const savingsPlan = savingsPlans[monthKey] ?? null
    return calcCashflow(expenses, incomes, debts, goals, savingsPlan, monthKey)
  }, [expenses, incomes, debts, goals, savingsPlans, monthKey, isSinglePeriod])

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

      {/* Line chart — daily spending (only for week/month/cycle) */}
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

      {/* AI summary — chỉ hiện ở month/cycle view vì cần 1 periodKey cụ thể */}
      {isSinglePeriod && (
        <AiSummaryWidget periodKey={monthKey} range={{ start: range.start, end: range.end }} label={range.label} />
      )}

      {/* 6-month trend */}
      <TrendChart moneyHidden={moneyHidden} />

      {/* Category summary custom range */}
      <CategorySummary moneyHidden={moneyHidden} />
    </div>
  )
}