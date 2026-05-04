'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { CATEGORIES } from '@/lib/types/expense'
import { formatMoney, formatCompact } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

interface CompareCardProps {
  current: number
  previous: number
  diff: number
  pctDiff: number
  hasPrevious: boolean
  categoryCompare: Array<{
    category: string
    current: number
    previous: number
    diff: number
    pctDiff: number
  }>
  moneyHidden: boolean
}

export function CompareCard({
  current, previous, diff, pctDiff, hasPrevious, categoryCompare, moneyHidden,
}: CompareCardProps) {
  if (!hasPrevious) return null

  const isIncrease = diff > 0
  const isEqual    = diff === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>So sánh kỳ trước</CardTitle>
        <div className={cn(
          'flex items-center gap-1 text-sm font-semibold',
          isEqual ? 'text-muted-foreground' : isIncrease ? 'text-destructive' : 'text-success',
        )}>
          {isEqual
            ? <Minus className="w-4 h-4" />
            : isIncrease
              ? <TrendingUp className="w-4 h-4" />
              : <TrendingDown className="w-4 h-4" />
          }
          {isEqual ? 'Không đổi' : `${isIncrease ? '+' : ''}${pctDiff}%`}
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Kỳ này</p>
            <p className={cn('text-base font-bold text-foreground mt-0.5', moneyHidden && 'blur-sm')}>
              {formatMoney(current, moneyHidden)}
            </p>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Kỳ trước</p>
            <p className={cn('text-base font-bold text-muted-foreground mt-0.5', moneyHidden && 'blur-sm')}>
              {formatMoney(previous, moneyHidden)}
            </p>
          </div>
        </div>

        {/* Category compare */}
        {categoryCompare.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Theo danh mục</p>
            {categoryCompare.map(item => {
              const cat        = catMap[item.category] ?? catMap.other
              const isUp       = item.diff > 0
              const isNoChange = item.diff === 0
              return (
                <div key={item.category} className="flex items-center gap-2.5">
                  <span className="text-base">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{cat.label}</p>
                  </div>
                  <div className={cn(
                    'flex items-center gap-1 text-xs font-semibold shrink-0',
                    isNoChange ? 'text-muted-foreground' : isUp ? 'text-destructive' : 'text-success',
                  )}>
                    {!isNoChange && (isUp
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />
                    )}
                    {isNoChange ? '–' : `${isUp ? '+' : ''}${item.pctDiff}%`}
                  </div>
                  <p className={cn('text-xs text-muted-foreground shrink-0 text-right', moneyHidden && 'blur-sm')}>
                    {moneyHidden ? '••••' : formatCompact(item.current) + 'đ'}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )
}