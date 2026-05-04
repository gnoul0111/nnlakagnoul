'use client'

import { useEffect, useRef, useState } from 'react'
import { formatVND } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

const HIDDEN = '••••'

interface AnimatedNumberProps {
  value:      number
  hidden?:    boolean
  duration?:  number                    // ms — default 380
  formatter?: (n: number) => string     // default formatVND
  className?: string
}

/**
 * Hiển thị số tiền với counter animation khi `value` thay đổi.
 * Dùng thay cho `formatMoney(amount, hidden)` ở các card stats.
 *
 * Tính năng:
 * - Ease-out cubic — nhanh ở đầu, chậm ở cuối, cảm giác responsive
 * - Không animate lần đầu (snapshot ngay)
 * - Dừng animation cũ nếu value thay đổi giữa chừng (cleanup)
 * - Nếu hidden = true → hiện '••••', không animate
 */
export function AnimatedNumber({
  value,
  hidden,
  duration = 380,
  formatter = formatVND,
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value)
  const prevRef   = useRef(value)
  const rafRef    = useRef<number | null>(null)
  const mountRef  = useRef(false)

  useEffect(() => {
    // Lần đầu render: không animate, snapshot ngay
    if (!mountRef.current) {
      mountRef.current = true
      prevRef.current  = value
      return
    }

    const from = prevRef.current
    prevRef.current = value
    if (from === value) return

    // Hủy animation đang chạy (nếu có)
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)

    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed  = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic: nhanh → chậm
      const ease     = 1 - Math.pow(1 - progress, 3)
      const current  = Math.round(from + (value - from) * ease)
      setDisplay(current)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [value, duration])

  if (hidden) {
    return <span className={cn('blur-sm select-none', className)}>{HIDDEN}</span>
  }

  return <span className={className}>{formatter(display)}</span>
}
