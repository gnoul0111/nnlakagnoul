'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthLabel } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

interface MonthPickerProps {
  currentMonth: string         // YYYY-MM
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  isCurrentMonth: boolean
  className?: string
}

export function MonthPicker({
  currentMonth, onPrev, onNext, onToday, isCurrentMonth, className,
}: MonthPickerProps) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        onClick={onPrev}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        aria-label="Tháng trước"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <button
        onClick={onToday}
        disabled={isCurrentMonth}
        className={cn(
          'px-3 h-8 rounded-lg text-sm font-semibold transition-colors min-w-[120px] text-center',
          isCurrentMonth
            ? 'text-foreground cursor-default'
            : 'text-primary hover:bg-primary/10',
        )}
      >
        {formatMonthLabel(currentMonth)}
      </button>

      <button
        onClick={onNext}
        disabled={isCurrentMonth}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
        aria-label="Tháng sau"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}
