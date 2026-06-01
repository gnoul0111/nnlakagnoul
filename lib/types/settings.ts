import type { Timestamp } from 'firebase/firestore'
import type { CategoryValue } from './expense'
import type { CategoryBudgets } from './budget'

export type Theme = 'light' | 'dark'
export type WeekStartDay = 'monday' | 'sunday'
export type TokenType = 'fcm' | 'webpush'

// ─── User Settings (Firestore: user_settings/{uid}) ──────────────────────────

export interface UserSettings {
  userId: string
  theme: Theme
  weekStartDay: WeekStartDay
  salaryDay: number         // 0 = không set
  moneyHidden: boolean      // Ẩn/hiện số tiền toàn app
  fcmToken?: string | null
  notifEnabled: boolean
  notifTime: string         // HH:mm — giờ nhắc nhập chi tiêu, default "21:00"
  eventReminderTypes: number[] // [1, 6, 24] giờ trước
  tokenType?: TokenType | null
  tokenUpdatedAt?: Timestamp | null
  // Danh sách id các thẻ hiển thị ở Tổng quan (theo thứ tự). Undefined → dùng default catalog.
  dashboardMetrics?: string[]
  // Per-category budgets — key: `cat-budgets-${YYYY-MM}`
  [key: `cat-budgets-${string}`]: CategoryBudgets | unknown
}

// ─── User Profile (Firestore: users/{uid}) ────────────────────────────────────

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL: string | null   // base64 hoặc URL
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

// ─── Category Preferences (Firestore: user_tags/{uid}_cat_prefs) ─────────────

export interface CategoryPrefs {
  userId: string
  hiddenCategories: CategoryValue[] // Các category bị ẩn
}

// ─── Work Calendar Event ──────────────────────────────────────────────────────

export const CALENDAR_EVENT_CATEGORIES = ['work', 'personal', 'health', 'other'] as const
export type CalendarEventCategory = (typeof CALENDAR_EVENT_CATEGORIES)[number]

export interface WorkCalendarEvent {
  id: string
  userId: string
  title: string
  category: CalendarEventCategory
  date: string        // YYYY-MM-DD
  time?: string       // HH:mm (optional)
  note: string
  reminder: boolean
  createdAt: Timestamp
}
