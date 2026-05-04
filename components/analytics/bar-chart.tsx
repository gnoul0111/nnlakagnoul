'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils/currency'
import type { DailyData } from '@/hooks/useAnalyticsData'
import type { PeriodType } from '@/hooks/useAnalyticsData'

interface IncomeExpenseBarChartProps {
  data: DailyData[]
  periodType: PeriodType
  moneyHidden: boolean
}

function formatXLabel(date: string, type: PeriodType): string {
  if (type === 'year' || date.startsWith('T') || date.startsWith('Tuần')) return date
  const d = new Date(date)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatMoney(p.value, false)}
        </p>
      ))}
    </div>
  )
}

export function IncomeExpenseBarChart({ data, periodType, moneyHidden }: IncomeExpenseBarChartProps) {
  const displayData = data.map(d => ({
    ...d,
    label: formatXLabel(d.date, periodType),
  }))

  const hasIncome = data.some(d => d.income > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thu nhập vs Chi tiêu</CardTitle>
      </CardHeader>
      <CardBody>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }} />
            {hasIncome && (
              <Bar dataKey="income" name="Thu nhập" fill="hsl(var(--success))"
                radius={[3, 3, 0, 0]} opacity={moneyHidden ? 0.3 : 1} />
            )}
            <Bar dataKey="expense" name="Chi tiêu" fill="hsl(var(--destructive))"
              radius={[3, 3, 0, 0]} opacity={moneyHidden ? 0.3 : 1} />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2">
          {hasIncome && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-sm bg-success" />
              Thu nhập
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2.5 h-2.5 rounded-sm bg-destructive" />
            Chi tiêu
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
