import { create } from 'zustand'
import type { User } from 'firebase/auth'
import { onAuthChange, logout as firebaseLogout } from '@/lib/firebase/auth'
import { useEventStore } from './eventStore'
import { useCalendarStore } from './calendarStore'
import { budgetCache } from '@/lib/cache/budgetCache'
import { removeCurrentDeviceToken } from '@/lib/services/settingsService'

// ─── Session cookie helpers ───────────────────────────────────────────────────
//
// FIX S-04 + S-XSS: cookie được set server-side với HttpOnly flag.
// Client gọi API route /api/auth/session để set/clear — server verify ID token trước.
// HttpOnly ngăn JavaScript đọc cookie → XSS không steal được session.

async function setSessionCookie(user: import('firebase/auth').User): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const token = await user.getIdToken()
    await fetch('/api/auth/session', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (err) {
    console.warn('[authStore] setSessionCookie failed:', err)
  }
}

async function clearSessionCookie(): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await fetch('/api/auth/session', { method: 'DELETE' })
  } catch (err) {
    console.warn('[authStore] clearSessionCookie failed:', err)
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AuthStoreState {
  user: User | null
  isLoading: boolean
  isInitialized: boolean

  initialize: () => () => void
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  user: null,
  isLoading: true,
  isInitialized: false,

  /**
   * Gọi 1 lần duy nhất khi app mount.
   * Returns unsubscribe function để cleanup.
   */
  initialize: () => {
    const unsubscribe = onAuthChange(async (user) => {
      if (user) {
        // Await để đảm bảo cookie đã được set trước khi redirect xảy ra
        // Nếu không await, middleware thấy không có cookie và redirect về login (race condition)
        await setSessionCookie(user)
      } else {
        await clearSessionCookie()
      }
      set({ user, isLoading: false, isInitialized: true })
    })
    return unsubscribe
  },

  /**
   * Logout: sign out Firebase + clear tất cả cache để tránh data leak + memory leak.
   * Quan trọng: clear đầy đủ mọi module-level cache để khi user khác login không
   * thấy dữ liệu của user cũ.
   */
  logout: async () => {
    const { user } = get()

    // TRƯỚC khi signOut: xoá FCM token của device hiện tại khỏi Firestore.
    // Lý do: sau signOut, Firestore rules sẽ không cho ghi nữa (chưa auth).
    if (user) {
      try {
        await removeCurrentDeviceToken(user.uid)
      } catch (err) {
        console.warn('[authStore] removeCurrentDeviceToken failed:', err)
      }
      useEventStore.getState().clearAllCache(user.uid)
    }

    budgetCache.clear()
    useCalendarStore.getState().clearCache()

    if (typeof window !== 'undefined') {
      localStorage.removeItem('chitieu_money_hidden')
      localStorage.removeItem('chitieu_profile_photo')
      localStorage.removeItem('offline-event-queue')
      // KHÔNG xoá chitieu_fcm_device_id — giữ để lần login sau cùng device
      // sử dụng cùng deviceId (không tạo doc subcollection mới lãng phí)
      try { sessionStorage.removeItem('sw-just-updated-ts') } catch { /* no-op */ }
    }

    // SW-05 fix: xóa Firestore cache trong Service Worker khi logout
    // Đảm bảo user tiếp theo không thấy financial data của user cũ từ SW cache
    if (typeof window !== 'undefined' && 'caches' in window) {
      try {
        const cacheKeys = await caches.keys()
        await Promise.all(
          cacheKeys
            .filter(k => k.includes('firebase-firestore'))
            .map(k => caches.delete(k))
        )
      } catch (err) {
        console.warn('[authStore] Failed to clear SW cache:', err)
      }
    }

    await clearSessionCookie()
    await firebaseLogout()
    set({ user: null })
  },
}))

// ─── Selector helpers ─────────────────────────────────────────────────────────

export const selectUser = (state: AuthStoreState) => state.user
export const selectIsAuthenticated = (state: AuthStoreState) => state.user !== null
export const selectIsAuthLoading = (state: AuthStoreState) => state.isLoading