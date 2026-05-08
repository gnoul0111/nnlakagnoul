'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, AlertTriangle, Clock } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils/currency'
import { isDebtOverdue, isDebtUpcoming, computeRemaining } from '@/lib/types/debt'
import { today, daysDiff } from '@/lib/utils/date'
import type { Debt } from '@/lib/types/debt'
import { cn } from '@/lib/utils/cn'

interface DebtAlertsProps {
  debts: Debt[]
  moneyHidden: boolean
}

export function DebtAlerts({ debts, moneyHidden }: DebtAlertsProps) {
  const router = useRouter()
  const todayStr = today()

  const overdue  = debts.filter(d => isDebtOverdue(d, todayStr))
  const upcoming = debts.filter(d => isDebtUpcoming(d, todayStr))
  const total = overdue.length + upcoming.length

  if (total === 0) return null

  return (
    <Card onClick={() => router.push('/finance?tab=debts')}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <CardTitle>Nợ cần xử lý</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
            {total} khoản
          </span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardBody className="space-y-2">
        {/* Overdue */}
        {overdue.map(debt => (
          <DebtRow key={debt.id} debt={debt} type="overdue" moneyHidden={moneyHidden} todayStr={todayStr} />
        ))}
        {/* Upcoming */}
        {upcoming.map(debt => (
          <DebtRow key={debt.id} debt={debt} type="upcoming" moneyHidden={moneyHidden} todayStr={todayStr} />
        ))}
      </CardBody>
    </Card>
  )
}

function DebtRow({ debt, type, moneyHidden, todayStr }: {
  debt: Debt
  type: 'overdue' | 'upcoming'
  moneyHidden: boolean
  todayStr: string
}) {
  const remaining = computeRemaining(debt)
  const diff = debt.dueDate ? daysDiff(todayStr, debt.dueDate) : null
  const isOverdue = type === 'overdue'

  return (
    <div className={cn(
      'flex items-center justify-between p-2.5 rounded-lg',
      isOverdue ? 'bg-destructive/5' : 'bg-warning/5',
    )}>
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0',
          isOverdue ? 'bg-destructive/15' : 'bg-warning/15',
        )}>
          {isOverdue
            ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
            : <Clock className="w-3.5 h-3.5 text-warning" />
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{debt.name}</p>
          <p className={cn('text-xs font-medium', isOverdue ? 'text-destructive' : 'text-warning')}>
            {diff === null
              ? 'Không có ngày hạn'
              : isOverdue
                ? `Quá hạn ${Math.abs(diff)} ngày`
                : diff === 0 ? 'Đến hạn hôm nay' : `Còn ${diff} ngày`
            }
          </p>
        </div>
      </div>
      <div className={cn('text-sm font-semibold shrink-0', moneyHidden ? 'blur-sm' : '')}>
        {formatMoney(remaining, moneyHidden)}
      </div>
    </div>
  )
}
