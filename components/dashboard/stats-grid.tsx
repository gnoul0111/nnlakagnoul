'use client'

import { Eye, EyeOff, TrendingDown, TrendingUp, Wallet, PiggyBank } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils/cn'

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:     string
  amount:    number
  icon:      React.ReactNode
  color:     string
  iconColor: string
  hidden:    boolean
  trend?:    { value: number; positive: boolean }
}

function StatCard({ label, amount, icon, color, iconColor, hidden, trend }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <div className={cn('w-4 h-4', iconColor)}>{icon}</div>
        </div>
      </div>

      <div>
        {/* AnimatedNumber: số đếm mượt khi đổi tháng */}
        <p className="text-xl sm:text-2xl font-bold text-foreground leading-none">
          <AnimatedNumber value={amount} hidden={hidden} />
        </p>

        {trend && !hidden && (
          <p className={cn(
            'flex items-center gap-0.5 text-xs mt-1.5 font-medium',
            trend.positive ? 'text-success' : 'text-destructive',
          )}>
            {trend.positive
              ? <TrendingDown className="w-3 h-3" />
              : <TrendingUp   className="w-3 h-3" />
            }
            {Math.abs(trend.value)}% so với tháng trước
          </p>
        )}
      </div>
    </div>
  )
}

// ─── StatsGrid ────────────────────────────────────────────────────────────────

interface StatsGridProps {
  totalExpense:     number
  totalIncome:      number
  balance:          number
  savingsDeposited: number
  savingsTarget:    number
  moneyHidden:      boolean
  onToggleHidden:   () => void
}

export function StatsGrid({
  totalExpense, totalIncome, balance,
  savingsDeposited, savingsTarget,
  moneyHidden, onToggleHidden,
}: StatsGridProps) {
  return (
    <div className="space-y-3 animate-reveal">
      {/* Toggle + label */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Tổng quan tháng
        </h2>
        <button
          onClick={onToggleHidden}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted w-[105px] justify-start"
          aria-label={moneyHidden ? 'Hiện số tiền' : 'Ẩn số tiền'}
        >
          {moneyHidden
            ? <EyeOff className="w-3.5 h-3.5 shrink-0" />
            : <Eye    className="w-3.5 h-3.5 shrink-0" />
          }
          <span>{moneyHidden ? 'Hiện' : 'Ẩn'} số tiền</span>
        </button>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Tổng chi" amount={totalExpense}
          icon={<TrendingDown className="w-4 h-4" />}
          color="bg-destructive/10" iconColor="text-destructive"
          hidden={moneyHidden}
        />
        <StatCard
          label="Tổng thu" amount={totalIncome}
          icon={<TrendingUp className="w-4 h-4" />}
          color="bg-success/10" iconColor="text-success"
          hidden={moneyHidden}
        />
        <StatCard
          label="Số dư" amount={balance}
          icon={<Wallet className="w-4 h-4" />}
          color="bg-primary/10" iconColor="text-primary"
          hidden={moneyHidden}
        />
        <StatCard
          label="Tiết kiệm" amount={savingsDeposited}
          icon={<PiggyBank className="w-4 h-4" />}
          color="bg-purple-500/10" iconColor="text-purple-500"
          hidden={moneyHidden}
        />
      </div>
    </div>
  )
}