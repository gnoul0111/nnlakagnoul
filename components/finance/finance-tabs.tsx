'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils/cn'

export type FinanceTab =
  | 'expenses' | 'income' | 'budget'
  | 'goals' | 'templates' | 'savings' | 'debts'

const TABS: { id: FinanceTab; label: string; icon: string }[] = [
  { id: 'expenses',  label: 'Chi tiêu',  icon: '💸' },
  { id: 'income',    label: 'Thu nhập',  icon: '💰' },
  { id: 'budget',    label: 'Ngân sách', icon: '📊' },
  { id: 'goals',     label: 'Mục tiêu',  icon: '🎯' },
  { id: 'templates', label: 'Biểu mẫu',  icon: '📋' },
  { id: 'savings',   label: 'Tiết kiệm', icon: '🐷' },
  { id: 'debts',     label: 'Nợ/Vay',   icon: '🤝' },
]

interface FinanceTabsProps {
  activeTab: FinanceTab
}

export function FinanceTabs({ activeTab }: FinanceTabsProps) {
  const router       = useRouter()
  const scrollRef    = useRef<HTMLDivElement>(null)
  const activeRef    = useRef<HTMLButtonElement>(null)

  // Track whether there's overflow to the right → show fade indicator
  const [hasRightOverflow, setHasRightOverflow] = useState(false)

  // Check scroll overflow state
  const checkOverflow = () => {
    const el = scrollRef.current
    if (!el) return
    setHasRightOverflow(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  // Auto-scroll active tab into view whenever activeTab changes
  useEffect(() => {
    const btn = activeRef.current
    if (!btn) return
    // scrollIntoView with nearest block prevents page scroll, only scrolls the container
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })

    // Re-check overflow after scroll settles
    const t = setTimeout(checkOverflow, 350)
    return () => clearTimeout(t)
  }, [activeTab])

  // Check overflow on mount and resize
  useEffect(() => {
    checkOverflow()
    const ro = new ResizeObserver(checkOverflow)
    if (scrollRef.current) ro.observe(scrollRef.current)
    return () => ro.disconnect()
  }, [])

  const goTo = (tab: FinanceTab) => {
    router.push(`/finance?tab=${tab}`, { scroll: false })
  }

  return (
    // Wrapper position:relative để gradient overlay có thể absolute-position đúng chỗ
    <div className="relative -mx-3 sm:-mx-4 lg:mx-0">
      {/* Tab strip */}
      <div
        ref={scrollRef}
        onScroll={checkOverflow}
        className="flex gap-1 overflow-x-auto scrollbar-hide pb-1 px-3 sm:px-4 lg:px-0"
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              ref={isActive ? activeRef : null}
              onClick={() => goTo(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Right-fade gradient — chỉ hiện khi còn tab bị khuất bên phải */}
      {/* Báo hiệu cho user biết cần vuốt để xem thêm */}
      <div
        aria-hidden
        className={cn(
          'absolute right-0 top-0 h-full w-12 pointer-events-none transition-opacity duration-200',
          // Gradient từ transparent → background, blend với màu nền trang
          'bg-gradient-to-l from-background to-transparent',
          hasRightOverflow ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}