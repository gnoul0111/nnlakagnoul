'use client'

import { Pencil, Trash2, Clock, Bell } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useDayFinanceData } from '@/hooks/useCalendarData'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { formatVND } from '@/lib/utils/currency'
import { CATEGORIES } from '@/lib/types/expense'
import type { WorkCalendarEvent } from '@/lib/types/settings'
import type { CalendarMode } from './calendar-header'

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))
const HIDDEN   = '••••'

const EVENT_CAT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  work:     { bg: 'bg-blue-50 dark:bg-blue-900/25',    text: 'text-blue-700 dark:text-blue-300',    label: 'Công việc' },
  personal: { bg: 'bg-purple-50 dark:bg-purple-900/25',text: 'text-purple-700 dark:text-purple-300',label: 'Cá nhân'   },
  health:   { bg: 'bg-green-50 dark:bg-green-900/25',  text: 'text-green-700 dark:text-green-300',  label: 'Sức khỏe'  },
  other:    { bg: 'bg-muted',                           text: 'text-muted-foreground',               label: 'Khác'      },
}

interface DayViewProps {
  dateStr:        string
  mode:           CalendarMode
  calendarEvents: WorkCalendarEvent[]
  onEditEvent:    (event: WorkCalendarEvent) => void
  onDeleteEvent:  (event: WorkCalendarEvent) => void
  onAddExpense:   () => void
}

export function DayView({
  dateStr, mode, calendarEvents, onEditEvent, onDeleteEvent,
}: DayViewProps) {
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const {
    spendingExpenses, linkedExpenses, dayIncomes,
    totalSpending, totalIncome,
  } = useDayFinanceData(dateStr)

  const dayEvents = calendarEvents.filter(e => e.date === dateStr)
  const fmt       = (n: number) => moneyHidden ? HIDDEN : formatVND(n)

  // ── Events mode ──────────────────────────────────────────────────────────────
  if (mode === 'events') {
    if (dayEvents.length === 0) {
      return (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Không có sự kiện nào
        </div>
      )
    }

    return (
      <div className="divide-y divide-border">
        {dayEvents.map(event => {
          const style = EVENT_CAT_STYLES[event.category] ?? EVENT_CAT_STYLES.other
          return (
            <div key={event.id} className={cn('p-4', style.bg)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={cn('font-semibold text-sm', style.text)}>{event.title}</p>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className={cn('text-xs', style.text, 'opacity-75')}>{style.label}</span>
                    {event.time && (
                      <span className={cn('text-xs flex items-center gap-0.5', style.text, 'opacity-75')}>
                        <Clock className="w-3 h-3" />{event.time}
                      </span>
                    )}
                    {event.reminder && (
                      <span className={cn('text-xs flex items-center gap-0.5', style.text, 'opacity-75')}>
                        <Bell className="w-3 h-3" />Nhắc
                      </span>
                    )}
                  </div>
                  {event.note && (
                    <p className={cn('text-xs mt-1.5 opacity-70', style.text)}>{event.note}</p>
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0">
                  <button
                    onClick={() => onEditEvent(event)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    aria-label="Sửa"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onDeleteEvent(event)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                    aria-label="Xóa"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Finance mode ─────────────────────────────────────────────────────────────
  const isEmpty = spendingExpenses.length === 0 && dayIncomes.length === 0 && linkedExpenses.length === 0

  return (
    <div className="divide-y divide-border">
      {/* Day totals */}
      <div className="flex items-stretch divide-x divide-border bg-muted/30">
        <div className="flex-1 flex flex-col items-center py-3">
          <span className="text-[11px] text-muted-foreground">Chi tiêu</span>
          <span className="text-sm font-semibold text-destructive mt-0.5">{fmt(totalSpending)}</span>
        </div>
        <div className="flex-1 flex flex-col items-center py-3">
          <span className="text-[11px] text-muted-foreground">Thu nhập</span>
          <span className="text-sm font-semibold text-[hsl(var(--success))] mt-0.5">{fmt(totalIncome)}</span>
        </div>
      </div>

      {/* Spending expenses */}
      {spendingExpenses.length > 0 && (
        <div>
          <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20">
            Chi tiêu thường ({spendingExpenses.length})
          </p>
          <div className="divide-y divide-border">
            {spendingExpenses.map(e => {
              const cat = CAT_MAP[e.category]
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl shrink-0">{cat?.icon ?? '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {(e as any).title || e.note || cat?.label || e.category}
                    </p>
                    {e.note && (
                      <p className="text-xs text-muted-foreground">{cat?.label}</p>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-destructive shrink-0">
                    {fmt(e.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Linked expenses (read-only context) */}
      {linkedExpenses.length > 0 && (
        <div>
          <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20">
            Liên kết
          </p>
          <div className="divide-y divide-border">
            {linkedExpenses.map(e => {
              const cat   = CAT_MAP[e.category]
              const label = e._debtId ? 'Trả nợ' : e._goalId ? 'Mục tiêu' : 'Tiết kiệm'
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3 opacity-60">
                  <span className="text-xl shrink-0">{cat?.icon ?? '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {(e as any).title || e.note || cat?.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground shrink-0">
                    {fmt(e.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Incomes */}
      {dayIncomes.length > 0 && (
        <div>
          <p className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/20">
            Thu nhập ({dayIncomes.length})
          </p>
          <div className="divide-y divide-border">
            {dayIncomes.map(inc => (
              <div key={inc.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl shrink-0">💰</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {inc.note || inc.source}
                  </p>
                  {inc.note && (
                    <p className="text-xs text-muted-foreground">{inc.source}</p>
                  )}
                </div>
                <span className="text-sm font-semibold text-[hsl(var(--success))] shrink-0">
                  +{fmt(inc.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Không có giao dịch nào
        </div>
      )}
    </div>
  )
}