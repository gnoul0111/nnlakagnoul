'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { Progress }        from '@/components/ui/progress'
import { AnimatedNumber }  from '@/components/ui/animated-number'
import { formatPercent }   from '@/lib/utils/currency'
import { getBudgetAlertLevel } from '@/lib/types/budget'
import { cn } from '@/lib/utils/cn'

interface BudgetProgressProps {
  budgetAmount: number
  usedAmount:   number
  moneyHidden:  boolean
}

const alertLabels = {
  ok:      { text: 'Tốt',       class: 'text-[hsl(var(--success))] bg-[hsl(var(--success)/0.1)]' },
  warning: { text: 'Chú ý',     class: 'text-[hsl(var(--warning))] bg-[hsl(var(--warning)/0.1)]' },
  danger:  { text: 'Cảnh báo',  class: 'text-orange-500 bg-orange-500/10' },
  over:    { text: 'Vượt!',     class: 'text-destructive bg-destructive/10' },
}

export function BudgetProgress({ budgetAmount, usedAmount, moneyHidden }: BudgetProgressProps) {
  const router    = useRouter()
  const pct       = budgetAmount > 0 ? Math.round((usedAmount / budgetAmount) * 100) : 0
  const level     = getBudgetAlertLevel(usedAmount, budgetAmount)
  const label     = alertLabels[level]
  const remaining = Math.max(0, budgetAmount - usedAmount)

  return (
    <Card onClick={() => router.push('/finance?tab=budget')}>
      <CardHeader>
        <CardTitle>Ngân sách tháng</CardTitle>
        <div className="flex items-center gap-2">
          {budgetAmount > 0 && (
            <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', label.class)}>
              {label.text}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </CardHeader>

      <CardBody className="space-y-3">
        {budgetAmount > 0 ? (
          /* animate-reveal: fade-in mượt khi budget data load */
          <div className="animate-reveal space-y-3">
            {/* Progress bar — transition-all duration-500 đã có trong Progress component */}
            <Progress value={pct} level={level} />

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Đã dùng{' '}
                <span className="font-semibold text-foreground">
                  <AnimatedNumber value={usedAmount} hidden={moneyHidden} />
                </span>
              </span>
              <span className="font-bold text-foreground">{formatPercent(pct)}</span>
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                Còn lại:{' '}
                <AnimatedNumber value={remaining} hidden={moneyHidden} />
              </span>
              <span>/ <AnimatedNumber value={budgetAmount} hidden={moneyHidden} /></span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <p className="text-sm text-muted-foreground">Chưa đặt ngân sách tháng này</p>
            <p className="text-xs text-primary font-medium">Nhấn để thiết lập →</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
