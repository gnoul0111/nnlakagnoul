'use client'

import { useEffect, useRef } from 'react'
import { useAuthStore }  from '@/lib/store/authStore'
import { useEventStore } from '@/lib/store/eventStore'
import { shouldVisibilitySync, SYNC_THROTTLE_MS } from './useVisibilitySync.logic'

/**
 * PHA A — Re-sync delta khi user quay lại app.
 *
 * Lắng nghe `visibilitychange` + `focus`: khi tab trở lại trạng thái hiển thị
 * và đang online → kéo delta từ Firestore (`syncEvents`). Nhờ vậy, khi nhập
 * liệu ở thiết bị A rồi cầm thiết bị B lên, B tự cập nhật mà không cần reload.
 *
 * Không poll định kỳ — chỉ chạy khi user thực sự quay lại app. syncEvents vốn
 * đi qua _syncChain (mutex) nên gọi nhiều lần không gây sai dữ liệu; throttle
 * chỉ để tiết kiệm read.
 */
export function useVisibilitySync(): void {
  const user       = useAuthStore(s => s.user)
  const syncEvents = useEventStore(s => s.syncEvents)
  const lastSyncRef = useRef(0)

  useEffect(() => {
    if (!user) return

    const maybeSync = () => {
      if (typeof document === 'undefined') return

      const now = Date.now()
      const ok = shouldVisibilitySync({
        now,
        lastSyncAt: lastSyncRef.current,
        visibilityState: document.visibilityState,
        online: navigator.onLine,
        throttleMs: SYNC_THROTTLE_MS,
      })
      if (!ok) return

      lastSyncRef.current = now
      syncEvents(user.uid)
    }

    document.addEventListener('visibilitychange', maybeSync)
    window.addEventListener('focus', maybeSync)

    return () => {
      document.removeEventListener('visibilitychange', maybeSync)
      window.removeEventListener('focus', maybeSync)
    }
  }, [user?.uid, syncEvents]) // eslint-disable-line react-hooks/exhaustive-deps
}
