'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import {
  today, toLocalDateString, parseLocalDate,
  getWeekRange, prevMonth, nextMonth, thisMonth,
  formatMonthLabel,
} from '@/lib/utils/date'
import type { PeriodType, PeriodRange } from '@/hooks/useAnalyticsData'

interface PeriodSelectorProps {
  value: PeriodRange
  onChange: (range: PeriodRange) => void
}

const PERIOD_TABS: { id: PeriodType; label: string }[] = [
  { id: 'week',  label: 'Tuần'  },
  { id: 'month', label: 'Tháng' },
  { id: 'year',  label: 'Năm'   },
]

function buildRange(type: PeriodType, anchor: string): PeriodRange {
  if (type === 'week') {
    const { start, end } = getWeekRange(anchor, 'monday')
    return { type, start, end, label: `${start} – ${end}` }
  }
  if (type === 'month') {
    const [y, m] = anchor.slice(0, 7).split('-').map(Number)
    const start  = `${anchor.slice(0, 7)}-01`
    const end    = toLocalDateString(new Date(y, m, 0))
    return { type, start, end, label: formatMonthLabel(anchor.slice(0, 7)) }
  }
  // year
  const year  = anchor.slice(0, 4)
  return { type, start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` }
}

function shiftAnchor(anchor: string, type: PeriodType, dir: -1 | 1): string {
  if (type === 'week') {
    const d = parseLocalDate(anchor)
    d.setDate(d.getDate() + dir * 7)
    return toLocalDateString(d)
  }
  if (type === 'month') {
    return (dir === -1 ? prevMonth : nextMonth)(anchor.slice(0, 7)) + '-01'
  }
  const y = parseInt(anchor.slice(0, 4)) + dir
  return `${y}-01-01`
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const [anchor, setAnchor] = useState(today())

  const switchType = (type: PeriodType) => {
    const newAnchor = today()
    setAnchor(newAnchor)
    onChange(buildRange(type, newAnchor))
  }

  const shift = (dir: -1 | 1) => {
    const newAnchor = shiftAnchor(anchor, value.type, dir)
    setAnchor(newAnchor)
    onChange(buildRange(value.type, newAnchor))
  }

  const goToNow = () => {
    const newAnchor = today()
    setAnchor(newAnchor)
    onChange(buildRange(value.type, newAnchor))
  }

  const isNow = anchor === today() ||
    (value.type === 'month' && anchor.slice(0, 7) === thisMonth()) ||
    (value.type === 'year'  && anchor.slice(0, 4) === String(new Date().getFullYear()))

  return (
    <div className="space-y-3">
      {/* Period type tabs */}
      <div className="flex bg-muted rounded-xl p-1">
        {PERIOD_TABS.map(tab => (
          <button key={tab.id} onClick={() => switchType(tab.id)}
            className={cn(
              'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
              value.type === tab.id
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={() => shift(-1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>

        <button onClick={goToNow} disabled={isNow}
          className={cn(
            'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
            isNow ? 'text-foreground cursor-default' : 'text-primary hover:bg-primary/10',
          )}
        >
          {value.label}
        </button>

        <button onClick={() => shift(1)} disabled={isNow}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ─── Default initial range ────────────────────────────────────────────────────

export function getDefaultRange(type: PeriodType = 'month'): PeriodRange {
  const anchor = today()
  const month  = thisMonth()
  if (type === 'week') {
    const { start, end } = getWeekRange(anchor, 'monday')
    return { type, start, end, label: `${start} – ${end}` }
  }
  if (type === 'month') {
    const [y, m] = month.split('-').map(Number)
    const start  = `${month}-01`
    const end    = toLocalDateString(new Date(y, m, 0))
    return { type, start, end, label: formatMonthLabel(month) }
  }
  const year = String(new Date().getFullYear())
  return { type, start: `${year}-01-01`, end: `${year}-12-31`, label: `Năm ${year}` }
}
