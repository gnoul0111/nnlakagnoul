'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils/cn'
import { thisMonth } from '@/lib/utils/date'
import { useAppData } from '@/hooks/useAppData'
import { formatCompact } from '@/lib/utils/currency'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import type { CalendarMode } from './calendar-header'

const MONTH_LABELS = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']

interface YearViewProps {
  year:           number
  mode:           CalendarMode
  calendarEvents: WorkCalendarEvent[]
  onSelectMonth:  (monthKey: string) => void
}

export function YearView({ year, mode, calendarEvents, onSelectMonth }: YearViewProps) {
  const { expenses, allIncomes } = useAppData()
  const currentMonth = thisMonth()

  const monthData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m   = String(i + 1).padStart(2, '0')
      const key = `${year}-${m}`

      const spending = expenses
        .filter(e => e.date.startsWith(key) && !e._debtId && !e._goalId && !e._savingsMonthKey)
        .reduce((s, e) => s + e.amount, 0)

      const income = allIncomes
        .filter(inc => inc.date.startsWith(key))
        .reduce((s, i) => s + i.amount, 0)

      const eventCount = calendarEvents.filter(e => e.date.startsWith(key)).length

      return { key, spending, income, eventCount }
    })
  }, [year, expenses, allIncomes, calendarEvents])

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="grid grid-cols-3 gap-3">
        {monthData.map(({ key, spending, income, eventCount }, i) => {
          const isCurrent  = key === currentMonth
          const isFuture   = key > currentMonth
          const hasFinance = spending > 0 || income > 0
          const hasEvents  = eventCount > 0

          return (
            <button
              key={key}
              onClick={() => onSelectMonth(key)}
              className={cn(
                'rounded-xl p-3 text-left flex flex-col gap-1.5 border transition-colors',
                isCurrent
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border bg-card hover:bg-muted active:bg-muted',
                isFuture && 'opacity-50',
              )}
            >
              {/* Month label */}
              <span className={cn(
                'text-base font-bold',
                isCurrent ? 'text-primary' : 'text-foreground',
              )}>
                {MONTH_LABELS[i]}
              </span>

              {/* Finance data */}
              {mode === 'finance' && hasFinance && (
                <div className="flex flex-col gap-0.5">
                  {spending > 0 && (
                    <span className="text-[11px] text-destructive leading-none">
                      {`-${formatCompact(spending)}`}
                    </span>
                  )}
                  {income > 0 && (
                    <span className="text-[11px] text-[hsl(var(--success))] leading-none">
                      {`+${formatCompact(income)}`}
                    </span>
                  )}
                </div>
              )}

              {/* Events data */}
              {mode === 'events' && hasEvents && (
                <span className="text-[11px] text-primary leading-none">
                  {eventCount} sự kiện
                </span>
              )}

              {/* Empty */}
              {mode === 'finance' && !hasFinance && (
                <span className="text-[11px] text-muted-foreground/40 leading-none">—</span>
              )}
              {mode === 'events' && !hasEvents && (
                <span className="text-[11px] text-muted-foreground/40 leading-none">—</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
