'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils/cn'
import { today, parseLocalDate, toLocalDateString, getWeekRange } from '@/lib/utils/date'
import { useAppData } from '@/hooks/useAppData'
import { formatCompact } from '@/lib/utils/currency'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { isLinkedExpense } from '@/lib/types/expense'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import type { CalendarMode } from './calendar-header'

const VI_DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const EVENT_CAT_BG: Record<string, string> = {
  work:     'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  personal: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  health:   'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  other:    'bg-muted text-muted-foreground',
}

interface WeekViewProps {
  anchor:         string   // any YYYY-MM-DD in the week
  mode:           CalendarMode
  calendarEvents: WorkCalendarEvent[]
  selectedDate:   string | null
  onSelectDate:   (date: string) => void
}

export function WeekView({ anchor, mode, calendarEvents, selectedDate, onSelectDate }: WeekViewProps) {
  const moneyHidden = false
  const { expenses, allIncomes } = useAppData()
  const todayStr = today()

  const weekDates = useMemo(() => {
    const { start, end } = getWeekRange(anchor, 'monday')
    const dates: string[] = []
    const d = parseLocalDate(start)
    while (toLocalDateString(d) <= end) {
      dates.push(toLocalDateString(d))
      d.setDate(d.getDate() + 1)
    }
    return dates
  }, [anchor])

  // Aggregate per-day spending
  const spendingMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of expenses) {
      if (isLinkedExpense(e)) continue
      map[e.date] = (map[e.date] ?? 0) + e.amount
    }
    return map
  }, [expenses])

  // Aggregate per-day income
  const incomeMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const i of allIncomes) map[i.date] = (map[i.date] ?? 0) + i.amount
    return map
  }, [allIncomes])

  // Map date → events
  const eventMap = useMemo(() => {
    const map: Record<string, WorkCalendarEvent[]> = {}
    for (const e of calendarEvents) map[e.date] = [...(map[e.date] ?? []), e]
    return map
  }, [calendarEvents])

  return (
    <div>
      <div className="grid grid-cols-7 h-full divide-x divide-border min-h-[200px]">
        {weekDates.map(dateStr => {
          const spending   = spendingMap[dateStr] ?? 0
          const income     = incomeMap[dateStr] ?? 0
          const dayEvents  = eventMap[dateStr] ?? []
          const isToday    = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const d          = parseLocalDate(dateStr)
          const dow        = VI_DOW_SHORT[d.getDay()]
          const dayNum     = d.getDate()

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={cn(
                'flex flex-col items-center pt-3 px-1 pb-2 gap-1.5 transition-colors',
                isSelected ? 'bg-primary/10' : 'hover:bg-muted active:bg-muted',
              )}
            >
              {/* Day header */}
              <span className="text-[10px] text-muted-foreground font-medium">{dow}</span>
              <span className={cn(
                'w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold shrink-0',
                isToday
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground',
              )}>
                {dayNum}
              </span>

              {/* Finance mode */}
              {mode === 'finance' && (
                <div className="flex flex-col items-center gap-0.5 w-full">
                  {spending > 0 && (
                    <span className="text-[10px] text-destructive font-medium leading-none">
                      {moneyHidden ? '••' : `-${formatCompact(spending)}`}
                    </span>
                  )}
                  {income > 0 && (
                    <span className="text-[10px] text-[hsl(var(--success))] font-medium leading-none">
                      {moneyHidden ? '••' : `+${formatCompact(income)}`}
                    </span>
                  )}
                </div>
              )}

              {/* Events mode */}
              {mode === 'events' && dayEvents.length > 0 && (
                <div className="flex flex-col gap-1 w-full">
                  {dayEvents.slice(0, 3).map(e => (
                    <span
                      key={e.id}
                      className={cn(
                        'text-[9px] leading-tight rounded px-1 py-0.5 truncate w-full text-center',
                        EVENT_CAT_BG[e.category] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {e.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-muted-foreground text-center leading-none">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}