import { create } from 'zustand'
import type { UserSettings, CategoryPrefs } from '@/lib/types/settings'
import type { CategoryValue } from '@/lib/types/expense'
import {
  getUserSettings,
  getCategoryPrefs,
  getUserProfile,
  updateUserSettings,
  setCategoryPrefs,
  setMoneyHidden as persistMoneyHidden,
  defaultSettings,
} from '@/lib/services/settingsService'

// ─── localStorage cache keys ──────────────────────────────────────────────────
const SETTINGS_CACHE_KEY  = 'chitieu_settings_cache'
const CAT_PREFS_CACHE_KEY = 'chitieu_cat_prefs_cache'

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch { return null }
}

function writeCache(key: string, data: unknown): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(data)) } catch { /* quota */ }
}

// ─── Store state ──────────────────────────────────────────────────────────────

interface SettingsStoreState {
  settings:     UserSettings | null
  categoryPrefs: CategoryPrefs | null
  profilePhoto:  string | null   // base64 from Firestore users/{uid}.photoURL
  isLoading:    boolean

  loadSettings:        (userId: string) => Promise<void>
  updateSettings:      (userId: string, updates: Partial<UserSettings>) => Promise<void>
  setTheme:            (userId: string, theme: 'light' | 'dark') => Promise<void>
  toggleMoneyHidden:   (userId: string) => Promise<void>
  updateCategoryPrefs: (userId: string, hidden: CategoryValue[]) => Promise<void>
  clearSettings:       () => void
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings:     null,
  categoryPrefs: null,
  profilePhoto:  null,
  isLoading:    false,

  // ── loadSettings — STALE-WHILE-REVALIDATE ────────────────────────────────
  // 1. Đọc localStorage → render ngay (không block UI)
  // 2. Fetch Firestore ở background → update nếu khác
  loadSettings: async (userId: string) => {
    // ── Step 1: Stale render từ localStorage ─────────────────────────────
    const cachedSettings  = readCache<UserSettings>(SETTINGS_CACHE_KEY)
    const cachedCatPrefs  = readCache<CategoryPrefs>(CAT_PREFS_CACHE_KEY)

    if (cachedSettings) {
      // Apply theme ngay từ cache — không chờ Firestore
      applyTheme(cachedSettings.theme)

      // Đọc moneyHidden từ localStorage (source of truth nhanh nhất).
      // Phòng thủ: value có thể là chuỗi "undefined" (do bug ghi cũ) → JSON.parse
      // sẽ nổ "undefined is not valid JSON" làm chết loadSettings → kẹt "Đang tải".
      const localHidden = typeof window !== 'undefined'
        ? localStorage.getItem('chitieu_money_hidden')
        : null
      let moneyHidden = cachedSettings.moneyHidden ?? false
      if (localHidden !== null && localHidden !== 'undefined') {
        try { moneyHidden = JSON.parse(localHidden) as boolean }
        catch { /* value hỏng → giữ giá trị từ cache, dọn lại ở bước sync bên dưới */ }
      }

      // Also load cached photo if available
      const cachedPhoto = typeof window !== 'undefined'
        ? localStorage.getItem('chitieu_profile_photo')
        : null

      set({
        settings:     { ...cachedSettings, moneyHidden },
        categoryPrefs: cachedCatPrefs ?? { userId, hiddenCategories: [] },
        profilePhoto:  cachedPhoto,
        isLoading:    false,  // ← không block UI
      })
    } else {
      // Cold start — phải show loading
      set({ isLoading: true })
    }

    // ── Step 2: Background sync với Firestore ─────────────────────────────
    try {
      const [settings, categoryPrefs, profile] = await Promise.all([
        getUserSettings(userId),
        getCategoryPrefs(userId),
        getUserProfile(userId),
      ])

      // Cache lại cho lần tiếp
      writeCache(SETTINGS_CACHE_KEY,  settings)
      writeCache(CAT_PREFS_CACHE_KEY, categoryPrefs)
      if (profile?.photoURL) {
        try { localStorage.setItem('chitieu_profile_photo', profile.photoURL) } catch {}
      }

      applyTheme(settings.theme)

      // QUAN TRỌNG: Firestore là source of truth cho multi-device sync.
      // Sync localStorage về khớp giá trị Firestore (override local stale).
      // Trước đây logic ưu tiên localStorage → device B không bao giờ thấy
      // thay đổi từ device A vì localStorage của B vẫn là giá trị cũ.
      if (typeof window !== 'undefined') {
        // ?? false: doc Firestore cũ có thể thiếu field moneyHidden → tránh ghi
        // chuỗi "undefined" vào localStorage (gây JSON.parse nổ ở lần load sau).
        localStorage.setItem('chitieu_money_hidden', JSON.stringify(settings.moneyHidden ?? false))
      }

      set({
        settings,
        categoryPrefs,
        profilePhoto: profile?.photoURL ?? null,
        isLoading: false,
      })
    } catch (err) {
      console.error('[SettingsStore] loadSettings error:', err)
      if (!get().settings) {
        set({ settings: defaultSettings(userId), isLoading: false })
      }
    }
  },

  updateSettings: async (userId: string, updates: Partial<UserSettings>) => {
    const prev = get().settings
    const next = prev ? { ...prev, ...updates } : null
    set({ settings: next })
    if (next) writeCache(SETTINGS_CACHE_KEY, next)
    try {
      await updateUserSettings(userId, updates)
    } catch (err) {
      set({ settings: prev })
      if (prev) writeCache(SETTINGS_CACHE_KEY, prev)
      throw err
    }
  },

  setTheme: async (userId: string, theme: 'light' | 'dark') => {
    const prev = get().settings
    applyTheme(theme)
    const next = prev ? { ...prev, theme } : null
    set({ settings: next })
    if (next) writeCache(SETTINGS_CACHE_KEY, next)
    try {
      await updateUserSettings(userId, { theme })
    } catch (err) {
      if (prev) applyTheme(prev.theme)
      set({ settings: prev })
      if (prev) writeCache(SETTINGS_CACHE_KEY, prev)
      throw err
    }
  },

  toggleMoneyHidden: async (userId: string) => {
    const current = get().settings?.moneyHidden ?? false
    const next    = !current
    const nextSettings = get().settings ? { ...get().settings!, moneyHidden: next } : null
    set({ settings: nextSettings })
    await persistMoneyHidden(userId, next)
  },

  updateCategoryPrefs: async (userId: string, hidden: CategoryValue[]) => {
    const next: CategoryPrefs = get().categoryPrefs
      ? { ...get().categoryPrefs!, hiddenCategories: hidden }
      : { userId, hiddenCategories: hidden }
    set({ categoryPrefs: next })
    writeCache(CAT_PREFS_CACHE_KEY, next)
    await setCategoryPrefs(userId, hidden)
  },

  clearSettings: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SETTINGS_CACHE_KEY)
      localStorage.removeItem(CAT_PREFS_CACHE_KEY)
      localStorage.removeItem('chitieu_profile_photo')
    }
    set({ settings: null, categoryPrefs: null, profilePhoto: null })
  },
}))

// ─── DOM helper ───────────────────────────────────────────────────────────────

function applyTheme(theme: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return
  if (theme === 'dark') document.documentElement.classList.add('dark')
  else                  document.documentElement.classList.remove('dark')
}

// ─── Selectors ────────────────────────────────────────────────────────────────

const EMPTY_CATEGORIES: CategoryValue[] = []

export const selectMoneyHidden      = (s: SettingsStoreState) => s.settings?.moneyHidden ?? false
export const selectTheme            = (s: SettingsStoreState) => s.settings?.theme ?? 'light'
export const selectProfilePhoto     = (s: SettingsStoreState) => s.profilePhoto
export const selectHiddenCategories = (s: SettingsStoreState) =>
  s.categoryPrefs?.hiddenCategories ?? EMPTY_CATEGORIES
export const selectCycleModeEnabled = (s: SettingsStoreState) => s.settings?.cycleModeEnabled ?? false
/**
 * Cycle mode CHỈ thực sự active khi salaryDay hợp lệ (> 0) — bẫy đã gặp:
 * `cycleModeEnabled` có thể còn true từ trước dù user đã sửa salaryDay về 0,
 * lúc đó getSalaryCycleRange(anchor, 0) ra range chồng lấn 1 ngày giữa 2 kỳ
 * liên tiếp. Mọi nơi tính toán theo kỳ lương PHẢI dùng selector này, không
 * dùng thẳng selectCycleModeEnabled.
 */
export const selectIsCycleModeActive = (s: SettingsStoreState) =>
  (s.settings?.cycleModeEnabled ?? false) && (s.settings?.salaryDay ?? 0) > 0
export const selectSalaryDay        = (s: SettingsStoreState) => s.settings?.salaryDay ?? 0