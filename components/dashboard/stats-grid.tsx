'use client'

import React from 'react'
import Link from 'next/link'
import {
  Eye, EyeOff, TrendingUp, TrendingDown, Wallet,
  ArrowUp, ArrowDown, ChevronRight, type LucideIcon,
} from 'lucide-react'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils/cn'

// ─── Types ──────────────────────────────────────────────────────────────────

interface HeroData {
  income:           number
  consumption:      number
  balance:          number
  incomeTrend:      number | null
  consumptionTrend: number | null
  balanceTrend:     number | null
  spendRatio:       number   // chi/thu * 100 (chưa cap)
}

interface SecondaryCardData {
  id:          string
  label:       string
  icon:        LucideIcon
  color:       string
  iconColor:   string
  barColor:    string
  href:        string
  targetLabel: string
  value:       number
  target:      number
  progressPct: number
  subtitle?:   string
}

interface StatsGridProps {
  hero:           HeroData
  cards:          SecondaryCardData[]
  moneyHidden:    boolean
  onToggleHidden: () => void
  budgetSlot?:    React.ReactNode
}

// ─── Trend line (% so với tháng trước) ─────────────────────────────────────────

function TrendLine({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null || pct === 0) {
    return <span className="text-[11px] text-muted-foreground">— so với tháng trước</span>
  }
  const up   = pct > 0
  const good = up === goodWhenUp
  return (
    <span className={cn('flex items-center gap-0.5 text-[11px] font-medium', good ? 'text-success' : 'text-destructive')}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(pct)}%
      <span className="ml-1 font-normal text-muted-foreground">so với tháng trước</span>
    </span>
  )
}

// ─── StatsGrid ────────────────────────────────────────────────────────────────

export function StatsGrid({ hero, cards, moneyHidden, onToggleHidden, budgetSlot }: StatsGridProps) {
  const heroItems = [
    { key: 'income',      label: 'Tổng thu', Icon: TrendingUp,   ring: 'bg-success/15',     iconColor: 'text-success',
      value: hero.income,      valueColor: 'text-success',     trend: hero.incomeTrend,      goodWhenUp: true },
    { key: 'consumption', label: 'Tổng chi', Icon: TrendingDown, ring: 'bg-destructive/15', iconColor: 'text-destructive',
      value: hero.consumption, valueColor: 'text-destructive', trend: hero.consumptionTrend, goodWhenUp: false },
    { key: 'balance',     label: 'Số dư',    Icon: Wallet,       ring: 'bg-purple-500/15',  iconColor: 'text-purple-500',
      value: hero.balance,     valueColor: hero.balance >= 0 ? 'text-foreground' : 'text-destructive', trend: hero.balanceTrend, goodWhenUp: true },
  ]

  const ratioFill = Math.min(100, hero.spendRatio)
  const ratioStatus =
    hero.spendRatio >= 100 ? { text: 'Chi tiêu cao hơn thu nhập', color: 'text-destructive' }
    : hero.spendRatio >= 80 ? { text: 'Chi tiêu khá cao',          color: 'text-amber-500' }
    : { text: 'Chi tiêu trong tầm kiểm soát', color: 'text-success' }

  return (
    <div className="space-y-3 animate-reveal">
      {/* Header + actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Tổng quan tháng
        </h2>
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

      {/* ─── HERO — 4 cards riêng (2×2 mobile, 4 cols desktop) ─────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {heroItems.map(it => (
          <div key={it.key} className="bg-card border border-border rounded-2xl p-3.5 sm:p-4 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{it.label}</p>
              <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0', it.ring)}>
                <it.Icon className={cn('w-4 h-4', it.iconColor)} />
              </div>
            </div>
            <p className={cn('text-xl font-bold leading-tight truncate', it.valueColor)}>
              <AnimatedNumber value={it.value} hidden={moneyHidden} />
            </p>
            <TrendLine pct={it.trend} goodWhenUp={it.goodWhenUp} />
          </div>
        ))}

        {/* Card 4: Tỷ lệ chi/thu */}
        <div className="bg-card border border-border rounded-2xl p-3.5 sm:p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tỷ lệ chi/thu</p>
            <span className={cn('text-sm font-bold', ratioStatus.color)}>{Math.round(hero.spendRatio)}%</span>
          </div>
          <div className="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500 mt-1">
            <div className="absolute inset-y-0 right-0 bg-muted/80" style={{ width: `${100 - ratioFill}%` }} />
          </div>
          <p className={cn('text-[11px]', ratioStatus.color)}>{ratioStatus.text}</p>
        </div>
      </div>

      {/* ─── Budget slot (inject từ parent) ──────────────────────────────────────── */}
      {budgetSlot}

      {/* ─── Thẻ phụ (bật/tắt qua Tùy chỉnh) ───────────────────────────────────── */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(c => {
            const Icon = c.icon
            return (
              <Link
                key={c.id}
                href={c.href}
                className="block bg-card border border-border rounded-2xl p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-11 h-11 rounded-full flex items-center justify-center shrink-0', c.color)}>
                    <Icon className={cn('w-5 h-5', c.iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-lg font-bold text-foreground leading-tight truncate">
                      <AnimatedNumber value={c.value} hidden={moneyHidden} />
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>

                {c.target > 0 ? (
                  <>
                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground truncate">
                        {c.targetLabel}: <AnimatedNumber value={c.target} hidden={moneyHidden} />
                      </span>
                      <span className={cn('ml-2 shrink-0 font-semibold', c.iconColor)}>
                        {Math.round(c.progressPct)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', c.barColor)}
                        style={{ width: `${Math.min(100, c.progressPct)}%` }}
                      />
                    </div>
                  </>
                ) : c.subtitle ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">{c.subtitle}</p>
                ) : null}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
