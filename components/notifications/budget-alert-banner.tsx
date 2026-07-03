'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { useAppData }           from '@/hooks/useAppData'
import { useBudget }            from '@/hooks/useBudget'
import {
  useSettingsStore, selectMoneyHidden, selectIsCycleModeActive, selectSalaryDay,
} from '@/lib/store/settingsStore'
import { formatVND }            from '@/lib/utils/currency'
import { thisMonth, today, getSalaryCycleRange, startOfMonth, endOfMonth } from '@/lib/utils/date'
import { cn }                   from '@/lib/utils/cn'
import { isConsumptionExpense } from '@/lib/types/expense'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hiện banner khi chi tiêu đạt ngưỡng này */
const ALERT_THRESHOLD = 0.80  // 80%

/** localStorage key lưu ngày đã bấm "bỏ qua" — format YYYY-MM-DD */
const DISMISS_KEY = 'chitieu_budget_alert_dismissed'

// ─── localStorage helpers ──────────────────────────────────────────────────────

function getDismissedDate(): string {
  try { return localStorage.getItem(DISMISS_KEY) ?? '' }
  catch { return '' }
}

function saveDismissedDate(date: string): void {
  try { localStorage.setItem(DISMISS_KEY, date) }
  catch { /* ignore */ }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BudgetAlertBanner() {
  const cycleModeEnabled = useSettingsStore(selectIsCycleModeActive)
  const salaryDay         = useSettingsStore(selectSalaryDay)
  const todayStr    = today()
  const cycle       = cycleModeEnabled ? getSalaryCycleRange(todayStr, salaryDay) : null
  const periodKey   = cycle ? cycle.cycleKey : thisMonth()
  const range       = cycle ? { start: cycle.start, end: cycle.end } : { start: startOfMonth(thisMonth()), end: endOfMonth(thisMonth()) }
  const { expenses } = useAppData()
  const { budget, isLoading } = useBudget(periodKey)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  // Dismissed state — đọc từ localStorage sau khi mount (tránh hydration mismatch)
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    setDismissed(getDismissedDate() === todayStr)
  }, [todayStr])

  const { usedAmount, budgetAmount, usedPct, shouldShow } = useMemo(() => {
    if (!budget) return { usedAmount: 0, budgetAmount: 0, usedPct: 0, shouldShow: false }

    const budgetAmount = budget.spendingAmount ?? budget.amount ?? 0
    if (budgetAmount <= 0) return { usedAmount: 0, budgetAmount, usedPct: 0, shouldShow: false }

    const usedAmount = expenses
      .filter(e => e.date >= range.start && e.date <= range.end && isConsumptionExpense(e))
      .reduce((s, e) => s + e.amount, 0)

    const usedPct = usedAmount / budgetAmount
    return { usedAmount, budgetAmount, usedPct, shouldShow: usedPct >= ALERT_THRESHOLD }
  }, [budget, expenses, range.start, range.end])

  const handleDismiss = () => {
    saveDismissedDate(todayStr)
    setDismissed(true)
  }

  // Không hiện khi: loading, không có budget, chưa đủ ngưỡng, đã dismiss hôm nay
  if (isLoading || !shouldShow || dismissed) return null

  const isOver    = usedPct >= 1
  const pctLabel  = Math.round(usedPct * 100)
  const remaining = Math.max(0, budgetAmount - usedAmount)
  const overBy    = Math.max(0, usedAmount - budgetAmount)
  const fmt       = (n: number) => moneyHidden ? '••••' : formatVND(n)

  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium shrink-0',
        isOver
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]',
      )}
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />

      <span className="flex-1 leading-snug">
        {isOver ? (
          <>Đã <strong>vượt ngân sách {pctLabel}%</strong> — vượt {fmt(overBy)}</>
        ) : (
          <>Đã dùng <strong>{pctLabel}%</strong> ngân sách — còn lại {fmt(remaining)}</>
        )}
      </span>

      <button
        onClick={handleDismiss}
        className="w-6 h-6 rounded flex items-center justify-center opacity-75 hover:opacity-100 transition-opacity shrink-0"
        aria-label="Bỏ qua cảnh báo hôm nay"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
