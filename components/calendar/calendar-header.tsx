'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export type CalendarMode = 'finance' | 'events'
export type CalendarView = 'day' | 'week' | 'month' | 'year'

const MODE_TABS: { id: CalendarMode; label: string }[] = [
  { id: 'finance', label: '₫ Tài chính' },
  { id: 'events',  label: '📅 Sự kiện'  },
]

const VIEW_TABS: { id: CalendarView; label: string }[] = [
  { id: 'day',   label: 'Ngày'  },
  { id: 'week',  label: 'Tuần'  },
  { id: 'month', label: 'Tháng' },
  { id: 'year',  label: 'Năm'   },
]

interface CalendarHeaderProps {
  mode:         CalendarMode
  view:         CalendarView
  periodLabel:  string
  isAtToday:    boolean
  onModeChange: (mode: CalendarMode) => void
  onViewChange: (view: CalendarView) => void
  onNavigate:   (dir: -1 | 1) => void
  onToday:      () => void
}

export function CalendarHeader({
  mode, view, periodLabel, isAtToday,
  onModeChange, onViewChange, onNavigate, onToday,
}: CalendarHeaderProps) {
  return (
    <div className="space-y-3 px-4 pt-3 pb-2 bg-card border-b border-border">
      {/* Mode toggle */}
      <div className="flex bg-muted rounded-xl p-1">
        {MODE_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onModeChange(tab.id)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
              mode === tab.id
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex bg-muted rounded-xl p-1">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors',
              view === tab.id
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Navigation row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate(-1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Kỳ trước"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Period label — click to jump to today */}
        <button
          onClick={onToday}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
            isAtToday
              ? 'text-foreground cursor-default'
              : 'text-primary hover:bg-primary/10',
          )}
        >
          {periodLabel}
        </button>

        <button
          onClick={() => onNavigate(1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Kỳ tiếp"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
