'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/authStore'
import { PageSpinner } from '@/components/ui/spinner'

/**
 * Layout cho (auth) group.
 * Nếu đã đăng nhập rồi → redirect về dashboard.
 */
export default function AuthGroupLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const user = useAuthStore(s => s.user)
  const isInitialized = useAuthStore(s => s.isInitialized)

  useEffect(() => {
    if (isInitialized && user) {
      const params = new URLSearchParams(window.location.search)
      const redirect = params.get('redirect')
      const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//')
      router.replace(safeRedirect ? redirect : '/')
    }
  }, [user, isInitialized, router])

  // Chờ auth state resolve
  if (!isInitialized) return <PageSpinner />

  // Đã login → không render children (sẽ redirect)
  if (user) return null

  return <>{children}</>
}
