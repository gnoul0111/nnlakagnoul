'use client'

import { useEffect } from 'react'
import { useAuthStore }     from '@/lib/store/authStore'
import { useEventStore }    from '@/lib/store/eventStore'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { useVisibilitySync } from '@/hooks/useVisibilitySync'
import { setupOfflineQueueListener } from '@/lib/offline/offlineQueue'
import { ToastContainer }   from '@/components/ui/toast'
import { getBudget }        from '@/lib/services/budgetService'
import { budgetCache, budgetCacheKey } from '@/lib/cache/budgetCache'
import { thisMonth }        from '@/lib/utils/date'

export function Providers({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore(s => s.initialize)
  const loadEvents     = useEventStore(s => s.loadEvents)
  const syncEvents     = useEventStore(s => s.syncEvents)
  const loadSettings   = useSettingsStore(s => s.loadSettings)
  const user           = useAuthStore(s => s.user)

  // PHA A: re-sync delta khi user quay lại app (focus/visibility, không poll)
  useVisibilitySync()

  // Khởi tạo auth + offline queue listener 1 lần
  useEffect(() => {
    const unsubscribe = initializeAuth()
    setupOfflineQueueListener()
    return unsubscribe
  }, [initializeAuth])

  // Load tất cả data song song khi user login
  useEffect(() => {
    if (!user) return

    // Chạy song song — không await từng cái
    loadSettings(user.uid)   // settings: stale-while-revalidate từ localStorage
    loadEvents(user.uid)     // events: stale-while-revalidate từ localStorage

    // Preload budget tháng hiện tại vào cache
    // → khi Dashboard/Analytics mount, useBudget thấy cache ngay → không loading
    const month = thisMonth()
    const key   = budgetCacheKey(user.uid, month)
    if (!budgetCache.has(key)) {
      getBudget(user.uid, month)
        .then(b => budgetCache.set(key, b))
        .catch(err => console.warn('[Providers] budget preload failed:', err))
    }

  }, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Offline queue flush → sync events
  useEffect(() => {
    if (!user) return
    const handler = () => syncEvents(user.uid)
    window.addEventListener('offlinequeue:flushed', handler)
    return () => window.removeEventListener('offlinequeue:flushed', handler)
  }, [user?.uid]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {children}
      <ToastContainer />
    </>
  )
}