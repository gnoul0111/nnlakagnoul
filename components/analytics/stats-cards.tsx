'use client'

import Link from 'next/link'
import { TrendingDown, Hash, Calculator, PiggyBank, Wallet } from 'lucide-react'
import { formatMoney } from '@/lib/utils/currency'
import { getBudgetAlertLevel } from '@/lib/types/budget'
import { cn } from '@/lib/utils/cn'
import type { PeriodType } from '@/hooks/useAnalyticsData'

interface StatsCardsProps {
  totalExpense:      number
  totalIncome:       number
  txCount:           number
  avgPerTx:          number
  budgetAmount:      number
  moneyHidden:       boolean
  periodType:        PeriodType
  // Savings (chỉ hiện với month view)
  savingsDeposited?: number
  savingsTarget?:    number
}

const alertColors = {
  ok:      'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]',
  warning: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]',
  danger:  'text-orange-500 bg-orange-500/10',
  over:    'text-destructive bg-destructive/10',
}

export function StatsCards({
  totalExpense, totalIncome, txCount, avgPerTx,
  budgetAmount, moneyHidden, periodType,
  savingsDeposited, savingsTarget,
}: StatsCardsProps) {
  const budgetLevel = getBudgetAlertLevel(totalExpense, budgetAmount)
  const budgetPct   = budgetAmount > 0
    ? Math.min(100, Math.round((totalExpense / budgetAmount) * 100))
    : null

  const isWeek        = periodType === 'week'
  const showSavings   = periodType === 'month' &&
    (savingsDeposited !== undefined || savingsTarget !== undefined)
  const savingsPct    = savingsTarget && savingsTarget > 0 && savingsDeposited !== undefined
    ? Math.min(100, Math.round((savingsDeposited / savingsTarget) * 100))
    : null

  return (
    <div className="space-y-3">
      {/* Main 2×2 grid */}
      <div className={cn('grid gap-3', isWeek ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>

        {/* Tổng chi */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tổng chi</span>
            <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center">
              <TrendingDown className="w-3.5 h-3.5 text-destructive" />
            </div>
          </div>
          <p className={cn('text-xl font-bold text-foreground', moneyHidden && 'blur-sm')}>
            {formatMoney(totalExpense, moneyHidden)}
          </p>
          {budgetPct !== null && (
            <span className={cn('inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full', alertColors[budgetLevel])}>
              {budgetPct}% ngân sách
            </span>
          )}
        </div>

        {/* Số giao dịch */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Giao dịch</span>
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Hash className="w-3.5 h-3.5 text-primary" />
            </div>
          </div>
          <p className="text-xl font-bold text-foreground">{txCount}</p>
          {!isWeek && avgPerTx > 0 && (
            <p className={cn('text-xs text-muted-foreground', moneyHidden && 'blur-sm')}>
              TB: {formatMoney(avgPerTx, moneyHidden)}
            </p>
          )}
        </div>

        {!isWeek && (
          <>
            {/* Tổng thu */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Tổng thu</span>
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--success)/0.1)] flex items-center justify-center">
                  <PiggyBank className="w-3.5 h-3.5 text-[hsl(var(--success))]" />
                </div>
              </div>
              <p className={cn('text-xl font-bold text-[hsl(var(--success))]', moneyHidden && 'blur-sm')}>
                {formatMoney(totalIncome, moneyHidden)}
              </p>
              {totalIncome > 0 && totalExpense > 0 && (
                <p className={cn('text-xs text-muted-foreground', moneyHidden && 'blur-sm')}>
                  Còn lại: {formatMoney(Math.max(0, totalIncome - totalExpense), moneyHidden)}
                </p>
              )}
            </div>

            {/* TB / giao dịch */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">TB / giao dịch</span>
                <div className="w-7 h-7 rounded-lg bg-[hsl(var(--warning)/0.1)] flex items-center justify-center">
                  <Calculator className="w-3.5 h-3.5 text-[hsl(var(--warning))]" />
                </div>
              </div>
              <p className={cn('text-xl font-bold text-foreground', moneyHidden && 'blur-sm')}>
                {formatMoney(avgPerTx, moneyHidden)}
              </p>
              <p className="text-xs text-muted-foreground">{txCount} giao dịch</p>
            </div>
          </>
        )}
      </div>

      {/* Savings card — chỉ hiện ở month view, full width, clickable */}
      {showSavings && (
        <Link href="/finance?tab=savings"
          className="block bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Tiết kiệm tháng này
            </span>
            <div className="flex items-center gap-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Xem chi tiết →
              </span>
            </div>
          </div>

          <div className="flex items-end gap-3">
            <p className={cn('text-xl font-bold text-foreground', moneyHidden && 'blur-sm')}>
              {formatMoney(savingsDeposited ?? 0, moneyHidden)}
            </p>
            {savingsTarget !== undefined && savingsTarget > 0 && (
              <p className={cn('text-sm text-muted-foreground mb-0.5', moneyHidden && 'blur-sm')}>
                / {formatMoney(savingsTarget, moneyHidden)}
              </p>
            )}
            {savingsPct !== null && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-auto mb-0.5">
                {savingsPct}%
              </span>
            )}
          </div>

          {/* Progress bar */}
          {savingsPct !== null && (
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${savingsPct}%` }}
              />
            </div>
          )}
        </Link>
      )}
    </div>
  )
}
