'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useNavStore, type NavStore } from '@/lib/store/navStore'

export function NavigationProgress() {
  const pathname    = usePathname()
  const pendingHref = useNavStore((s: NavStore) => s.pendingHref)
  const setPending  = useNavStore((s: NavStore) => s.setPending)

  const [width,   setWidth]   = useState(0)
  const [visible, setVisible] = useState(false)
  const prevPathname  = useRef(pathname)
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Bắt đầu khi có pending navigation
  useEffect(() => {
    if (!pendingHref) return

    if (completeTimer.current) clearTimeout(completeTimer.current)
    if (hideTimer.current)     clearTimeout(hideTimer.current)

    setVisible(true)
    setWidth(0)

    const t1 = setTimeout(() => setWidth(30),  30)
    const t2 = setTimeout(() => setWidth(60), 200)
    const t3 = setTimeout(() => setWidth(80), 500)
    const t4 = setTimeout(() => setWidth(90), 1200)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [pendingHref])

  // Hoàn thành khi pathname thay đổi
  useEffect(() => {
    if (prevPathname.current === pathname) return
    prevPathname.current = pathname

    setWidth(100)
    setPending(null)

    completeTimer.current = setTimeout(() => {
      setVisible(false)
      hideTimer.current = setTimeout(() => setWidth(0), 200)
    }, 250)

    return () => {
      if (completeTimer.current) clearTimeout(completeTimer.current)
      if (hideTimer.current)     clearTimeout(hideTimer.current)
    }
  }, [pathname, setPending])

  if (!visible && width === 0) return null

  return (
    <div aria-hidden className="fixed top-0 left-0 right-0 z-[200] pointer-events-none">
      <div
        className="h-[2px] bg-primary origin-left"
        style={{
          width:      `${width}%`,
          opacity:    visible ? 1 : 0,
          transition: visible
            ? 'width 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease'
            : 'opacity 0.2s ease',
        }}
      />
    </div>
  )
}