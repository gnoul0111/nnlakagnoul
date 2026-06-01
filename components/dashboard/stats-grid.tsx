'use client'

import { Eye, EyeOff, SlidersHorizontal } from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils/cn'
import { getMetric, type MetricValues } from '@/lib/dashboard/metricCatalog'

// ─── StatCard ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:     string
  amount:    number
  icon:      React.ReactNode
  color:     string
  iconColor: string
  hidden:    boolean
}

function StatCard({ label, amount, icon, color, iconColor, hidden }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
          <div className={cn('w-4 h-4', iconColor)}>{icon}</div>
        </div>
      </div>

      {/* AnimatedNumber: số đếm mượt khi đổi tháng */}
      <p className="text-xl sm:text-2xl font-bold text-foreground leading-none">
        <AnimatedNumber value={amount} hidden={hidden} />
      </p>
    </div>
  )
}

// ─── StatsGrid ────────────────────────────────────────────────────────────────

interface StatsGridProps {
  metrics:        MetricValues
  metricIds:      string[]      // thẻ nào hiển thị, theo thứ tự (từ settings)
  moneyHidden:    boolean
  onToggleHidden: () => void
  onCustomize?:   () => void    // mở panel tùy chỉnh thẻ
}

export function StatsGrid({ metrics, metricIds, moneyHidden, onToggleHidden, onCustomize }: StatsGridProps) {
  // Lọc id hợp lệ (bỏ id lạ nếu catalog đổi) — phòng dữ liệu settings cũ/hỏng
  const visible = metricIds
    .map(getMetric)
    .filter((m): m is NonNullable<ReturnType<typeof getMetric>> => m != null)

  return (
    <div className="space-y-3 animate-reveal">
      {/* Header + toggle ẩn số tiền */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Tổng quan tháng
        </h2>
        <div className="flex items-center gap-1">
          {onCustomize && (
            <button
              onClick={onCustomize}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
              aria-label="Tùy chỉnh thẻ hiển thị"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Tùy chỉnh</span>
            </button>
          )}
          <button
            onClick={onToggleHidden}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
            aria-label={moneyHidden ? 'Hiện số tiền' : 'Ẩn số tiền'}
          >
            {moneyHidden
              ? <EyeOff className="w-3.5 h-3.5 shrink-0" />
              : <Eye    className="w-3.5 h-3.5 shrink-0" />
            }
            <span className="hidden sm:inline">{moneyHidden ? 'Hiện' : 'Ẩn'} số tiền</span>
          </button>
        </div>
      </div>

      {/* Lưới co giãn: mobile ~2 cột, PC giãn hết bề ngang theo số thẻ */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {visible.map(m => {
          const Icon = m.icon
          return (
            <StatCard
              key={m.id}
              label={m.label}
              amount={metrics[m.id]}
              icon={<Icon className="w-4 h-4" />}
              color={m.color}
              iconColor={m.iconColor}
              hidden={moneyHidden}
            />
          )
        })}
      </div>
    </div>
  )
}
