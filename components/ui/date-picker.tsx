'use client'

import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils/cn'
import {
  today, thisMonth,
  toLocalDateString, toMonthKey,
  parseLocalDate,
  formatDateVN, formatMonthLabel, formatMonthCompact,
  prevMonth, nextMonth,
  lastNDays, startOfMonth, endOfMonth, startOfYear, endOfYear,
  getCalendarGrid,
} from '@/lib/utils/date'

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface DateRange {
  from: string  // YYYY-MM-DD (hoặc '' = chưa chọn)
  to:   string  // YYYY-MM-DD (hoặc '' = chưa chọn)
}

export interface MonthRange {
  from: string  // YYYY-MM (hoặc '' = chưa chọn)
  to:   string  // YYYY-MM (hoặc '' = chưa chọn)
}

const WEEKDAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Sheet header (title + handle, không close X vì Modal đã có swipe/backdrop)
// ═════════════════════════════════════════════════════════════════════════════

function SheetTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pb-3 pt-1">
      <h2 className="text-lg font-semibold text-foreground">{children}</h2>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Quick filter chips (horizontal scroll)
// ═════════════════════════════════════════════════════════════════════════════

interface ChipOption {
  label:    string
  selected: boolean
  onClick:  () => void
}

function QuickFilterChips({ options }: { options: ChipOption[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pb-3">
      {options.map((opt, i) => (
        <button
          key={i}
          type="button"
          onClick={opt.onClick}
          className={cn(
            'shrink-0 px-4 h-9 rounded-full border text-sm font-medium transition-colors',
            opt.selected
              ? 'border-destructive text-destructive bg-destructive/5'
              : 'border-border text-foreground bg-card hover:bg-muted',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Month navigator (< Tháng X/YYYY >)
// ═════════════════════════════════════════════════════════════════════════════

function MonthNavigator({
  monthKey, onPrev, onNext,
}: { monthKey: string; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <button
        type="button"
        onClick={onPrev}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Tháng trước"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <p className="text-base font-semibold text-foreground">
        {formatMonthLabel(monthKey)}
      </p>
      <button
        type="button"
        onClick={onNext}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Tháng sau"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Year navigator (< YYYY >)  — cho MonthRangePicker
// ═════════════════════════════════════════════════════════════════════════════

function YearNavigator({
  year, onPrev, onNext,
}: { year: number; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <button
        type="button"
        onClick={onPrev}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Năm trước"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <p className="text-base font-semibold text-foreground">Năm {year}</p>
      <button
        type="button"
        onClick={onNext}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Năm sau"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Calendar grid (6×7 day cells)
// ═════════════════════════════════════════════════════════════════════════════

interface CalendarGridProps {
  monthKey:   string
  mode:       'single' | 'range'
  selected?:  string | null
  rangeFrom?: string | null
  rangeTo?:   string | null
  onDayClick: (date: string) => void
}

function CalendarGrid({
  monthKey, mode, selected, rangeFrom, rangeTo, onDayClick,
}: CalendarGridProps) {
  const cells    = useMemo(() => getCalendarGrid(monthKey, 'monday'), [monthKey])
  const todayStr = today()

  // Range chỉ "active" khi cả 2 đầu có giá trị VÀ khác nhau
  const hasActiveRange = mode === 'range' && !!rangeFrom && !!rangeTo && rangeFrom !== rangeTo

  return (
    <div className="px-4">
      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS_VI.map(d => (
          <div key={d} className="h-8 flex items-center justify-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const isSingleSelected = mode === 'single' && selected === cell.date
          const isStart          = mode === 'range' && rangeFrom === cell.date
          const isEnd            = mode === 'range' && rangeTo   === cell.date
          const isEndpoint       = isStart || isEnd
          const inBetween        = hasActiveRange && cell.date > rangeFrom! && cell.date < rangeTo!
          const isToday          = cell.date === todayStr

          // Vị trí band (chỉ hiển thị khi range active VÀ cell nằm trong range)
          const inRange = hasActiveRange && (isStart || isEnd || inBetween)
          const bandPosition = !inRange
            ? 'hidden'
            : isStart
              ? 'left-1/2 right-0'   // nửa phải (band kéo sang phải)
              : isEnd
                ? 'left-0 right-1/2' // nửa trái (band đến từ bên trái)
                : 'inset-x-0'        // giữa range → fill cả cell

          return (
            <div key={idx} className="relative h-11 flex items-center justify-center">
              {/* Pink band (behind circle) */}
              {inRange && (
                <div className={cn('absolute inset-y-1.5 bg-destructive/10', bandPosition)} />
              )}

              {/* Day button */}
              <button
                type="button"
                onClick={() => onDayClick(cell.date)}
                className={cn(
                  'relative z-10 w-9 h-9 rounded-full text-sm transition-colors',
                  'flex items-center justify-center',
                  // Default color
                  cell.inMonth ? 'text-foreground' : 'text-muted-foreground/40',
                  // Hover (khi chưa selected)
                  !isSingleSelected && !isEndpoint && 'hover:bg-muted',
                  // Today ring (nếu chưa selected)
                  isToday && !isSingleSelected && !isEndpoint && 'ring-1 ring-border font-semibold',
                  // Selected / Endpoint → red filled circle
                  (isSingleSelected || isEndpoint) && 'bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90',
                )}
                aria-label={formatDateVN(cell.date)}
                aria-pressed={isSingleSelected || isEndpoint}
              >
                {cell.day}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Month grid (4 rows × 3 cols = 12 months) — cho MonthRangePicker
// ═════════════════════════════════════════════════════════════════════════════

interface MonthGridProps {
  year:       number
  rangeFrom:  string | null   // "YYYY-MM"
  rangeTo:    string | null   // "YYYY-MM"
  onClick:    (monthKey: string) => void
}

function MonthGrid({ year, rangeFrom, rangeTo, onClick }: MonthGridProps) {
  const hasActiveRange = !!rangeFrom && !!rangeTo && rangeFrom !== rangeTo
  const currentMonthKey = thisMonth()

  return (
    <div className="px-4 pt-2 pb-2">
      <div className="grid grid-cols-3 gap-y-1">
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
          const monthKey = `${year}-${String(m).padStart(2, '0')}`
          const isStart      = rangeFrom === monthKey
          const isEnd        = rangeTo   === monthKey
          const isEndpoint   = isStart || isEnd
          const inBetween    = hasActiveRange && monthKey > rangeFrom! && monthKey < rangeTo!
          const inRange      = hasActiveRange && (isStart || isEnd || inBetween)
          const isCurrent    = monthKey === currentMonthKey

          const bandPosition = !inRange
            ? 'hidden'
            : isStart
              ? 'left-1/2 right-0'
              : isEnd
                ? 'left-0 right-1/2'
                : 'inset-x-0'

          return (
            <div key={m} className="relative h-12 flex items-center justify-center">
              {inRange && (
                <div className={cn('absolute inset-y-1.5 bg-destructive/10', bandPosition)} />
              )}
              <button
                type="button"
                onClick={() => onClick(monthKey)}
                className={cn(
                  'relative z-10 min-w-[68px] px-3 h-9 rounded-full text-sm transition-colors',
                  'flex items-center justify-center',
                  'text-foreground',
                  !isEndpoint && 'hover:bg-muted',
                  isCurrent && !isEndpoint && 'ring-1 ring-border font-semibold',
                  isEndpoint && 'bg-destructive text-destructive-foreground font-semibold hover:bg-destructive/90',
                )}
              >
                Tháng {m}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL: Sheet footer (range summary + Xóa / Áp dụng)
// ═════════════════════════════════════════════════════════════════════════════

function SheetActions({
  summary, onClear, onApply, applyDisabled,
}: {
  summary:        string | null
  onClear:        () => void
  onApply:        () => void
  applyDisabled?: boolean
}) {
  return (
    <div className="px-4 pt-3 pb-4 space-y-3 border-t border-border">
      {summary && (
        <p className="text-center text-sm text-muted-foreground">{summary}</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClear}
          className="flex-1 h-11 rounded-xl border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Xóa
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applyDisabled}
          className={cn(
            'flex-[1.8] h-11 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold',
            'hover:bg-destructive/90 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          Áp dụng
        </button>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT 1: DatePicker (chọn 1 ngày)
// ═════════════════════════════════════════════════════════════════════════════

export interface DatePickerProps {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  disabled?:    boolean
  className?:   string
  title?:       string
}

export function DatePicker({
  value, onChange,
  placeholder = 'Chọn ngày',
  disabled,
  className,
  title = 'Chọn ngày',
}: DatePickerProps) {
  const [open, setOpen]           = useState(false)
  const [draft, setDraft]         = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState(thisMonth())

  // Sync khi mở
  useEffect(() => {
    if (open) {
      setDraft(value || null)
      setViewMonth(value ? value.slice(0, 7) : thisMonth())
    }
  }, [open, value])

  const handleDayClick = (date: string) => {
    setDraft(date)
    setViewMonth(date.slice(0, 7))
  }

  const handleApply = () => {
    if (draft) onChange(draft)
    setOpen(false)
  }

  const handleClear = () => {
    onChange('')
    setOpen(false)
  }

  const todayStr = today()
  const quickOptions: ChipOption[] = [
    { label: 'Hôm nay',  selected: draft === todayStr,                    onClick: () => handleDayClick(todayStr) },
    { label: 'Hôm qua',  selected: !!draft && daysAgo(todayStr, 1) === draft, onClick: () => handleDayClick(daysAgo(todayStr, 1)) },
  ]

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg border bg-background px-3 h-10',
          'text-sm text-foreground cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'border-input hover:border-ring/50 transition-colors',
          className,
        )}
      >
        <span className={cn(!value && 'text-muted-foreground')}>
          {value ? formatDateVN(value) : placeholder}
        </span>
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {/* Bottom sheet */}
      <Modal open={open} onClose={() => setOpen(false)} variant="bottom" className="max-w-md">
        <SheetTitle>{title}</SheetTitle>
        <QuickFilterChips options={quickOptions} />
        <MonthNavigator
          monthKey={viewMonth}
          onPrev={() => setViewMonth(prevMonth(viewMonth))}
          onNext={() => setViewMonth(nextMonth(viewMonth))}
        />
        <CalendarGrid
          monthKey={viewMonth}
          mode="single"
          selected={draft}
          onDayClick={handleDayClick}
        />
        <div className="h-3" />
        <SheetActions
          summary={draft ? formatDateVN(draft) : null}
          onClear={handleClear}
          onApply={handleApply}
          applyDisabled={!draft}
        />
      </Modal>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT 2: DateRangePicker
// ═════════════════════════════════════════════════════════════════════════════

export interface DateRangePickerProps {
  value:        DateRange
  onChange:     (v: DateRange) => void
  fromLabel?:   string
  toLabel?:     string
  headerLabel?: string
  title?:       string
  disabled?:    boolean
  className?:   string
}

export function DateRangePicker({
  value, onChange,
  fromLabel   = 'Từ ngày',
  toLabel     = 'Đến ngày',
  headerLabel = 'Khoảng thời gian',
  title       = 'Chọn khoảng thời gian',
  disabled,
  className,
}: DateRangePickerProps) {
  const [open, setOpen]           = useState(false)
  const [draftFrom, setDraftFrom] = useState<string | null>(null)
  const [draftTo,   setDraftTo]   = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState(thisMonth())

  useEffect(() => {
    if (open) {
      setDraftFrom(value.from || null)
      setDraftTo(value.to || null)
      setViewMonth(value.from ? value.from.slice(0, 7) : thisMonth())
    }
  }, [open, value.from, value.to])

  const handleDayClick = (date: string) => {
    // Pattern: chưa có from, hoặc đã có đủ range → bắt đầu range mới
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(date)
      setDraftTo(null)
      return
    }
    // Đã có from, chưa có to → hoàn thành range (auto-swap nếu click ngược)
    if (date < draftFrom) {
      setDraftTo(draftFrom)
      setDraftFrom(date)
    } else {
      setDraftTo(date)
    }
  }

  const handleApply = () => {
    if (draftFrom && draftTo) {
      onChange({ from: draftFrom, to: draftTo })
    } else if (draftFrom) {
      // Chỉ chọn 1 ngày → range 1 ngày
      onChange({ from: draftFrom, to: draftFrom })
    }
    setOpen(false)
  }

  const handleClear = () => {
    onChange({ from: '', to: '' })
    setOpen(false)
  }

  // Quick filter setters
  const setQuickRange = (from: string, to: string) => {
    setDraftFrom(from)
    setDraftTo(to)
    setViewMonth(from.slice(0, 7))
  }

  const todayStr = today()
  const nowMonth = thisMonth()
  const curYear  = new Date().getFullYear()

  const last7  = lastNDays(7)
  const last30 = lastNDays(30)
  const thisMonthRange = { from: startOfMonth(nowMonth), to: endOfMonth(nowMonth) }
  const thisYearRange  = { from: startOfYear(curYear),   to: endOfYear(curYear) }

  const matches = (r: { from: string; to: string }) =>
    draftFrom === r.from && draftTo === r.to

  const quickOptions: ChipOption[] = [
    { label: 'Hôm nay',    selected: draftFrom === todayStr && draftTo === todayStr, onClick: () => setQuickRange(todayStr, todayStr) },
    { label: '7 ngày qua', selected: matches(last7),           onClick: () => setQuickRange(last7.from,           last7.to) },
    { label: 'Tháng này',  selected: matches(thisMonthRange),  onClick: () => setQuickRange(thisMonthRange.from,  thisMonthRange.to) },
    { label: '30 ngày qua',selected: matches(last30),          onClick: () => setQuickRange(last30.from,          last30.to) },
    { label: 'Năm nay',    selected: matches(thisYearRange),   onClick: () => setQuickRange(thisYearRange.from,   thisYearRange.to) },
  ]

  // Text hiển thị trên trigger card
  const fromText = value.from ? formatDateVN(value.from) : '--/--/----'
  const toText   = value.to   ? formatDateVN(value.to)   : '--/--/----'

  const summary = draftFrom && draftTo
    ? `${formatDateVN(draftFrom)} → ${formatDateVN(draftTo)}`
    : draftFrom
      ? `${formatDateVN(draftFrom)} → ...`
      : null

  return (
    <>
      {/* Trigger card */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'w-full rounded-xl border border-input bg-card p-3 space-y-2',
          'text-left cursor-pointer transition-colors',
          'hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-medium">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-muted/60 px-2 py-1.5 text-center min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fromText}</p>
            <p className="text-[11px] text-muted-foreground">{fromLabel}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 rounded-lg bg-muted/60 px-2 py-1.5 text-center min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{toText}</p>
            <p className="text-[11px] text-muted-foreground">{toLabel}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>

      {/* Bottom sheet */}
      <Modal open={open} onClose={() => setOpen(false)} variant="bottom" className="max-w-md">
        <SheetTitle>{title}</SheetTitle>
        <QuickFilterChips options={quickOptions} />
        <MonthNavigator
          monthKey={viewMonth}
          onPrev={() => setViewMonth(prevMonth(viewMonth))}
          onNext={() => setViewMonth(nextMonth(viewMonth))}
        />
        <CalendarGrid
          monthKey={viewMonth}
          mode="range"
          rangeFrom={draftFrom}
          rangeTo={draftTo}
          onDayClick={handleDayClick}
        />
        <div className="h-3" />
        <SheetActions
          summary={summary}
          onClear={handleClear}
          onApply={handleApply}
          applyDisabled={!draftFrom}
        />
      </Modal>
    </>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT 3: MonthRangePicker
// ═════════════════════════════════════════════════════════════════════════════

export interface MonthRangePickerProps {
  value:        MonthRange
  onChange:     (v: MonthRange) => void
  fromLabel?:   string
  toLabel?:     string
  headerLabel?: string
  title?:       string
  disabled?:    boolean
  className?:   string
}

export function MonthRangePicker({
  value, onChange,
  fromLabel   = 'Từ tháng',
  toLabel     = 'Đến tháng',
  headerLabel = 'Khoảng tháng',
  title       = 'Chọn khoảng tháng',
  disabled,
  className,
}: MonthRangePickerProps) {
  const [open, setOpen]           = useState(false)
  const [draftFrom, setDraftFrom] = useState<string | null>(null)
  const [draftTo,   setDraftTo]   = useState<string | null>(null)
  const [viewYear, setViewYear]   = useState(new Date().getFullYear())

  useEffect(() => {
    if (open) {
      setDraftFrom(value.from || null)
      setDraftTo(value.to || null)
      const yearFromValue = value.from ? parseInt(value.from.slice(0, 4), 10) : NaN
      setViewYear(Number.isFinite(yearFromValue) ? yearFromValue : new Date().getFullYear())
    }
  }, [open, value.from, value.to])

  const handleMonthClick = (monthKey: string) => {
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(monthKey)
      setDraftTo(null)
      return
    }
    if (monthKey < draftFrom) {
      setDraftTo(draftFrom)
      setDraftFrom(monthKey)
    } else {
      setDraftTo(monthKey)
    }
  }

  const handleApply = () => {
    if (draftFrom && draftTo) {
      onChange({ from: draftFrom, to: draftTo })
    } else if (draftFrom) {
      onChange({ from: draftFrom, to: draftFrom })
    }
    setOpen(false)
  }

  const handleClear = () => {
    onChange({ from: '', to: '' })
    setOpen(false)
  }

  // Quick filters
  const setQuick = (from: string, to: string) => {
    setDraftFrom(from)
    setDraftTo(to)
    setViewYear(parseInt(from.slice(0, 4), 10))
  }

  const curMonth = thisMonth()
  const curYear  = new Date().getFullYear()

  const back3  = { from: monthsAgo(curMonth, 2), to: curMonth } // 3 tháng gồm cả tháng này
  const back6  = { from: monthsAgo(curMonth, 5), to: curMonth }
  const back12 = { from: monthsAgo(curMonth, 11), to: curMonth }
  const thisYr = { from: `${curYear}-01`, to: `${curYear}-12` }

  const matches = (r: { from: string; to: string }) =>
    draftFrom === r.from && draftTo === r.to

  const quickOptions: ChipOption[] = [
    { label: 'Tháng này',   selected: draftFrom === curMonth && draftTo === curMonth, onClick: () => setQuick(curMonth, curMonth) },
    { label: '3 tháng qua', selected: matches(back3),  onClick: () => setQuick(back3.from,  back3.to) },
    { label: '6 tháng qua', selected: matches(back6),  onClick: () => setQuick(back6.from,  back6.to) },
    { label: '12 tháng qua',selected: matches(back12), onClick: () => setQuick(back12.from, back12.to) },
    { label: 'Năm nay',     selected: matches(thisYr), onClick: () => setQuick(thisYr.from, thisYr.to) },
  ]

  const fromText = value.from ? formatMonthCompact(value.from) : '--/----'
  const toText   = value.to   ? formatMonthCompact(value.to)   : '--/----'

  const summary = draftFrom && draftTo
    ? `${formatMonthLabel(draftFrom)} → ${formatMonthLabel(draftTo)}`
    : draftFrom
      ? `${formatMonthLabel(draftFrom)} → ...`
      : null

  return (
    <>
      {/* Trigger card */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'w-full rounded-xl border border-input bg-card p-3 space-y-2',
          'text-left cursor-pointer transition-colors',
          'hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-medium">{headerLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-lg bg-muted/60 px-2 py-1.5 text-center min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fromText}</p>
            <p className="text-[11px] text-muted-foreground">{fromLabel}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="flex-1 rounded-lg bg-muted/60 px-2 py-1.5 text-center min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{toText}</p>
            <p className="text-[11px] text-muted-foreground">{toLabel}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </div>
      </button>

      {/* Bottom sheet */}
      <Modal open={open} onClose={() => setOpen(false)} variant="bottom" className="max-w-md">
        <SheetTitle>{title}</SheetTitle>
        <QuickFilterChips options={quickOptions} />
        <YearNavigator
          year={viewYear}
          onPrev={() => setViewYear(y => y - 1)}
          onNext={() => setViewYear(y => y + 1)}
        />
        <MonthGrid
          year={viewYear}
          rangeFrom={draftFrom}
          rangeTo={draftTo}
          onClick={handleMonthClick}
        />
        <div className="h-3" />
        <SheetActions
          summary={summary}
          onClear={handleClear}
          onApply={handleApply}
          applyDisabled={!draftFrom}
        />
      </Modal>
    </>
  )
}

// ─── Helpers local (không export) ─────────────────────────────────────────────

function daysAgo(baseDate: string, n: number): string {
  const d = parseLocalDate(baseDate)
  d.setDate(d.getDate() - n)
  return toLocalDateString(d)
}

function monthsAgo(baseMonth: string, n: number): string {
  let cur = baseMonth
  for (let i = 0; i < n; i++) cur = prevMonth(cur)
  return cur
}
