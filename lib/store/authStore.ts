import { create } from 'zustand'
import type { User } from 'firebase/auth'
import { onAuthChange, logout as firebaseLogout } from '@/lib/firebase/auth'
import { useEventStore } from './eventStore'
import { useCalendarStore } from './calendarStore'
import { budgetCache } from '@/lib/cache/budgetCache'
import { removeCurrentDeviceToken } from '@/lib/services/settingsService'

// ─── Session cookie helpers ───────────────────────────────────────────────────
//
// Cookie này là "hint" cho middleware server-side, KHÔNG phải cơ chế bảo mật.
// Bảo mật thực sự do Firebase Auth SDK + Firestore Rules + verifyIdToken() trên API routes.
// Dùng client-side cookie để tránh race condition với redirect của auth layout.

import { SESSION_COOKIE } from '@/middleware'

function setSessionCookie(): void {
  if (typeof document === 'undefined') return
  const isSecure = location.protocol === 'https:'
  document.cookie = `${SESSION_COOKIE}=1; path=/; SameSite=Strict${isSecure ? '; Secure' : ''}`
}

function clearSessionCookie(): void {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict`
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
    const unsubscribe = onAuthChange(user => {
      if (user) {
        setSessionCookie()
      } else {
        clearSessionCookie()
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

    clearSessionCookie()
    await firebaseLogout()
    set({ user: null })
  },
}))

// ─── Selector helpers ─────────────────────────────────────────────────────────

export const selectUser = (state: AuthStoreState) => state.user
export const selectIsAuthenticated = (state: AuthStoreState) => state.user !== null
export const selectIsAuthLoading = (state: AuthStoreState) => state.isLoading