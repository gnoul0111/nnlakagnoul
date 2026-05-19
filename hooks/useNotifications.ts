'use client'

import { useEffect, useRef } from 'react'
import { onMessage }              from 'firebase/messaging'
import { useAuthStore }           from '@/lib/store/authStore'
import { useSettingsStore }       from '@/lib/store/settingsStore'
import { useToastStore }          from '@/lib/store/toastStore'
import { getMessagingInstance }   from '@/lib/firebase/config'
import { initNotifications }      from '@/lib/services/notificationService'

/**
 * Hook khởi tạo push notifications.
 * Gọi 1 lần trong AppLayout — không render gì cả.
 *
 * Làm 2 việc:
 * 1. initNotifications() khi user login và notifEnabled = true
 * 2. Đăng ký foreground message handler → hiện toast
 */
export function useNotifications() {
  const user         = useAuthStore(s => s.user)
  const settings     = useSettingsStore(s => s.settings)
  const msgHandlerSet = useRef(false)

  // ── 1. Token initialization ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !settings?.notifEnabled) return

    initNotifications(user.uid, settings).catch(err =>
      console.warn('[useNotifications] init error:', err),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, settings?.notifEnabled])

  // ── 2. Foreground message handler (chạy 1 lần duy nhất) ──────────────────
  useEffect(() => {
    if (msgHandlerSet.current) return
    msgHandlerSet.current = true

    let unsubscribe: (() => void) | undefined
    let cancelled = false

    getMessagingInstance()
      .then(messaging => {
        if (!messaging || cancelled) return

        unsubscribe = onMessage(messaging, payload => {
          const { title, body } = payload.notification ?? {}
          if (!title) return

          // Hiện toast khi app đang foreground (SW xử lý background)
          const message = body ? `${title}: ${body}` : title
          useToastStore.getState().add({
            type:     'info',
            message,
            duration: 6000,
          })
        })
      })
      .catch(() => {
        // FCM không supported (iOS trước 16.4, trình duyệt cũ) — bỏ qua
      })

    return () => {
      cancelled = true
      unsubscribe?.()
      msgHandlerSet.current = false
    }
  }, [])
}
