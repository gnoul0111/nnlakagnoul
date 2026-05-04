'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore }         from '@/lib/store/authStore'
import { PageSpinner }          from '@/components/ui/spinner'
import { AppShell }             from '@/components/layout/app-shell'
import { QuickAddBar }          from '@/components/dashboard/quick-add-bar'
import { OfflineBanner }        from '@/components/ui/offline-banner'
import { BudgetAlertBanner }    from '@/components/notifications/budget-alert-banner'
import { useNotifications }     from '@/hooks/useNotifications'
import { useSwUpdate }          from '@/hooks/useSwUpdate'
import { SwUpdateOverlay }      from '@/components/ui/sw-update-overlay'

const PAGE_TITLES: Record<string, string> = {
  '/':          'Tổng quan',
  '/finance':   'Tài chính',
  '/analytics': 'Phân tích',
  '/calendar':  'Lịch',
  '/settings':  'Cài đặt',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router        = useRouter()
  const pathname      = usePathname()
  const user          = useAuthStore(s => s.user)
  const isInitialized = useAuthStore(s => s.isInitialized)

  useNotifications()  // FCM / Web Push init
  useSwUpdate()       // SW update detection → badge trên Settings nav

  useEffect(() => {
    if (isInitialized && !user) router.replace('/login')
  }, [user, isInitialized, router])

  if (!isInitialized) return <PageSpinner />
  if (!user) return null

  const title = PAGE_TITLES[pathname] ?? 'Chi Tiêu'

  return (
    <>
      <OfflineBanner />
      <AppShell
        title={title}
        topbarRight={pathname === '/' ? <QuickAddBar /> : undefined}
        banner={<BudgetAlertBanner />}
      >
        {children}
      </AppShell>
      <SwUpdateOverlay />
    </>
  )
}
