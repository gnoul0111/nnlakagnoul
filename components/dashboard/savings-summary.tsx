'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, PiggyBank } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { Progress }       from '@/components/ui/progress'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { formatPercent }  from '@/lib/utils/currency'
import { computeTotalDeposited } from '@/lib/types/savings'
import type { SavingsPlan } from '@/lib/types/savings'

interface SavingsSummaryProps {
  plan:        SavingsPlan | null
  moneyHidden: boolean
}

export function SavingsSummary({ plan, moneyHidden }: SavingsSummaryProps) {
  const router         = useRouter()
  const totalDeposited = plan ? computeTotalDeposited(plan) : 0
  const target         = plan?.targetAmount ?? 0
  const pct            = target > 0 ? Math.min(100, Math.round((totalDeposited / target) * 100)) : 0

  return (
    <Card onClick={() => router.push('/finance?tab=savings')}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-purple-500" />
          <CardTitle>Tiết kiệm tháng</CardTitle>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </CardHeader>

      <CardBody className="space-y-3">
        {target > 0 ? (
          <div className="animate-reveal space-y-3">
            <Progress value={pct} level="ok" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Đã nạp:{' '}
                <span className="font-semibold text-foreground">
                  <AnimatedNumber value={totalDeposited} hidden={moneyHidden} />
                </span>
              </span>
              <span className="font-bold text-foreground">{formatPercent(pct)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Mục tiêu:{' '}
              <AnimatedNumber value={target} hidden={moneyHidden} />
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 gap-1">
            <p className="text-sm text-muted-foreground">Chưa đặt mục tiêu tiết kiệm</p>
            <p className="text-xs text-primary font-medium">Nhấn để thiết lập →</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
