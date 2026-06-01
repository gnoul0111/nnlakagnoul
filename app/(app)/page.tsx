'use client'

import { useMemo, useState } from 'react'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden, selectDashboardMetrics } from '@/lib/store/settingsStore'
import type { MetricValues } from '@/lib/dashboard/metricCatalog'
import { useAppData, useMonthData } from '@/hooks/useAppData'
import { useCurrentMonth } from '@/hooks/useCurrentMonth'
import { useBudget } from '@/hooks/useBudget'

import { MonthPicker } from '@/components/dashboard/month-picker'
import { StatsGrid } from '@/components/dashboard/stats-grid'
import { DashboardCustomizeSheet } from '@/components/dashboard/dashboard-customize-sheet'
import { BudgetProgress } from '@/components/dashboard/budget-progress'
import { SavingsSummary } from '@/components/dashboard/savings-summary'
import { DebtAlerts } from '@/components/dashboard/debt-alerts'
import { RecentExpenses } from '@/components/dashboard/recent-expenses'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { QuickAddFab } from '@/components/dashboard/quick-add-fab'
import { AiSummaryWidget } from '@/components/ai/AiSummaryWidget'

import { calcCashflow } from '@/lib/utils/budgetCalc'
import { computeTotalDeposited } from '@/lib/types/savings'
import { isDebtOverdue, isDebtUpcoming } from '@/lib/types/debt'
import { today } from '@/lib/utils/date'

export default function DashboardPage() {
  const user            = useAuthStore(s => s.user)
  const toggleHidden    = useSettingsStore(s => s.toggleMoneyHidden)
  const moneyHidden     = useSettingsStore(selectMoneyHidden)
  const dashboardMetrics = useSettingsStore(selectDashboardMetrics)
  const updateSettings   = useSettingsStore(s => s.updateSettings)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const {
    currentMonth, goToPrevMonth, goToNextMonth, goToToday, isCurrentMonth,
  } = useCurrentMonth()

  // ─── Data ─────────────────────────────────────────────────────────────────
  const { expenses, goals, debts, isLoading }      = useAppData()
  const { monthExpenses, spendingExpenses, monthIncomes, savingsPlan } = useMonthData(currentMonth)
  const { budget }                                  = useBudget(currentMonth)

  // ─── Computed ─────────────────────────────────────────────────────────────
  // goals được giữ để calcCashflow tính đúng goalSavedTotal (tiền nạp vào mục tiêu tháng này).
  // UI section Mục tiêu ở dashboard đã ẩn — nhưng cashflow vẫn cần goals để ra số đúng.
  const cashflow = useMemo(
    () => calcCashflow(expenses, monthIncomes, debts, goals, savingsPlan, currentMonth),
    [expenses, monthIncomes, debts, goals, savingsPlan, currentMonth],
  )

  const savingsDeposited = savingsPlan ? computeTotalDeposited(savingsPlan) : 0

  // Mọi chỉ số đều được tính đủ (rẻ) — StatsGrid chỉ chọn hiển thị thẻ nào theo settings.
  const metrics: MetricValues = {
    income:      cashflow.totalIncome,
    consumption: cashflow.consumptionTotal,
    balance:     cashflow.netBalance,
    savings:     savingsDeposited,
    debt:        cashflow.debtPaidTotal,
    goal:        cashflow.goalSavedTotal,
    transfer:    cashflow.transferOut,
  }
  const budgetAmount     = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0
  const spendingTotal    = spendingExpenses.reduce((s, e) => s + e.amount, 0)
  const todayStr         = today()
  const alertDebts       = debts.filter(
    d => !d.deleted && (isDebtOverdue(d, todayStr) || isDebtUpcoming(d, todayStr)),
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Month picker */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Tổng quan</h2>
        <MonthPicker
          currentMonth={currentMonth}
          onPrev={goToPrevMonth}
          onNext={goToNextMonth}
          onToday={goToToday}
          isCurrentMonth={isCurrentMonth}
        />
      </div>

      {/* Stats 2x2 */}
      <StatsGrid
        metrics={metrics}
        metricIds={dashboardMetrics}
        moneyHidden={moneyHidden}
        onToggleHidden={() => user && toggleHidden(user.uid)}
        onCustomize={() => setCustomizeOpen(true)}
      />

      <DashboardCustomizeSheet
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        enabledIds={dashboardMetrics}
        onChange={ids => user && updateSettings(user.uid, { dashboardMetrics: ids })}
      />

      {/* Budget progress */}
      <BudgetProgress
        budgetAmount={budgetAmount}
        usedAmount={spendingTotal}
        moneyHidden={moneyHidden}
      />

      {/* Savings plan */}
      <SavingsSummary plan={savingsPlan} moneyHidden={moneyHidden} />

      {/* Debt alerts */}
      {alertDebts.length > 0 && (
        <DebtAlerts debts={alertDebts} moneyHidden={moneyHidden} />
      )}

      {/* AI summary */}
      <AiSummaryWidget monthKey={currentMonth} />

      {/* Recent expenses */}
      <RecentExpenses expenses={monthExpenses} moneyHidden={moneyHidden} />

      {/* Mobile FAB — thêm nhanh thu/chi, chỉ hiện trên mobile */}
      <QuickAddFab />
    </div>
  )
}