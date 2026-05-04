'use client'

import * as React from 'react'
import { cn } from '@/lib/utils/cn'

// ─── MonthInput — 2 select side-by-side thay cho <input type="month"> ─────────
// iOS native hiển thị "tháng 4 năm 2026" quá dài, gây tràn.
// Component này dùng 2 select (Tháng + Năm) → gọn, nhất quán mọi thiết bị.
//
// Value format: "YYYY-MM" (giống <input type="month">) → drop-in replacement.

interface MonthInputProps {
  value:      string
  onChange:   (val: string) => void
  className?: string
  disabled?:  boolean
  yearRange?: number
}

const selectClass = cn(
  'h-10 text-sm rounded-lg border bg-background px-2',
  'text-foreground cursor-pointer',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'border-input hover:border-ring/50',
)

export function MonthInput({
  value,
  onChange,
  className,
  disabled,
  yearRange = 10,
}: MonthInputProps) {
  const now         = new Date()
  const currentYear = now.getFullYear()
  const startYear   = currentYear - Math.floor(yearRange / 2)
  const years       = Array.from({ length: yearRange }, (_, i) => startYear + i)

  const [yearStr, monthStr] = (value || '').split('-')
  const year  = parseInt(yearStr)  || currentYear
  const month = parseInt(monthStr) || now.getMonth() + 1

  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <div className={cn('flex gap-1.5 min-w-0', className)}>
      <select
        value={month}
        onChange={e => onChange(`${year}-${pad(parseInt(e.target.value))}`)}
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
        onChange={e => onChange(`${parseInt(e.target.value)}-${pad(month)}`)}
        disabled={disabled}
        className={cn(selectClass, 'flex-1 min-w-0')}
        aria-label="Năm"
      >
        {years.map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  )
}