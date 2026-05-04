'use client'

import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { CATEGORIES } from '@/lib/types/expense'
import { formatMoney } from '@/lib/utils/currency'
import { formatDateVN } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import type { Expense } from '@/lib/types/expense'

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

interface TopExpensesProps {
  expenses: Expense[]
  moneyHidden: boolean
}

export function TopExpenses({ expenses, moneyHidden }: TopExpensesProps) {
  if (expenses.length === 0) return null
  const maxAmount = expenses[0]?.amount ?? 1

  return (
    <Card>
      <CardHeader><CardTitle>Chi tiêu lớn nhất</CardTitle></CardHeader>
      <CardBody className="space-y-2.5">
        {expenses.map((expense, i) => {
          const cat   = catMap[expense.category] ?? catMap.other
          const width = Math.round((expense.amount / maxAmount) * 100)
          return (
            <div key={expense.id} className="flex items-center gap-3">
              {/* Rank */}
              <span className="text-xs font-bold text-muted-foreground w-4 shrink-0 text-center">
                {i + 1}
              </span>
              {/* Icon */}
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm shrink-0">
                {cat.icon}
              </div>
              {/* Info + bar */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {(expense as any).title || expense.note || cat.label}
                  </p>
                  <p className={cn('text-sm font-bold text-destructive shrink-0', moneyHidden && 'blur-sm')}>
                    {formatMoney(expense.amount, moneyHidden)}
                  </p>
                </div>
                <div className="h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-destructive/60 rounded-full transition-all"
                    style={{ width: `${width}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{formatDateVN(expense.date)} · {cat.label}</p>
              </div>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}