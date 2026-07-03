import { Timestamp } from 'firebase/firestore'
import { COLLECTIONS, getDocument, setDocument, updateDocument } from '@/lib/firebase/firestore'
import type { UserSettings, UserProfile, CategoryPrefs } from '@/lib/types/settings'
import type { CategoryValue } from '@/lib/types/expense'

// ─── Default settings ─────────────────────────────────────────────────────────

export function defaultSettings(userId: string): UserSettings {
  return {
    userId,
    theme: 'dark',
    weekStartDay: 'monday',
    salaryDay: 0,
    cycleModeEnabled: false,
    moneyHidden: false,
    notifEnabled: false,
    groupNotifEnabled: true,
    notifTime: '21:00',
    eventReminderTypes: [1],
    fcmToken: null,
    tokenType: null,
    tokenUpdatedAt: null,
  }
}

// ─── User Settings ────────────────────────────────────────────────────────────

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const snap = await getDocument<UserSettings>(COLLECTIONS.USER_SETTINGS, userId)
  // Merge với default: doc cũ có thể thiếu field (moneyHidden, groupNotifEnabled...)
  // → đảm bảo luôn đủ field, tránh undefined lan xuống UI/localStorage.
  return snap ? { ...defaultSettings(userId), ...snap } : defaultSettings(userId)
}

export async function updateUserSettings(
  userId: string,
  updates: Partial<UserSettings>,
): Promise<void> {
  await setDocument(COLLECTIONS.USER_SETTINGS, userId, { userId, ...updates }, true)
}

/**
 * Toggle hiển thị số tiền trên UI.
 *
 * ⚠️  UX ONLY — không phải tính năng bảo mật.
 * Setting này chỉ ẩn số tiền trên màn hình. Dữ liệu vẫn có trong
 * localStorage/Firestore và có thể đọc được qua DevTools bất kỳ lúc nào.
 * Để bảo vệ dữ liệu thực sự: dùng device lock (PIN / Face ID / Touch ID).
 *
 * Key localStorage bị xóa khi logout (xử lý trong authStore.ts).
 */
export async function setMoneyHidden(userId: string, hidden: boolean): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('chitieu_money_hidden', JSON.stringify(hidden))
  }
  await updateUserSettings(userId, { moneyHidden: hidden })
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  return getDocument<UserProfile>(COLLECTIONS.USERS, userId)
}

export async function upsertUserProfile(
  userId: string,
  data: Partial<UserProfile>,
): Promise<void> {
  await setDocument(
    COLLECTIONS.USERS,
    userId,
    { ...data, userId, updatedAt: Timestamp.now() },
    true,
  )
}

// ─── Category Preferences ─────────────────────────────────────────────────────

function catPrefsDocId(userId: string): string {
  return `${userId}_cat_prefs`
}

export async function getCategoryPrefs(userId: string): Promise<CategoryPrefs> {
  const docId = catPrefsDocId(userId)
  const snap = await getDocument<CategoryPrefs>(COLLECTIONS.USER_TAGS, docId)
  return snap ?? { userId, hiddenCategories: [] }
}

export async function setCategoryPrefs(
  userId: string,
  hiddenCategories: CategoryValue[],
): Promise<void> {
  await setDocument(
    COLLECTIONS.USER_TAGS,
    catPrefsDocId(userId),
    { userId, hiddenCategories },
  )
}

// ─── FCM Token ────────────────────────────────────────────────────────────────
//
// Schema mới (multi-device): user_settings/{userId}/fcm_tokens/{deviceId}
//   ├── token: string              FCM token
//   ├── tokenType: 'fcm' | 'webpush'
//   ├── platform: string           'ios-pwa' / 'android-chrome' / ...
//   ├── userAgent: string
//   ├── createdAt: Timestamp
//   └── lastUsedAt: Timestamp       Update mỗi lần Cloud Function gửi thành công
//
// `deviceId` tự sinh trên client (localStorage['fcm_device_id']) → cùng device
// upsert cùng doc, không ghi đè device khác.

import { doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const FCM_DEVICE_ID_KEY = 'chitieu_fcm_device_id'

/**
 * Lấy (hoặc tạo mới) deviceId cho thiết bị hiện tại.
 * Persist trong localStorage → giữ nguyên qua các session + nhiều lần reload.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr-placeholder'

  let id = localStorage.getItem(FCM_DEVICE_ID_KEY)
  if (!id) {
    // crypto.randomUUID() được hỗ trợ mọi browser modern
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(FCM_DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * Mô tả thiết bị theo UserAgent — dùng để hiển thị trong settings sau này.
 * VD: "iPhone Safari", "Windows Chrome", "Android Chrome"
 */
function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent

  const osMatch = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua)  ? 'Android'
    : /Mac/.test(ua)      ? 'Mac'
    : /Windows/.test(ua)  ? 'Windows'
    : 'Other'

  const browserMatch = /Edg\//.test(ua)  ? 'Edge'
    : /Chrome\//.test(ua)                ? 'Chrome'
    : /Firefox\//.test(ua)               ? 'Firefox'
    : /Safari\//.test(ua)                ? 'Safari'
    : 'Browser'

  return `${osMatch} ${browserMatch}`
}

/**
 * Lưu FCM token cho thiết bị hiện tại.
 *
 * Thay đổi so với version cũ:
 * - Ghi vào subcollection `fcm_tokens/{deviceId}` → KHÔNG ghi đè device khác
 * - Dọn field `fcmToken` legacy trên user_settings để tránh Cloud Function
 *   gửi trùng (đọc cả 2 nơi cùng 1 token)
 * - Bật notifEnabled ở user_settings (schema cũ vẫn giữ flag này ở root)
 */
export async function saveFcmToken(
  userId: string,
  token: string,
  tokenType: 'fcm' | 'webpush',
): Promise<void> {
  const deviceId = getOrCreateDeviceId()
  const now = Timestamp.now()

  // 1. Upsert token vào subcollection — merge để giữ createdAt cũ nếu có
  const tokenRef = doc(db, 'user_settings', userId, 'fcm_tokens', deviceId)
  await setDoc(tokenRef, {
    token,
    tokenType,
    platform:    detectPlatform(),
    userAgent:   typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : '',
    lastUsedAt:  now,
    createdAt:   now, // merge:true nên chỉ set lần đầu
  }, { merge: true })

  // 2. Bật notifEnabled + clear legacy field (tránh double-send qua backward compat path)
  await updateUserSettings(userId, {
    notifEnabled:   true,
    fcmToken:       null,
    tokenType:      null,
    tokenUpdatedAt: null,
  })
}

/**
 * Xoá FCM token của thiết bị hiện tại (gọi khi user logout hoặc tắt notif).
 * Không xoá token của device khác → các device kia vẫn nhận notif.
 */
export async function removeCurrentDeviceToken(userId: string): Promise<void> {
  if (typeof window === 'undefined') return
  const deviceId = localStorage.getItem(FCM_DEVICE_ID_KEY)
  if (!deviceId) return

  try {
    const tokenRef = doc(db, 'user_settings', userId, 'fcm_tokens', deviceId)
    await deleteDoc(tokenRef)
  } catch (err) {
    console.warn('[settingsService] removeCurrentDeviceToken failed:', err)
  }
}

export interface DeviceTokenInfo {
  deviceId:   string
  platform:   string
  userAgent:  string
  createdAt:  Timestamp | null
  lastUsedAt: Timestamp | null
  isCurrent:  boolean
}

/**
 * Lấy danh sách mọi thiết bị đã đăng ký token — cho UI Settings hiển thị.
 * Sort: thiết bị hiện tại lên đầu, sau đó theo lastUsedAt desc.
 */
export async function listDeviceTokens(userId: string): Promise<DeviceTokenInfo[]> {
  const currentDeviceId = typeof window !== 'undefined'
    ? localStorage.getItem(FCM_DEVICE_ID_KEY)
    : null

  const tokensRef = collection(db, 'user_settings', userId, 'fcm_tokens')
  // KHÔNG dùng orderBy trong query — Firestore sẽ loại bỏ docs thiếu field sort.
  // Device vừa đăng ký nhưng CF chưa gửi notif → không có lastUsedAt → bị ẩn.
  // Sort client-side bên dưới (đã handle null).
  const snap = await getDocs(tokensRef)

  const devices: DeviceTokenInfo[] = snap.docs.map(d => {
    const data = d.data()
    return {
      deviceId:   d.id,
      platform:   data.platform ?? 'Unknown',
      userAgent:  data.userAgent ?? '',
      createdAt:  data.createdAt ?? null,
      lastUsedAt: data.lastUsedAt ?? null,
      isCurrent:  d.id === currentDeviceId,
    }
  })

  // Đưa device hiện tại lên đầu
  return devices.sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1
    if (!a.isCurrent && b.isCurrent) return 1
    const aMs = a.lastUsedAt?.toMillis?.() ?? 0
    const bMs = b.lastUsedAt?.toMillis?.() ?? 0
    return bMs - aMs
  })
}

/**
 * Xoá 1 thiết bị cụ thể (từ UI Settings).
 * Nếu xoá device hiện tại thì cũng clear localStorage để lần next init tạo deviceId mới.
 */
export async function deleteDeviceToken(userId: string, deviceId: string): Promise<void> {
  const tokenRef = doc(db, 'user_settings', userId, 'fcm_tokens', deviceId)
  await deleteDoc(tokenRef)

  if (typeof window !== 'undefined') {
    const currentId = localStorage.getItem(FCM_DEVICE_ID_KEY)
    if (currentId === deviceId) {
      localStorage.removeItem(FCM_DEVICE_ID_KEY)
    }
  }
}

/**
 * Xoá các thiết bị "không hoạt động" — dùng cho nút "Dọn thiết bị" trong UI.
 *
 * Điều kiện xoá:
 * - lastUsedAt > 7 ngày trước (device lâu không gửi notif thành công), HOẶC
 * - Không có lastUsedAt (device đăng ký token nhưng CF chưa bao giờ gửi thành công
 *   — thường là zombie từ phiên bản cũ)
 *
 * LUÔN giữ device hiện tại (dù có lastUsedAt hay không) để tránh tự xoá mình.
 *
 * Returns số device đã xoá.
 */
export async function deleteInactiveTokens(userId: string): Promise<number> {
  const currentDeviceId = typeof window !== 'undefined'
    ? localStorage.getItem(FCM_DEVICE_ID_KEY)
    : null

  const tokensRef = collection(db, 'user_settings', userId, 'fcm_tokens')
  const snap = await getDocs(tokensRef)
  if (snap.empty) return 0

  const STALE_MS = 7 * 24 * 60 * 60 * 1000 // 7 ngày
  const now = Date.now()

  const toDelete: string[] = []
  for (const d of snap.docs) {
    if (d.id === currentDeviceId) continue // không xoá device hiện tại

    const data = d.data()
    const ts = data.lastUsedAt
    const lastUsedMs = typeof ts?.toMillis === 'function'
      ? ts.toMillis()
      : ((ts?.seconds ?? 0) * 1000)

    // Xoá nếu: không có lastUsedAt HOẶC quá cũ
    if (!lastUsedMs || now - lastUsedMs >= STALE_MS) {
      toDelete.push(d.id)
    }
  }

  if (toDelete.length === 0) return 0

  await Promise.all(
    toDelete.map(id =>
      deleteDoc(doc(db, 'user_settings', userId, 'fcm_tokens', id)),
    ),
  )

  return toDelete.length
}

// ─── Stale check (giữ để init flow dùng) ──────────────────────────────────────
//
// Lưu ý: field `tokenUpdatedAt` ở user_settings root đã thành legacy.
// Giờ dùng `lastUsedAt` ở subcollection doc → check trực tiếp trên doc đó khi
// initNotifications (chỉ refresh nếu doc không tồn tại hoặc stale).

const FCM_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 ngày (đổi từ 7 → 30 theo FCM best practice)

export function isFcmTokenStale(tokenUpdatedAt: Timestamp | null | undefined): boolean {
  if (!tokenUpdatedAt) return true
  let millis: number
  if (typeof (tokenUpdatedAt as any).toMillis === 'function') {
    millis = (tokenUpdatedAt as any).toMillis()
  } else {
    const t = tokenUpdatedAt as any
    millis = (t.seconds ?? 0) * 1000 + Math.floor((t.nanoseconds ?? 0) / 1_000_000)
  }
  return Date.now() - millis > FCM_TOKEN_MAX_AGE_MS
}