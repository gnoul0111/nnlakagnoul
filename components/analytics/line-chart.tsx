'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils/currency'
import type { DailyData } from '@/hooks/useAnalyticsData'

interface SpendingLineChartProps {
  data: DailyData[]
  moneyHidden: boolean
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-destructive">{formatMoney(payload[0].value, false)}</p>
    </div>
  )
}

export function SpendingLineChart({ data, moneyHidden }: SpendingLineChartProps) {
  const average = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.expense, 0) / data.filter(d => d.expense > 0).length || 0)
    : 0

  const displayData = data.map(d => {
    const date = new Date(d.date)
    return { ...d, label: `${date.getDate()}/${date.getMonth() + 1}` }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chi tiêu theo ngày</CardTitle>
        {average > 0 && (
          <span className="text-xs text-muted-foreground">
            TB: {formatMoney(average, moneyHidden)}
          </span>
        )}
      </CardHeader>
      <CardBody>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={displayData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis hide />
            <Tooltip content={<CustomTooltip />} />
            {average > 0 && (
              <ReferenceLine y={average} stroke="hsl(var(--warning))"
                strokeDasharray="4 4" strokeWidth={1.5} />
            )}
            <Line type="monotone" dataKey="expense" stroke="hsl(var(--destructive))"
              strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }}
              opacity={moneyHidden ? 0.3 : 1} />
          </LineChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  )
}
