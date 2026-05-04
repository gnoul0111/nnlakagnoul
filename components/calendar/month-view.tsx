'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils/cn'
import { today } from '@/lib/utils/date'
import { useDailySpendingMap } from '@/hooks/useCalendarData'
import { formatCompact } from '@/lib/utils/currency'
import { useSettingsStore } from '@/lib/store/settingsStore'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import type { CalendarMode } from './calendar-header'

// T2 đầu tuần
const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const EVENT_CAT_COLORS: Record<string, string> = {
  work:     'bg-blue-500',
  personal: 'bg-purple-500',
  health:   'bg-green-500',
  other:    'bg-gray-400',
}

interface MonthViewProps {
  monthKey:       string   // YYYY-MM
  mode:           CalendarMode
  calendarEvents: WorkCalendarEvent[]
  selectedDate:   string | null
  onSelectDate:   (date: string) => void
}

export function MonthView({
  monthKey, mode, calendarEvents, selectedDate, onSelectDate,
}: MonthViewProps) {
  const moneyHidden = false
  const spendingMap = useDailySpendingMap(monthKey)
  const todayStr    = today()

  // Build grid cells (padding nulls for prev/next month)
  const cells = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number)
    const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7  // 0=Mon … 6=Sun
    const daysInMonth = new Date(y, m, 0).getDate()

    const result: (string | null)[] = []
    for (let i = 0; i < firstDow; i++)       result.push(null)
    for (let d = 1; d <= daysInMonth; d++)   result.push(`${monthKey}-${String(d).padStart(2, '0')}`)
    while (result.length % 7 !== 0)          result.push(null)
    return result
  }, [monthKey])

  // Map dateStr → event list (for dots)
  const eventMap = useMemo(() => {
    const map: Record<string, WorkCalendarEvent[]> = {}
    for (const e of calendarEvents) {
      if (e.date.startsWith(monthKey)) {
        map[e.date] = [...(map[e.date] ?? []), e]
      }
    }
    return map
  }, [calendarEvents, monthKey])

  return (
    <div className="flex-1 overflow-auto">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border sticky top-0 bg-card z-10">
        {WEEKDAY_HEADERS.map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((dateStr, idx) => {
          // Empty padding cell
          if (!dateStr) {
            return (
              <div
                key={`pad-${idx}`}
                className="border-b border-r border-border min-h-[60px]"
              />
            )
          }

          const dayNum     = parseInt(dateStr.slice(8))
          const spending   = spendingMap[dateStr] ?? 0
          const dayEvents  = eventMap[dateStr] ?? []
          const isToday    = dateStr === todayStr
          const isSelected = dateStr === selectedDate

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(dateStr)}
              className={cn(
                'border-b border-r border-border min-h-[60px] flex flex-col items-center pt-2 pb-1.5 px-0.5 gap-1 transition-colors',
                isSelected ? 'bg-primary/10' : 'hover:bg-muted active:bg-muted',
              )}
            >
              {/* Day number */}
              <span className={cn(
                'w-7 h-7 flex items-center justify-center rounded-full text-sm font-medium leading-none shrink-0',
                isToday
                  ? 'bg-primary text-primary-foreground font-bold'
                  : 'text-foreground',
              )}>
                {dayNum}
              </span>

              {/* Finance mode: spending amount */}
              {mode === 'finance' && spending > 0 && (
                <span className="text-[10px] leading-none text-destructive font-medium">
                  {moneyHidden ? '••' : formatCompact(spending)}
                </span>
              )}

              {/* Events mode: colored dots */}
              {mode === 'events' && dayEvents.length > 0 && (
                <div className="flex gap-0.5 flex-wrap justify-center">
                  {dayEvents.slice(0, 3).map(e => (
                    <span
                      key={e.id}
                      className={cn('w-1.5 h-1.5 rounded-full', EVENT_CAT_COLORS[e.category] ?? 'bg-primary')}
                    />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{dayEvents.length - 3}</span>
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
