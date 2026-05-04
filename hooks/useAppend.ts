'use client'

import { useCallback, useState } from 'react'
import { useAuthStore } from '@/lib/store/authStore'
import { useEventStore } from '@/lib/store/eventStore'
import { appendEvent } from '@/lib/services/eventService'
import { enqueueEvent } from '@/lib/offline/offlineQueue'
import { useOnlineStatus } from './useOnlineStatus'
import type { EventDocInput } from '@/lib/types/events'
import { Timestamp } from 'firebase/firestore'

/**
 * Hook để append event vào Firestore.
 * - Online: append thẳng rồi sync store
 * - Offline: enqueue vào localStorage, flush sau
 * - Optimistic update: cập nhật local state ngay lập tức
 * - Rollback: nếu appendEvent throw online → remove optimistic event khỏi cache
 */
export function useAppend() {
  const user = useAuthStore(s => s.user)
  const { appendLocalEvent, removeLocalEvent, syncEvents } = useEventStore()
  const isOnline = useOnlineStatus()
  const [isPending, setIsPending] = useState(false)

  const append = useCallback(
    async (
      eventType: EventDocInput['eventType'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: Record<string, any>,
    ): Promise<'appended' | 'queued'> => {
      if (!user) throw new Error('Chưa đăng nhập.')

      const input: EventDocInput = {
        userId: user.uid,
        eventType,
        data,
        createdAt: new Date().toISOString(),
      }

      // Optimistic update ngay lập tức
      const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      appendLocalEvent({
        id: optimisticId,
        ...input,
        timestamp: Timestamp.now(),
      })

      if (!isOnline) {
        enqueueEvent(input)
        return 'queued'
      }

      setIsPending(true)
      try {
        await appendEvent(input)
        // Sync delta để nhận confirmed id từ Firestore
        await syncEvents(user.uid)
        return 'appended'
      } catch (err) {
        // Rollback optimistic event để UI không hiển thị data chưa commit
        removeLocalEvent(optimisticId)
        throw err
      } finally {
        setIsPending(false)
      }
    },
    [user, isOnline, appendLocalEvent, removeLocalEvent, syncEvents],
  )

  return { append, isPending }
}
