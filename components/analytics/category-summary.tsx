'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { MonthRangePicker } from '@/components/ui/date-picker'
import { useAppData } from '@/hooks/useAppData'
import { CATEGORIES, isConsumptionExpense } from '@/lib/types/expense'
import { formatMoney, formatPercent } from '@/lib/utils/currency'
import { thisMonth, prevMonth } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

interface CategorySummaryProps {
  moneyHidden: boolean
}

export function CategorySummary({ moneyHidden }: CategorySummaryProps) {
  const { expenses } = useAppData()
  // Bottom-sheet picker tự commit qua nút "Áp dụng" bên trong → không cần state draft + nút "Xem" ngoài nữa.
  const [range, setRange] = useState({ from: prevMonth(thisMonth()), to: thisMonth() })

  // Filter expenses in range
  const rangeExpenses = expenses.filter(e =>
    !e.deleted &&
    isConsumptionExpense(e) &&
    e.date.slice(0, 7) >= range.from &&
    e.date.slice(0, 7) <= range.to,
  )

  const total = rangeExpenses.reduce((s, e) => s + e.amount, 0)

  const catData = CATEGORIES.map(cat => {
    const catExpenses = rangeExpenses.filter(e => e.category === cat.value)
    const amount = catExpenses.reduce((s, e) => s + e.amount, 0)
    return { ...cat, amount, count: catExpenses.length, percent: total > 0 ? Math.round((amount / total) * 100) : 0 }
  }).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount)

  return (
    <Card>
      <CardHeader><CardTitle>Tổng hợp danh mục</CardTitle></CardHeader>
      <CardBody className="space-y-4">
        {/* Range picker */}
        <MonthRangePicker
          value={range}
          onChange={v => {
            // Khi user xoá → rỗng; fallback về "tháng này → tháng này" để tránh hiển thị không có dữ liệu
            if (!v.from || !v.to) {
              setRange({ from: thisMonth(), to: thisMonth() })
            } else {
              setRange(v)
            }
          }}
          headerLabel="Khoảng thời gian"
        />

        {/* Results */}
        {catData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Không có dữ liệu trong khoảng này</p>
        ) : (
          <div className="space-y-0 -mx-4">
            {/* Header */}
            <div className="flex items-center px-4 py-2 bg-muted/30 border-y border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <span className="flex-1 min-w-0">Danh mục</span>
              <span className="w-10 sm:w-16 text-right shrink-0">GD</span>
              <span className="w-24 sm:w-28 text-right shrink-0">Số tiền</span>
              <span className="w-10 text-right shrink-0">%</span>
            </div>
            {catData.map((cat, i) => (
              <div key={cat.value}
                className={cn('flex items-center px-4 py-3', i < catData.length - 1 && 'border-b border-border/50')}>
                <div className="flex-1 flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">{cat.icon}</span>
                  <span className="text-sm font-medium text-foreground truncate">{cat.label}</span>
                </div>
                <span className="w-10 sm:w-16 text-right text-sm text-muted-foreground shrink-0">{cat.count}</span>
                <span className={cn('w-24 sm:w-28 text-right text-sm font-semibold text-foreground shrink-0 truncate', moneyHidden && 'blur-sm')}>
                  {formatMoney(cat.amount, moneyHidden)}
                </span>
                <span className="w-10 text-right text-xs text-muted-foreground shrink-0">
                  {formatPercent(cat.percent)}
                </span>
              </div>
            ))}
            {/* Total row */}
            <div className="flex items-center px-4 py-3 border-t border-border bg-muted/20">
              <div className="flex-1 text-sm font-bold text-foreground min-w-0">Tổng cộng</div>
              <span className="w-10 sm:w-16 text-right text-sm text-muted-foreground shrink-0">
                {rangeExpenses.length}
              </span>
              <span className={cn('w-24 sm:w-28 text-right text-sm font-bold text-foreground shrink-0 truncate', moneyHidden && 'blur-sm')}>
                {formatMoney(total, moneyHidden)}
              </span>
              <span className="w-10 text-right text-xs text-muted-foreground shrink-0">100%</span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}