'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { CATEGORIES } from '@/lib/types/expense'
import { formatMoney, formatPercent } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

const CATEGORY_COLORS: Record<string, string> = {
  food:          '#f97316',
  transport:     '#3b82f6',
  shopping:      '#ec4899',
  entertainment: '#8b5cf6',
  bills:         '#06b6d4',
  health:        '#10b981',
  education:     '#f59e0b',
  other:         '#94a3b8',
}

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

interface CategoryData {
  category: string
  amount: number
  percent: number
  count: number
}

interface DonutChartProps {
  data: CategoryData[]
  moneyHidden: boolean
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as CategoryData
  const cat  = catMap[item.category] ?? catMap.other
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold text-foreground">{cat.icon} {cat.label}</p>
      <p className="text-muted-foreground">{formatMoney(item.amount, false)}</p>
      <p className="text-muted-foreground">{formatPercent(item.percent)}</p>
    </div>
  )
}

export function DonutChart({ data, moneyHidden }: DonutChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Chi tiêu theo danh mục</CardTitle></CardHeader>
        <CardBody><p className="text-sm text-muted-foreground text-center py-6">Không có dữ liệu</p></CardBody>
      </Card>
    )
  }

  const total = data.reduce((s, d) => s + d.amount, 0)

  return (
    <Card>
      <CardHeader><CardTitle>Chi tiêu theo danh mục</CardTitle></CardHeader>
      <CardBody>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Donut */}
          <div className="relative w-44 h-44 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={52} outerRadius={72}
                  dataKey="amount" paddingAngle={2}>
                  {data.map((entry) => (
                    <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[10px] text-muted-foreground">Tổng</p>
              <p className={cn('text-sm font-bold text-foreground', moneyHidden && 'blur-sm')}>
                {formatMoney(total, moneyHidden)}
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="flex-1 w-full space-y-2">
            {data.map(item => {
              const cat   = catMap[item.category] ?? catMap.other
              const color = CATEGORY_COLORS[item.category] ?? '#94a3b8'
              return (
                <div key={item.category} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground truncate">{cat.icon} {cat.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={cn('text-sm font-semibold text-foreground', moneyHidden && 'blur-sm')}>
                          {formatMoney(item.amount, moneyHidden)}
                        </span>
                        <span className="text-xs text-muted-foreground w-8 text-right">
                          {formatPercent(item.percent)}
                        </span>
                      </div>
                    </div>
                    {/* Mini bar */}
                    <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${item.percent}%`, backgroundColor: color }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
