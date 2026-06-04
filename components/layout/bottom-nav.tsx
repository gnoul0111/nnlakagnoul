'use client'

import { usePathname, useRouter } from 'next/navigation'
import { NAV_ITEMS, isNavItemActive } from './nav-items'
import { useNavStore }      from '@/lib/store/navStore'
import { cn }               from '@/lib/utils/cn'

export function BottomNav() {
  const pathname    = usePathname()
  const router      = useRouter()
  const pendingHref = useNavStore(s => s.pendingHref)
  const setPending  = useNavStore(s => s.setPending)

  const handleNavClick = (href: string) => {
    if (isNavItemActive(href, pathname)) return
    setPending(href)
    router.push(href)
  }

  return (
    <nav className="lg:hidden shrink-0 bg-card border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-stretch h-12">
        {NAV_ITEMS.map(item => {
          const isActive      = isNavItemActive(item.href, pathname)
          const isPending     = pendingHref === item.href
          const isHighlighted = isActive || isPending
          const Icon          = item.icon

          return (
            <button
              key={item.href}
              onClick={() => handleNavClick(item.href)}
              className={cn(
                'flex-1 flex flex-col items-center justify-end pb-2 gap-1 text-[11px] font-medium',
                'transition-colors active:scale-95 min-h-[44px]',
                isHighlighted
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className="relative">
                <Icon className={cn(
                  'w-6 h-6 transition-transform duration-150',
                  isActive  && 'scale-110',
                  isPending && !isActive && 'animate-pulse scale-110',
                )} />
              </span>
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}