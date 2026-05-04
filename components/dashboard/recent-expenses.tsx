'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Receipt } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils/currency'
import { formatRelativeDate } from '@/lib/utils/date'
import { CATEGORIES } from '@/lib/types/expense'
import type { Expense } from '@/lib/types/expense'
import { cn } from '@/lib/utils/cn'

interface RecentExpensesProps {
  expenses: Expense[]
  moneyHidden: boolean
}

const MAX_SHOW = 5

const categoryMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

export function RecentExpenses({ expenses, moneyHidden }: RecentExpensesProps) {
  const router = useRouter()

  // Sắp xếp gần nhất lên đầu, lấy MAX_SHOW
  const sorted = [...expenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_SHOW)

  return (
    <Card onClick={() => router.push('/finance?tab=expenses')}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-muted-foreground" />
          <CardTitle>Giao dịch gần đây</CardTitle>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardBody>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center py-4 gap-1">
            <p className="text-sm text-muted-foreground">Chưa có giao dịch nào tháng này</p>
            <p className="text-xs text-primary font-medium">Nhấn + để thêm ngay →</p>
          </div>
        ) : (
          <ul className="space-y-0 -mx-4">
            {sorted.map((expense, i) => {
              const cat = categoryMap[expense.category] ?? categoryMap.other
              const isLinked = !!(expense._debtId || expense._goalId || expense._savingsMonthKey)
              return (
                <li
                  key={expense.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5',
                    i < sorted.length - 1 && 'border-b border-border/50',
                  )}
                >
                  {/* Category icon */}
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-base shrink-0">
                    {cat.icon}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {(expense as any).title || expense.note || cat.label}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-muted-foreground">{formatRelativeDate(expense.date)}</p>
                      {isLinked && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full leading-none">
                          {expense._debtId ? 'Nợ' : expense._goalId ? 'Mục tiêu' : 'Tiết kiệm'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <p className={cn('text-sm font-semibold text-destructive shrink-0', moneyHidden && 'blur-sm')}>
                    {formatMoney(expense.amount, moneyHidden)}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}