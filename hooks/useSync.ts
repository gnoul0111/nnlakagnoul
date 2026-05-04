'use client'

import { useCallback } from 'react'
import { useAuthStore } from '@/lib/store/authStore'
import { useEventStore } from '@/lib/store/eventStore'

/** Sync delta từ Firestore sau khi service đã appendEvent */
export function useSync() {
  const user       = useAuthStore(s => s.user)
  const syncEvents = useEventStore(s => s.syncEvents)
  return useCallback(async () => {
    if (user) await syncEvents(user.uid)
  }, [user, syncEvents])
}
