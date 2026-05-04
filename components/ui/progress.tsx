import { cn } from '@/lib/utils/cn'
import type { BudgetAlertLevel } from '@/lib/types/budget'

interface ProgressProps {
  value: number        // 0–100
  className?: string
  level?: BudgetAlertLevel
  animated?: boolean
}

const levelColors: Record<BudgetAlertLevel, string> = {
  ok:      'bg-success',
  warning: 'bg-warning',
  danger:  'bg-orange-500',
  over:    'bg-destructive',
}

export function Progress({ value, className, level = 'ok', animated = true }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className={cn('h-2 bg-muted rounded-full overflow-hidden', className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          'h-full rounded-full',
          animated && 'transition-all duration-500',
          levelColors[level],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
