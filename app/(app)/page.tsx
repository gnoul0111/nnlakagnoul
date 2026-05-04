'use client'

import { useMemo } from 'react'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useAppData, useMonthData } from '@/hooks/useAppData'
import { useCurrentMonth } from '@/hooks/useCurrentMonth'
import { useBudget } from '@/hooks/useBudget'

import { MonthPicker } from '@/components/dashboard/month-picker'
import { StatsGrid } from '@/components/dashboard/stats-grid'
import { BudgetProgress } from '@/components/dashboard/budget-progress'
import { SavingsSummary } from '@/components/dashboard/savings-summary'
import { DebtAlerts } from '@/components/dashboard/debt-alerts'
import { RecentExpenses } from '@/components/dashboard/recent-expenses'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { QuickAddFab } from '@/components/dashboard/quick-add-fab'

import { calcCashflow } from '@/lib/utils/budgetCalc'
import { computeTotalDeposited } from '@/lib/types/savings'
import { isDebtOverdue, isDebtUpcoming } from '@/lib/types/debt'
import { today } from '@/lib/utils/date'

export default function DashboardPage() {
  const user            = useAuthStore(s => s.user)
  const toggleHidden    = useSettingsStore(s => s.toggleMoneyHidden)
  const moneyHidden     = useSettingsStore(selectMoneyHidden)

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
        totalExpense={cashflow.totalCashOut}
        totalIncome={cashflow.totalIncome}
        balance={cashflow.netBalance}
        savingsDeposited={savingsDeposited}
        savingsTarget={savingsPlan?.targetAmount ?? 0}
        moneyHidden={moneyHidden}
        onToggleHidden={() => user && toggleHidden(user.uid)}
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

      {/* Recent expenses */}
      <RecentExpenses expenses={monthExpenses} moneyHidden={moneyHidden} />

      {/* Mobile FAB — thêm nhanh thu/chi, chỉ hiện trên mobile */}
      <QuickAddFab />
    </div>
  )
}