/**
 * notificationService.ts
 * Quản lý FCM token cho mọi platform (Android/Desktop/iOS 16.4+ PWA)
 *
 * Firebase Messaging Web SDK 11+ hỗ trợ iOS 16.4+ khi cài PWA vào home screen.
 * Không cần branch Web Push riêng cho iOS.
 *
 * Flow:
 *   requestPermission() → getFCMToken() → saveFcmToken() → Firestore subcollection
 */

import { getToken } from 'firebase/messaging'
import { getDoc, doc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getMessagingInstance, db, functions } from '@/lib/firebase/config'
import {
  saveFcmToken,
  getOrCreateDeviceId,
} from '@/lib/services/settingsService'
import type { UserSettings } from '@/lib/types/settings'

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!

// ─── Platform detection ───────────────────────────────────────────────────────

export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** Kiểm tra PWA đã được cài vào home screen chưa (iOS cần) */
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  )
}

/** Browser có hỗ trợ push notification không */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// ─── Permission ───────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  return Notification.requestPermission()
}

// ─── FCM token ────────────────────────────────────────────────────────────────

async function getFCMToken(): Promise<string | null> {
  try {
    const messaging = await getMessagingInstance()
    if (!messaging) return null

    // Để Firebase SDK tự register firebase-messaging-sw.js ở default scope
    // (/firebase-cloud-messaging-push-scope). KHÔNG manual register để tránh
    // conflict với Serwist SW trên iOS PWA.
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    })
    return token || null
  } catch (err) {
    console.warn('[Notifications] getFCMToken failed:', err)
    return null
  }
}

// ─── Main init ────────────────────────────────────────────────────────────────

/**
 * Khởi tạo notifications cho user.
 *
 * Luôn gọi getToken() mỗi khi app mở (FCM SDK cache nội bộ → rất rẻ).
 * So sánh với token đang lưu trong Firestore: nếu khác (SW thay đổi sau deploy,
 * hoặc FCM rotate) thì ghi token mới — không cần user tắt/bật thủ công.
 *
 * iOS LƯU Ý: Chỉ hoạt động khi PWA đã được cài vào home screen.
 */
export async function initNotifications(
  userId: string,
  settings: UserSettings,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _forceRefresh = false,
): Promise<boolean> {
  if (!settings.notifEnabled) return false
  if (!isWebPushSupported()) return false

  // iOS: Yêu cầu PWA đã cài đặt
  if (isIOSDevice() && !isPWAInstalled()) {
    console.info('[Notifications] iOS: PWA chưa được cài vào home screen — bỏ qua')
    return false
  }

  // Xin quyền (nếu đã granted thì trả về ngay, không prompt lại)
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') return false

  // Lấy token hiện tại từ FCM SDK (kết quả được cache bởi SDK — không gọi network nếu chưa đổi)
  const token = await getFCMToken()
  if (!token) {
    console.warn('[Notifications] getFCMToken returned null')
    return false
  }

  // So sánh với token đang lưu trong Firestore cho device này.
  // Nếu khác (vd: SW thay đổi sau deploy) → save token mới để CF dùng được.
  const deviceId = getOrCreateDeviceId()
  const tokenRef = doc(db, 'user_settings', userId, 'fcm_tokens', deviceId)
  try {
    const snap = await getDoc(tokenRef)
    const storedToken = snap.exists() ? (snap.data()?.token as string | undefined) : null
    if (storedToken === token) return true  // token chưa đổi → không cần ghi
  } catch {
    // Không đọc được → vẫn save để đảm bảo
  }

  await saveFcmToken(userId, token, 'fcm')
  return true
}

// ─── Test notification qua Cloud Function ────────────────────────────────────
//
// Gọi Cloud Function `sendTestNotification` — nó sẽ gửi FCM tới TẤT CẢ device
// của user. Test này covers: token lưu đúng, pipeline FCM, Service Worker nhận
// và show banner, click → navigate về app.

// SW-02 Fix: rate limiting ở client — 60 giây cooldown giữa 2 lần gửi test
// Ngăn user (hoặc script) spam Cloud Function calls → tốn FCM quota + Firebase bill
const TEST_NOTIF_COOLDOWN_MS = 60_000
let _lastTestNotifAt = 0

export async function sendTestNotificationViaServer(): Promise<{ deviceCount: number }> {
  const now = Date.now()
  const elapsed = now - _lastTestNotifAt

  if (_lastTestNotifAt > 0 && elapsed < TEST_NOTIF_COOLDOWN_MS) {
    const remaining = Math.ceil((TEST_NOTIF_COOLDOWN_MS - elapsed) / 1000)
    throw new Error(`Vui lòng chờ ${remaining} giây trước khi gửi lại.`)
  }

  _lastTestNotifAt = now

  const callable = httpsCallable<unknown, { ok: boolean; deviceCount: number }>(
    functions,
    'sendTestNotification',
  )
  const result = await callable()
  return { deviceCount: result.data.deviceCount }
}