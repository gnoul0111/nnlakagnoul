'use client'

import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { formatMoney } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

interface CashflowCardProps {
  totalIncome: number
  spendingTotal: number
  debtPaidTotal: number
  goalSavedTotal: number
  savingsTotal: number
  totalCashOut: number
  netBalance: number
  moneyHidden: boolean
}

export function CashflowCard({
  totalIncome, spendingTotal, debtPaidTotal,
  goalSavedTotal, savingsTotal, totalCashOut, netBalance, moneyHidden,
}: CashflowCardProps) {
  // Các dòng cộng/trừ ra "Số dư thực". Chi tiêu đã GỒM chi tài trợ bằng nợ.
  // Trả nợ gốc KHÔNG nằm ở đây (là chuyển dịch, không trừ vào số dư) → xem dòng info.
  const rows = [
    { label: '💰 Thu nhập',     value: totalIncome,    color: 'text-success',     sign: '+' },
    { label: '💸 Chi tiêu',     value: spendingTotal,  color: 'text-destructive', sign: '-' },
    { label: '🎯 Nạp mục tiêu', value: goalSavedTotal, color: 'text-purple-500',  sign: '-' },
    { label: '🐷 Tiết kiệm',    value: savingsTotal,   color: 'text-primary',     sign: '-' },
  ].filter(r => r.value > 0)

  return (
    <Card>
      <CardHeader><CardTitle>Dòng tiền thực tế</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        {rows.map(row => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-sm text-foreground">{row.label}</span>
            <span className={cn('text-sm font-semibold', row.color, moneyHidden && 'blur-sm')}>
              {row.sign}{formatMoney(row.value, moneyHidden)}
            </span>
          </div>
        ))}

        {/* Divider */}
        <div className="border-t border-border pt-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Số dư thực</span>
          <span className={cn(
            'text-base font-bold',
            netBalance >= 0 ? 'text-success' : 'text-destructive',
            moneyHidden && 'blur-sm',
          )}>
            {netBalance >= 0 ? '+' : ''}{formatMoney(netBalance, moneyHidden)}
          </span>
        </div>

        {/* Trả nợ gốc — thông tin, KHÔNG ảnh hưởng số dư (đã tính trong chi tiêu) */}
        {debtPaidTotal > 0 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">🤝 Trả nợ gốc trong tháng</span>
            <span className={cn('text-xs text-muted-foreground', moneyHidden && 'blur-sm')}>
              {formatMoney(debtPaidTotal, moneyHidden)}
            </span>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
