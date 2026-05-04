import { create } from 'zustand'
import { getCalendarEventsByUser } from '@/lib/services/calendarService'
import type { WorkCalendarEvent } from '@/lib/types/settings'

interface CalendarStoreState {
  events:   WorkCalendarEvent[]
  loading:  boolean
  loadedFor: string | null  // userId đã load — tránh fetch lại khi chưa đổi user
  error:    string | null

  load:       (userId: string) => Promise<void>
  refresh:    (userId: string) => Promise<void>
  clearCache: () => void
}

/**
 * Shared store cho work calendar events.
 * 
 * Tránh anti-pattern: mỗi component gọi useCalendarEvents() = 1 fetch riêng.
 * Nay gọi `load` nếu chưa loaded, còn lại đọc thẳng từ state.
 * 
 * Gọi `refresh` sau mỗi lần add/update/delete event để invalidate + reload.
 */
export const useCalendarStore = create<CalendarStoreState>((set, get) => ({
  events:    [],
  loading:   false,
  loadedFor: null,
  error:     null,

  /** Fetch 1 lần duy nhất cho user. Gọi nhiều lần cho cùng user không fetch lại. */
  load: async (userId: string) => {
    if (get().loadedFor === userId) return // đã có cache
    set({ loading: true, error: null })
    try {
      const data = await getCalendarEventsByUser(userId)
      set({
        events:    sortEvents(data),
        loading:   false,
        loadedFor: userId,
      })
    } catch (err) {
      console.error('[calendarStore] load failed:', err)
      set({ loading: false, error: 'Không tải được lịch sự kiện' })
    }
  },

  /** Force reload — gọi sau add/update/delete */
  refresh: async (userId: string) => {
    set({ loading: true, error: null })
    try {
      const data = await getCalendarEventsByUser(userId)
      set({
        events:    sortEvents(data),
        loading:   false,
        loadedFor: userId,
      })
    } catch (err) {
      console.error('[calendarStore] refresh failed:', err)
      set({ loading: false, error: 'Không tải lại được lịch' })
    }
  },

  /** Logout hoặc clearAllCache → reset */
  clearCache: () => set({ events: [], loadedFor: null, error: null }),
}))

// Ngày tăng dần, rồi giờ tăng dần; event không có giờ đứng cuối trong ngày
function sortEvents(events: WorkCalendarEvent[]): WorkCalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.time && b.time)  return a.time < b.time ? -1 : 1
    if (a.time) return -1
    if (b.time) return 1
    return 0
  })
}
