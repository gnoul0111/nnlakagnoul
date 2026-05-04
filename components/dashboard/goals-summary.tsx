'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight, Target } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/card'
import { Progress }       from '@/components/ui/progress'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { formatPercent }  from '@/lib/utils/currency'
import { computeGoalBalance, computeGoalProgress } from '@/lib/types/goal'
import type { Goal } from '@/lib/types/goal'

interface GoalsSummaryProps {
  goals:       Goal[]
  moneyHidden: boolean
}

const MAX_SHOW = 3

export function GoalsSummary({ goals, moneyHidden }: GoalsSummaryProps) {
  const router = useRouter()

  if (goals.length === 0) return null

  const activeGoals = goals.slice(0, MAX_SHOW)

  return (
    <Card onClick={() => router.push('/finance?tab=goals')}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <CardTitle>Mục tiêu tiết kiệm</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          {goals.length > MAX_SHOW && (
            <span className="text-xs text-muted-foreground">+{goals.length - MAX_SHOW} khác</span>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </div>
      </CardHeader>

      <CardBody>
        {/* stagger-list: từng goal xuất hiện lần lượt */}
        <div className="space-y-3 stagger-list">
          {activeGoals.map(goal => {
            const balance  = computeGoalBalance(goal)
            const progress = computeGoalProgress(goal)
            const pct      = Math.round(progress * 100)
            return (
              <div key={goal.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-base leading-none">{goal.icon}</span>
                    <span className="font-medium text-foreground truncate">{goal.name}</span>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground shrink-0 ml-2">
                    {formatPercent(pct)}
                  </span>
                </div>

                {/* Progress bar animates on mount (transition-all duration-500) */}
                <Progress value={pct} level="ok" />

                <div className="flex justify-between text-xs text-muted-foreground">
                  <AnimatedNumber value={balance}           hidden={moneyHidden} />
                  <span>/&nbsp;</span>
                  <AnimatedNumber value={goal.targetAmount} hidden={moneyHidden} />
                </div>
              </div>
            )
          })}
        </div>
      </CardBody>
    </Card>
  )
}
