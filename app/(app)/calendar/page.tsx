'use client'

import { useState, useCallback, useMemo } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  CalendarHeader,
  type CalendarMode,
  type CalendarView,
} from '@/components/calendar/calendar-header'
import { FinanceSummaryBar }  from '@/components/calendar/finance-summary-bar'
import { MonthView }          from '@/components/calendar/month-view'
import { WeekView }           from '@/components/calendar/week-view'
import { YearView }           from '@/components/calendar/year-view'
import { DayView }            from '@/components/calendar/day-view'
import { AddEventModal }      from '@/components/calendar/add-event-modal'
import { ExpenseFormModal }   from '@/components/finance/expenses/expense-form-modal'
import { ConfirmModal }       from '@/components/ui/modal'
import { Button }             from '@/components/ui/button'
import { useCalendarEvents }  from '@/hooks/useCalendarData'
import { useToast }           from '@/hooks/useToast'
import {
  today, toLocalDateString, parseLocalDate,
  getWeekRange, prevMonth, nextMonth,
  formatMonthLabel, formatDateLong,
  getSalaryCycleRange, formatCycleLabel,
} from '@/lib/utils/date'
import { deleteCalendarEvent } from '@/lib/services/calendarService'
import { useSettingsStore, selectIsCycleModeActive, selectSalaryDay } from '@/lib/store/settingsStore'
import type { WorkCalendarEvent } from '@/lib/types/settings'

// ─── Period helpers ───────────────────────────────────────────────────────────

function shiftAnchor(anchor: string, view: CalendarView, dir: -1 | 1): string {
  if (view === 'day') {
    const d = parseLocalDate(anchor)
    d.setDate(d.getDate() + dir)
    return toLocalDateString(d)
  }
  if (view === 'week') {
    const d = parseLocalDate(anchor)
    d.setDate(d.getDate() + dir * 7)
    return toLocalDateString(d)
  }
  if (view === 'month') {
    const shifted = (dir === -1 ? prevMonth : nextMonth)(anchor.slice(0, 7))
    return `${shifted}-01`
  }
  const y = parseInt(anchor.slice(0, 4)) + dir
  return `${y}${anchor.slice(4)}`
}

function getPeriodLabel(anchor: string, view: CalendarView): string {
  if (view === 'day') return formatDateLong(anchor)
  if (view === 'week') {
    const { start, end } = getWeekRange(anchor, 'monday')
    const s = parseLocalDate(start)
    const e = parseLocalDate(end)
    return `${s.getDate()}/${s.getMonth() + 1} – ${e.getDate()}/${e.getMonth() + 1}`
  }
  if (view === 'month') return formatMonthLabel(anchor.slice(0, 7))
  return `Năm ${anchor.slice(0, 4)}`
}

function isAtTodayCheck(anchor: string, view: CalendarView): boolean {
  const t = today()
  if (view === 'day')   return anchor === t
  if (view === 'week') {
    const { start, end } = getWeekRange(t, 'monday')
    return anchor >= start && anchor <= end
  }
  if (view === 'month') return anchor.slice(0, 7) === t.slice(0, 7)
  return anchor.slice(0, 4) === t.slice(0, 4)
}

function getPeriodRange(anchor: string, view: CalendarView): { start: string; end: string } {
  if (view === 'day')  return { start: anchor, end: anchor }
  if (view === 'week') return getWeekRange(anchor, 'monday')
  if (view === 'month') {
    const [y, m] = anchor.slice(0, 7).split('-').map(Number)
    return {
      start: `${anchor.slice(0, 7)}-01`,
      end:   toLocalDateString(new Date(y, m, 0)),
    }
  }
  const y = anchor.slice(0, 4)
  return { start: `${y}-01-01`, end: `${y}-12-31` }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const toast = useToast()
  const { events, loading, refresh } = useCalendarEvents()
  const cycleModeEnabled = useSettingsStore(selectIsCycleModeActive)
  const salaryDay        = useSettingsStore(selectSalaryDay)

  const [mode,   setMode]   = useState<CalendarMode>('finance')
  const [view,   setView]   = useState<CalendarView>('month')
  const [anchor, setAnchor] = useState(today)

  // Selected date for inline detail panel
  const [detailDate, setDetailDate]   = useState<string | null>(null)
  const [fabExpanded, setFabExpanded] = useState(false)

  const [eventModal,   setEventModal]   = useState<{ open: boolean; date?: string; editEvent?: WorkCalendarEvent | null }>({ open: false })
  const [expenseModal, setExpenseModal] = useState<{ open: boolean; date?: string }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<WorkCalendarEvent | null>(null)
  const [deleting,     setDeleting]     = useState(false)

  const periodLabel    = getPeriodLabel(anchor, view)
  const isAtToday      = isAtTodayCheck(anchor, view)
  const { start, end } = useMemo(() => getPeriodRange(anchor, view), [anchor, view])

  // Khối tổng hợp kỳ lương hiện tại — LUÔN neo vào "hôm nay" (không theo anchor
  // đang duyệt), vì kỳ lương xuyên 2 tháng dương lịch, không map vào lưới ngày
  // được. Lưới ngày (MonthView/WeekView/YearView) giữ nguyên theo tháng dương lịch.
  const cycleRange = useMemo(
    () => cycleModeEnabled ? getSalaryCycleRange(today(), salaryDay) : null,
    [cycleModeEnabled, salaryDay],
  )

  const handleNavigate = useCallback((dir: -1 | 1) => {
    setAnchor(a => shiftAnchor(a, view, dir))
    setDetailDate(null)
  }, [view])

  const handleToday = useCallback(() => {
    setAnchor(today())
    setDetailDate(null)
  }, [])

  const handleViewChange = useCallback((v: CalendarView) => {
    setView(v)
    setDetailDate(null)
  }, [])

  const handleSelectDate = useCallback((dateStr: string) => {
    if (view === 'day') {
      setAnchor(dateStr)
    } else {
      // Toggle: click same date again → close detail
      setDetailDate(prev => prev === dateStr ? null : dateStr)
    }
  }, [view])

  const handleSelectMonth = useCallback((monthKey: string) => {
    setAnchor(`${monthKey}-01`)
    setView('month')
  }, [])

  const handleAddExpense = useCallback((date: string) => {
    setExpenseModal({ open: true, date })
  }, [])

  const handleOpenAddEvent = useCallback((date?: string) => {
    setEventModal({ open: true, date })
  }, [])

  const handleEditEvent = useCallback((event: WorkCalendarEvent) => {
    setEventModal({ open: true, editEvent: event })
  }, [])

  const handleDeleteEvent = useCallback((event: WorkCalendarEvent) => {
    setDeleteTarget(event)
  }, [])

  const confirmDeleteEvent = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCalendarEvent(deleteTarget.id)
      toast.success('Đã xóa sự kiện')
      refresh()
    } catch {
      toast.error('Xóa thất bại')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleFAB = () => {
    const date = view === 'day' ? anchor : detailDate ?? undefined
    if (mode === 'events') handleOpenAddEvent(date)
    else setExpenseModal({ open: true, date })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden animate-fade-in">
      {/* Sticky header */}
      <CalendarHeader
        mode={mode} view={view} periodLabel={periodLabel}
        isAtToday={isAtToday} onModeChange={setMode}
        onViewChange={handleViewChange} onNavigate={handleNavigate} onToday={handleToday}
      />

      {mode === 'finance' && <FinanceSummaryBar start={start} end={end} />}

      {mode === 'finance' && cycleRange && (
        <div className="border-b border-border">
          <p className="px-4 pt-2 text-[11px] text-muted-foreground">
            {formatCycleLabel(cycleRange.start, cycleRange.end)} (kỳ lương hiện tại)
          </p>
          <FinanceSummaryBar start={cycleRange.start} end={cycleRange.end} />
        </div>
      )}

      {/* ── Main content: single scroll container ────────────────────────────
          Toàn bộ calendar + detail panel nằm trong 1 overflow-y-auto duy nhất.
          User scroll tự nhiên từ trên xuống — không cần split viewport.
          DayView và YearView giữ nguyên flex-1 overflow-hidden (không cần scroll ngoài).
      ────────────────────────────────────────────────────────────────────── */}
      {(view === 'month' || view === 'week') ? (
        <div className="flex-1 overflow-y-auto">
          {/* Calendar grid — natural height, không overflow-hidden */}
          {view === 'month' && (
            <MonthView
              monthKey={anchor.slice(0, 7)} mode={mode}
              calendarEvents={events} selectedDate={detailDate}
              onSelectDate={handleSelectDate}
            />
          )}
          {view === 'week' && (
            <WeekView
              anchor={anchor} mode={mode}
              calendarEvents={events} selectedDate={detailDate}
              onSelectDate={handleSelectDate}
            />
          )}

          {/* Inline day detail — nằm ngay bên dưới calendar trong cùng scroll container */}
          {detailDate && (
            <div className="border-t border-border animate-slide-up">
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-card border-b border-border sticky top-0 z-10">
                <p className="text-sm font-semibold text-foreground">
                  {formatDateLong(detailDate)}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    leftIcon={<Plus className="w-3.5 h-3.5" />}
                    onClick={() => mode === 'finance'
                      ? handleAddExpense(detailDate)
                      : handleOpenAddEvent(detailDate)
                    }
                  >
                    {mode === 'finance' ? 'Thêm chi tiêu' : 'Thêm sự kiện'}
                  </Button>
                  <button
                    onClick={() => setDetailDate(null)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Đóng"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* DayView content — natural height, scroll theo parent */}
              <DayView
                dateStr={detailDate} mode={mode} calendarEvents={events}
                onEditEvent={handleEditEvent} onDeleteEvent={handleDeleteEvent}
              />
            </div>
          )}
        </div>
      ) : (
        /* Day / Year view — giữ nguyên flex-1 overflow-hidden */
        <div className="flex-1 flex flex-col overflow-hidden">
          {view === 'day' && (
            <div className="flex flex-col flex-1 overflow-hidden h-full">
              <div className="px-4 py-2.5 border-b border-border bg-card flex items-center justify-between shrink-0">
                <p className="text-sm font-semibold text-foreground">{formatDateLong(anchor)}</p>
              </div>
              <div className="flex-1 overflow-y-auto">
                <DayView
                  dateStr={anchor} mode={mode} calendarEvents={events}
                  onEditEvent={handleEditEvent} onDeleteEvent={handleDeleteEvent}
                />
              </div>
            </div>
          )}
          {view === 'year' && (
            <YearView
              year={parseInt(anchor.slice(0, 4))} mode={mode}
              calendarEvents={events} onSelectMonth={handleSelectMonth}
            />
          )}
        </div>
      )}

    </div>

      {/* FAB — thiết kế giống Dashboard FAB: expand → sub-button Chi tiêu / Sự kiện */}
      {fabExpanded && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setFabExpanded(false)}
        />
      )}
      <div
        className="fixed right-4 z-30 flex flex-col items-end gap-2.5"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        {fabExpanded && (
          <div className="flex items-center gap-2.5 animate-fade-in">
            <span className="text-xs font-medium text-foreground bg-card border border-border px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
              {mode === 'finance' ? 'Thêm chi tiêu' : 'Thêm sự kiện'}
            </span>
            <button
              onClick={() => {
                setFabExpanded(false)
                handleFAB()
              }}
              className={cn(
                'w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform',
                mode === 'finance' ? 'bg-destructive' : 'bg-blue-500',
              )}
              aria-label={mode === 'finance' ? 'Thêm chi tiêu' : 'Thêm sự kiện'}
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        )}

        <button
          onClick={() => setFabExpanded(v => !v)}
          className={cn(
            'w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-200 active:scale-95',
            fabExpanded ? 'bg-muted-foreground rotate-45' : 'bg-primary',
          )}
          aria-label="Thêm nhanh"
        >
          {fabExpanded ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </button>
      </div>

      {/* Modals */}
      <AddEventModal
        open={eventModal.open} defaultDate={eventModal.date}
        editEvent={eventModal.editEvent}
        onClose={() => setEventModal({ open: false })} onSuccess={refresh}
      />
      <ExpenseFormModal
        open={expenseModal.open} defaultDate={expenseModal.date}
        onClose={() => setExpenseModal({ open: false })}
      />
      <ConfirmModal
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteEvent}
        title="Xóa sự kiện?"
        message={`Bạn có chắc muốn xóa "${deleteTarget?.title}"?`}
        confirmLabel="Xóa" danger loading={deleting}
      />
    </>
  )
}