'use client'

import { usePathname }           from 'next/navigation'
import { Sidebar }               from './sidebar'
import { BottomNav }             from './bottom-nav'
import { Topbar }                from './topbar'
import { NavigationProgress }    from '@/components/ui/navigation-progress'
import { cn }                    from '@/lib/utils/cn'

interface AppShellProps {
  children:     React.ReactNode
  title?:       string
  topbarRight?: React.ReactNode
  banner?:      React.ReactNode
  noPadding?:   boolean
}

export function AppShell({ children, title, topbarRight, banner, noPadding }: AppShellProps) {
  const pathname = usePathname()

  return (
    <div className="app-shell flex bg-background overflow-hidden">
      <NavigationProgress />
      <Sidebar />

      {/* Cột phải: Topbar + main + BottomNav (mobile).
          BottomNav nằm trong flex flow, không còn position:fixed,
          nên main tự động chiếm đúng không gian còn lại không bị che */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} right={topbarRight} />
        {banner}

        <main className={cn(
          'flex-1 overflow-y-auto overflow-x-hidden min-w-0',
          !noPadding && 'p-3 sm:p-4 lg:p-6',
        )}>
          <div key={pathname} className="h-full">
            {children}
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  )
}