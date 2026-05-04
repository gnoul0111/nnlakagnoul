'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

// ─── DateInput — 3 select (Ngày + Tháng + Năm) thay cho <input type="date"> ──
// iOS native <input type="date"> hiển thị "ngày 21 thg 4, 2026" quá dài.
// Component này dùng 3 select gọn gàng, nhất quán mọi thiết bị.
//
// Value format: "YYYY-MM-DD" (giống <input type="date">) → drop-in replacement.

interface DateInputProps {
  value:      string
  onChange:   (val: string) => void
  className?: string
  disabled?:  boolean
  yearRange?: number
  name?:      string
}

const selectClass = cn(
  'h-10 text-sm rounded-lg border bg-background px-2',
  'text-foreground cursor-pointer',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'border-input hover:border-ring/50',
)

function getDaysInMonth(year: number, month: number): number {
  // month 1-indexed (1=Jan, 12=Dec)
  return new Date(year, month, 0).getDate()
}

const pad = (n: number) => String(n).padStart(2, '0')

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  yearRange = 10,
  name,
}: DateInputProps) {
  const now         = new Date()
  const currentYear = now.getFullYear()
  const startYear   = currentYear - Math.floor(yearRange / 2)
  const years       = Array.from({ length: yearRange }, (_, i) => startYear + i)

  const [yearStr, monthStr, dayStr] = (value || '').split('-')
  const year  = parseInt(yearStr)  || currentYear
  const month = parseInt(monthStr) || now.getMonth() + 1
  const day   = parseInt(dayStr)   || now.getDate()

  const daysInMonth = getDaysInMonth(year, month)
  const days        = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Nếu đổi tháng/năm làm day vượt quá maxDay → clamp về maxDay
  const emit = (y: number, m: number, d: number) => {
    const maxDay  = getDaysInMonth(y, m)
    const clamped = Math.min(d, maxDay)
    onChange(`${y}-${pad(m)}-${pad(clamped)}`)
  }

  return (
    <div className={cn('flex gap-1.5 min-w-0', className)} data-name={name}>
      <select
        value={day}
        onChange={e => emit(year, month, parseInt(e.target.value))}
        disabled={disabled}
        className={cn(selectClass, 'flex-[0.8] min-w-0')}
        aria-label="Ngày"
      >
        {days.map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
      <select
        value={month}
        onChange={e => emit(year, parseInt(e.target.value), day)}
        disabled={disabled}
        className={cn(selectClass, 'flex-1 min-w-0')}
        aria-label="Tháng"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <option key={m} value={m}>Th.{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={e => emit(parseInt(e.target.value), month, day)}
        disabled={disabled}
        className={cn(selectClass, 'flex-[1.2] min-w-0')}
        aria-label="Năm"
      >
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}