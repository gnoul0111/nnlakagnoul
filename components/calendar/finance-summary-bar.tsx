'use client'

import { usePeriodFinanceSummary } from '@/hooks/useCalendarData'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { formatVND } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

const HIDDEN = '••••'

interface FinanceSummaryBarProps {
  start: string  // YYYY-MM-DD
  end:   string  // YYYY-MM-DD
}

export function FinanceSummaryBar({ start, end }: FinanceSummaryBarProps) {
  const { totalSpending, totalIncome, balance } = usePeriodFinanceSummary(start, end)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const fmt = (n: number) => moneyHidden ? HIDDEN : formatVND(n)

  return (
    <div className="flex items-stretch divide-x divide-border border-b border-border bg-card">
      <div className="flex-1 flex flex-col items-center py-2.5 px-2">
        <span className="text-[11px] text-muted-foreground mb-0.5">Thu</span>
        <span className="text-sm font-semibold text-[hsl(var(--success))]">
          {fmt(totalIncome)}
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center py-2.5 px-2">
        <span className="text-[11px] text-muted-foreground mb-0.5">Chi</span>
        <span className="text-sm font-semibold text-destructive">
          {fmt(totalSpending)}
        </span>
      </div>
      <div className="flex-1 flex flex-col items-center py-2.5 px-2">
        <span className="text-[11px] text-muted-foreground mb-0.5">Số dư</span>
        <span className={cn(
          'text-sm font-semibold',
          balance >= 0 ? 'text-foreground' : 'text-destructive',
        )}>
          {fmt(balance)}
        </span>
      </div>
    </div>
  )
}
