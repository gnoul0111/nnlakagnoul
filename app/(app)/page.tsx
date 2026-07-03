'use client'

import { useMemo } from 'react'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden, selectSalaryDay } from '@/lib/store/settingsStore'
import { SECONDARY_METRICS } from '@/lib/dashboard/metricCatalog'
import { useAppData, useMonthData } from '@/hooks/useAppData'
import { usePeriod } from '@/hooks/usePeriod'
import { useBudget } from '@/hooks/useBudget'

import { MonthPicker } from '@/components/dashboard/month-picker'
import { StatsGrid } from '@/components/dashboard/stats-grid'
import { BudgetProgress } from '@/components/dashboard/budget-progress'
import { SavingsSummary } from '@/components/dashboard/savings-summary'
import { DebtAlerts } from '@/components/dashboard/debt-alerts'
import { RecentExpenses } from '@/components/dashboard/recent-expenses'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { QuickAddFab } from '@/components/dashboard/quick-add-fab'
import { AiSummaryWidget } from '@/components/ai/AiSummaryWidget'

import { CalendarDays } from 'lucide-react'
import { calcCashflow } from '@/lib/utils/budgetCalc'
import { computeTotalDeposited } from '@/lib/types/savings'
import { isDebtOverdue, isDebtUpcoming, computePaidAmount, computeRemaining } from '@/lib/types/debt'
import { today, prevMonth, prevCycle, daysDiff } from '@/lib/utils/date'

/** % thay đổi so với kỳ trước. null nếu kỳ trước = 0 (không so được). */
function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return null
  return Math.round(((cur - prev) / Math.abs(prev)) * 100)
}

export default function DashboardPage() {
  const user            = useAuthStore(s => s.user)
  const toggleHidden    = useSettingsStore(s => s.toggleMoneyHidden)
  const moneyHidden     = useSettingsStore(selectMoneyHidden)
  const salaryDay       = useSettingsStore(selectSalaryDay)

  const period = usePeriod()
  const { periodKey: currentMonth, range, goToPrev: goToPrevMonth, goToNext: goToNextMonth, goToToday, isCurrentPeriod: isCurrentMonth, isCycleMode } = period

  // ─── Data ─────────────────────────────────────────────────────────────────
  const { expenses, goals, debts, allIncomes, savingsPlans, isLoading } = useAppData()
  const { monthExpenses, spendingExpenses, monthIncomes, savingsPlan } = useMonthData(currentMonth)
  const { budget }                                  = useBudget(currentMonth)

  // ─── Computed ─────────────────────────────────────────────────────────────
  // goals được giữ để calcCashflow tính đúng goalSavedTotal (tiền nạp vào mục tiêu tháng này).
  // UI section Mục tiêu ở dashboard đã ẩn — nhưng cashflow vẫn cần goals để ra số đúng.
  const cashflow = useMemo(
    () => calcCashflow(expenses, monthIncomes, debts, goals, savingsPlan, currentMonth),
    [expenses, monthIncomes, debts, goals, savingsPlan, currentMonth],
  )

  // Cashflow kỳ trước → tính % so với kỳ trước cho hero
  const prevKey = isCycleMode ? prevCycle(currentMonth, salaryDay) : prevMonth(currentMonth)
  const prevCashflow = useMemo(
    () => calcCashflow(expenses, allIncomes, debts, goals, savingsPlans[prevKey] ?? null, prevKey),
    [expenses, allIncomes, debts, goals, savingsPlans, prevKey],
  )

  const savingsDeposited = savingsPlan ? computeTotalDeposited(savingsPlan) : 0

  // ── Hero (Thu / Chi / Số dư) + trend % ──────────────────────────────────────
  const hero = {
    income:           cashflow.totalIncome,
    consumption:      cashflow.consumptionTotal,
    balance:          cashflow.netBalance,
    incomeTrend:      pctChange(cashflow.totalIncome,     prevCashflow.totalIncome),
    consumptionTrend: pctChange(cashflow.consumptionTotal, prevCashflow.consumptionTotal),
    balanceTrend:     pctChange(cashflow.netBalance,      prevCashflow.netBalance),
    spendRatio:       cashflow.totalIncome > 0
      ? (cashflow.consumptionTotal / cashflow.totalIncome) * 100
      : (cashflow.consumptionTotal > 0 ? 100 : 0),
  }

  // ── Thẻ phụ: giá trị + mục tiêu + tiến độ ───────────────────────────────────
  const borrowDebts     = debts.filter(d => !d.deleted && d.type === 'borrow')
  const totalDebtAmount = borrowDebts.reduce((s, d) => s + d.amount, 0)
  const totalDebtPaid   = borrowDebts.reduce((s, d) => s + computePaidAmount(d), 0)
  const totalDebtRemaining = borrowDebts.reduce((s, d) => s + computeRemaining(d), 0)
  const activeGoals     = goals.filter(g => !g.deleted)
  const totalGoalTarget = activeGoals.reduce((s, g) => s + (g.targetAmount  ?? 0), 0)
  const totalGoalCurrent= activeGoals.reduce((s, g) => s + (g.currentAmount ?? 0), 0)
  const savingsTarget   = savingsPlan?.targetAmount ?? 0

  const cardValues: Record<string, { value: number; target: number; progressPct: number }> = {
    savings: { value: savingsDeposited,         target: savingsTarget,   progressPct: savingsTarget   > 0 ? (savingsDeposited / savingsTarget)   * 100 : 0 },
    debt:    { value: cashflow.debtPaidTotal,   target: totalDebtRemaining, progressPct: totalDebtAmount > 0 ? (totalDebtPaid / totalDebtAmount) * 100 : 0 },
    goal:    { value: cashflow.goalSavedTotal,  target: totalGoalTarget, progressPct: totalGoalTarget > 0 ? (totalGoalCurrent / totalGoalTarget) * 100 : 0 },
  }

  const budgetAmount     = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0
  const spendingTotal    = spendingExpenses.reduce((s, e) => s + e.amount, 0)
  const todayStr         = today()

  const remainingDays = isCurrentMonth
    ? Math.max(1, daysDiff(todayStr, range.end) + 1)
    : 0
  const dailyBudgetAmount = budgetAmount > 0 && remainingDays > 0
    ? Math.round(Math.max(0, budgetAmount - spendingTotal) / remainingDays)
    : 0

  const dailyCard = {
    id: 'daily-budget',
    label: 'Dự kiến/ngày',
    icon: CalendarDays,
    color: 'bg-teal-500/10',
    iconColor: 'text-teal-500',
    barColor: 'bg-teal-500',
    href: '/finance?tab=budget',
    targetLabel: '',
    value: dailyBudgetAmount,
    target: 0,
    progressPct: 0,
    subtitle: remainingDays > 0 ? `Còn ${remainingDays} ngày` : undefined,
  }

  // Hiển thị tất cả thẻ phụ (đã bỏ tính năng tùy chỉnh bật/tắt)
  const cards = [dailyCard, ...SECONDARY_METRICS.map(m => ({ ...m, ...cardValues[m.id] }))]

  const alertDebts       = debts.filter(
    d => !d.deleted && (isDebtOverdue(d, todayStr) || isDebtUpcoming(d, todayStr)),
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) return <DashboardSkeleton />

  return (
    <div className="space-y-4 animate-fade-in w-full max-w-6xl mx-auto">
      {/* Month picker */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Tổng quan</h2>
        <MonthPicker
          label={period.label}
          onPrev={goToPrevMonth}
          onNext={goToNextMonth}
          onToday={goToToday}
          isCurrentMonth={isCurrentMonth}
        />
      </div>

      {/* Tổng quan: hero + ngân sách + thẻ phụ */}
      <StatsGrid
        hero={hero}
        cards={cards}
        moneyHidden={moneyHidden}
        onToggleHidden={() => user && toggleHidden(user.uid)}
        budgetSlot={
          <BudgetProgress
            budgetAmount={budgetAmount}
            usedAmount={spendingTotal}
            moneyHidden={moneyHidden}
          />
        }
      />

      {/* Savings plan */}
      <SavingsSummary plan={savingsPlan} moneyHidden={moneyHidden} />

      {/* Debt alerts */}
      {alertDebts.length > 0 && (
        <DebtAlerts debts={alertDebts} moneyHidden={moneyHidden} />
      )}

      {/* AI summary */}
      <AiSummaryWidget periodKey={currentMonth} range={range} label={period.label} />

      {/* Recent expenses */}
      <RecentExpenses expenses={monthExpenses} moneyHidden={moneyHidden} />

      {/* Mobile FAB — thêm nhanh thu/chi, chỉ hiện trên mobile */}
      <QuickAddFab />
    </div>
  )
}