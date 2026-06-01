'use client'

import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { useTrendData } from '@/hooks/useAnalyticsData'
import { CATEGORIES } from '@/lib/types/expense'
import { formatMoney, formatCompact } from '@/lib/utils/currency'
import { formatMonthCompact } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  ...CATEGORIES.map(c => ({ value: c.value, label: `${c.icon} ${c.label}` })),
]

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-primary">{formatMoney(payload[0].value, false)}</p>
    </div>
  )
}

interface TrendChartProps {
  moneyHidden: boolean
}

export function TrendChart({ moneyHidden }: TrendChartProps) {
  const [filter, setFilter] = useState('all')
  const { data } = useTrendData(filter)

  // Compute displayData first so maxMonth/minMonth have the label field
  const amounts  = data.map(d => d.amount)
  const avg      = amounts.length > 0 ? Math.round(amounts.reduce((s, v) => s + v, 0) / amounts.filter(v => v > 0).length || 0) : 0

  const displayData = data.map(d => ({
    ...d,
    label: formatMonthCompact(d.month),
  }))

  const maxMonth = displayData.reduce((best, d) => d.amount > best.amount ? d : best, displayData[0])
  const minMonth = displayData.filter(d => d.amount > 0).reduce((best, d) => d.amount < best.amount ? d : best, displayData.find(d => d.amount > 0) ?? displayData[0])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Xu hướng 6 tháng</CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {/* Filter */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {FILTER_OPTIONS.slice(0, 5).map(opt => (
            <button key={opt.value} onClick={() => setFilter(opt.value)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                filter === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={displayData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="amount" stroke="hsl(var(--primary))"
              strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
              activeDot={{ r: 5 }} opacity={moneyHidden ? 0.3 : 1} />
          </LineChart>
        </ResponsiveContainer>

        {/* Summary */}
        {avg > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { label: 'Tháng cao nhất', value: maxMonth?.amount ?? 0, month: maxMonth?.label ?? '' },
              { label: 'Trung bình', value: avg, month: '' },
              { label: 'Tháng thấp nhất', value: minMonth?.amount ?? 0, month: minMonth?.label ?? '' },
            ].map(item => (
              <div key={item.label} className="bg-muted/50 rounded-lg p-2 text-center">
                <p className="text-[10px] text-muted-foreground leading-tight">{item.label}</p>
                <p className={cn('text-xs font-bold text-foreground mt-0.5 truncate')}>
                  {moneyHidden ? '••••' : formatCompact(item.value) + 'đ'}
                </p>
                {item.month && <p className="text-[10px] text-muted-foreground">{item.month}</p>}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  )
}