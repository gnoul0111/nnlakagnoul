'use client'

import { useCallback, useState } from 'react'
import { useAuthStore }   from '@/lib/store/authStore'
import { useEventStore }  from '@/lib/store/eventStore'
import { appendEvent }    from '@/lib/services/eventService'
import { enqueueEvent }   from '@/lib/offline/offlineQueue'
import { useOnlineStatus } from './useOnlineStatus'
import type { EventDocInput } from '@/lib/types/events'
import { Timestamp } from 'firebase/firestore'

/**
 * Hook để append event vào Firestore.
 * - Online:  append thẳng rồi sync store
 * - Offline: enqueue vào localStorage, flush sau
 * - Optimistic update: cập nhật local state ngay lập tức
 * - Rollback: nếu appendEvent throw online → remove optimistic event khỏi cache
 *
 * FIX CONC-01: clientTimestamp được set NGAY TẠI ĐÂY, trước mọi network call.
 *
 * Vấn đề gốc:
 *   appendEvent() gọi Timestamp.now() bên trong → server timestamp phụ thuộc
 *   vào thời điểm Firestore nhận request, không phải thời điểm user thao tác.
 *   Với 2 device có network latency khác nhau:
 *     Device A acts T=10:00:01, slow network → Firestore ghi T=10:00:01.900
 *     Device B acts T=10:00:02, fast network → Firestore ghi T=10:00:02.100
 *   → Server order: A < B → B wins (correct ở trường hợp này)
 *   Nhưng nếu:
 *     Device A acts T=10:00:02 (LATER), slow → Firestore T=10:00:02.900
 *     Device B acts T=10:00:01 (EARLIER), fast → Firestore T=10:00:01.100
 *   → Server order: B(1.1) < A(2.9) → A wins (correct)... chỉ do may mắn
 *   Nếu B fast hơn nữa: B → T=10:00:01.050, A → T=10:00:01.500
 *   → Server order: B < A → A wins, nhưng B's action was LATER → SAI!
 *
 * Fix: clientTimestamp = new Date().toISOString() set tại useAppend(),
 * không bao giờ bị overwrite bởi server. replay() dùng clientTimestamp
 * làm primary sort key → LWW dựa trên INTENT time, không phải delivery time.
 */
export function useAppend() {
  const user = useAuthStore(s => s.user)
  const { appendLocalEvent, removeLocalEvent, syncEvents } = useEventStore()
  const isOnline = useOnlineStatus()
  const [isPending, setIsPending] = useState(false)

  /**
   * appendOptimistic — local-only, không write Firestore.
   *
   * FIX PERF-03: Dùng cho Goals/Savings/Debts write path.
   * Thay vì chờ service → Firestore → sync() → replay() mới thấy kết quả,
   * component gọi appendOptimistic() trước để cập nhật UI ngay lập tức.
   * Service call vẫn chạy bình thường sau đó.
   *
   * Cơ chế rollback:
   *   - Online: nếu Firestore write thành lỗi → gọi rollback() để removeLocalEvent
   *   - sync() sau đó sẽ fetch confirmed event → pruneReplacedOptimistic() tự
   *     xóa optimistic event (match bằng domain signature dựa trên data.id)
   *
   * Cơ chế consistency:
   *   - Caller phải dùng CÙNG ID trong optimistic event và trong service call.
   *     Ví dụ: pre-generate goalId = newGoalId(), truyền vào cả
   *     appendOptimistic({ id: goalId, ... }) và addGoal({ id: goalId, ... }).
   *   - pruneReplacedOptimistic match bằng domain signature GOAL_ADDED:${goalId}
   *     → optimistic bị prune khi confirmed event arrive, tránh duplicate.
   *
   * @returns { rollback } — gọi rollback() để hoàn tác nếu service call fail
   */
  const appendOptimistic = useCallback(
    (
      eventType: EventDocInput['eventType'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: Record<string, any>,
    ): { rollback: () => void } => {
      if (!user) return { rollback: () => {} }

      const clientTimestamp = new Date().toISOString()
      const optimisticId    = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      appendLocalEvent({
        id:               optimisticId,
        userId:           user.uid,
        eventType,
        data,
        clientTimestamp,
        createdAt:        clientTimestamp,
        timestamp:        Timestamp.now(),
      })

      return { rollback: () => removeLocalEvent(optimisticId) }
    },
    [user, appendLocalEvent, removeLocalEvent],
  )

  const append = useCallback(
    async (
      eventType: EventDocInput['eventType'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: Record<string, any>,
    ): Promise<'appended' | 'queued'> => {
      if (!user) throw new Error('Chưa đăng nhập.')

      // FIX CONC-01: capture client time BEFORE any async operation.
      // This is the authoritative "user intent" timestamp used for LWW.
      const clientTimestamp = new Date().toISOString()

      const input: EventDocInput = {
        userId:   user.uid,
        eventType,
        data,
        clientTimestamp,           // ← NEW: intent timestamp
        createdAt: clientTimestamp, // reuse same value — they're the same at this point
      }

      // Optimistic update ngay lập tức
      const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      appendLocalEvent({
        id: optimisticId,
        ...input,
        timestamp: Timestamp.now(),
      })

      if (!isOnline) {
        enqueueEvent(input) // clientTimestamp đi kèm vào queue → preserved on flush
        return 'queued'
      }

      setIsPending(true)
      try {
        await appendEvent(input)
        await syncEvents(user.uid)
        return 'appended'
      } catch (err) {
        removeLocalEvent(optimisticId)
        throw err
      } finally {
        setIsPending(false)
      }
    },
    [user, isOnline, appendLocalEvent, removeLocalEvent, syncEvents],
  )

  return { append, appendOptimistic, isPending }
}