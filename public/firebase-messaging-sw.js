// Firebase Messaging Service Worker
// File này KHÔNG được cache bởi next-pwa service worker
// (exclude trong next.config.ts)

importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.1.0/firebase-messaging-compat.js')

// ─── SW-01: API key hardcode — tại sao không tránh được và tại sao vẫn an toàn ──
//
// Service Worker chạy ở browser context → KHÔNG đọc được process.env.
// Web Push API yêu cầu config phải có mặt trong SW file → không thể ẩn.
// Đây là known limitation của toàn bộ Web Push ecosystem, không riêng Firebase.
//
// KEY NÀY AN TOÀN vì đã có 3 lớp bảo vệ khiến key bị lấy cũng VÔ DỤNG:
//
//   Lớp 1 — Domain Restriction (Google Cloud Console):
//     Key bị restrict chỉ hoạt động từ domain của app.
//     Attacker copy key → gọi từ domain khác → 403 ngay lập tức.
//     → Setup: GCP Console → APIs & Services → Credentials → Browser key
//              → Application restrictions → Websites → thêm domain
//
//   Lớp 2 — Firestore Rules (đã deploy):
//     Mọi read/write đều require request.auth != null + userId == auth.uid.
//     Key + projectId không đủ để đọc dữ liệu — phải có Firebase Auth token hợp lệ.
//     Attacker có key → vẫn không đọc được Firestore của user khác.
//
//   Lớp 3 — Firebase App Check (đã setup):
//     Mọi request phải kèm App Check token từ reCAPTCHA.
//     Script/Postman/curl không có browser context → không lấy được token.
//     Sau khi bật Enforce: request không có App Check token → 403.
//
// Kết luận: key bị lộ + không có 3 lớp trên = NGUY HIỂM.
//           key bị lộ + có đủ 3 lớp trên  = acceptable risk, industry standard.

firebase.initializeApp({
  apiKey:            "AIzaSyDw7Yd9VGf3eg43IhUqZ5e26nCUApuohaE",
  authDomain:        "nnlakagnoul.firebaseapp.com",
  projectId:         "nnlakagnoul",
  storageBucket:     "nnlakagnoul.firebasestorage.app",
  messagingSenderId: "1077672402704",
  appId:             "1:1077672402704:web:935bc7c9415eb1d77b4f95",
})

// Khởi tạo messaging để Firebase SDK hoạt động (nhận token, sync, etc.)
// QUAN TRỌNG: KHÔNG đăng ký `onBackgroundMessage` handler.
// Vì payload từ Cloud Function có `webpush.notification` → browser TỰ ĐỘNG show notification.
// Nếu dùng onBackgroundMessage + showNotification → notification hiện 2 lần (browser + SW).
firebase.messaging()

// ─── SW-03 Fix: URL sanitizer — chặn URL injection từ FCM payload ────────────
//
// Vấn đề: FCM payload có thể chứa URL tùy ý trong data.url hoặc click_action.
// Nếu không validate → attacker (có Firebase server key) inject external URL,
// mở phishing site khi user click notification.
//
// Fix: chỉ cho phép same-origin URL.
// External URL → redirect về '/'.
// javascript: URL → redirect về '/'.
// Malformed URL → redirect về '/'.

function sanitizeNotificationUrl(raw) {
  if (!raw || typeof raw !== 'string') return '/'

  try {
    const parsed = new URL(raw, self.location.origin)

    // Chặn mọi protocol không phải http/https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.warn('[SW] Blocked non-http URL from notification:', raw)
      return '/'
    }

    // Chặn external domain
    if (parsed.origin !== self.location.origin) {
      console.warn('[SW] Blocked external URL from notification:', raw)
      return '/'
    }

    // Trả về path + query + hash (không có origin để tránh redirect ngoài)
    return parsed.pathname + parsed.search + parsed.hash
  } catch {
    // URL malformed
    return '/'
  }
}

// ─── Notification click handler ───────────────────────────────────────────────

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const data   = event.notification.data ?? {}
  const rawUrl = data.url ?? data.FCM_MSG?.notification?.click_action ?? '/'

  // SW-03 fix: validate URL trước khi navigate/openWindow
  const url = sanitizeNotificationUrl(rawUrl)

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Focus tab đang mở nếu có
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        // Mở tab mới nếu chưa có
        if (clients.openWindow) {
          return clients.openWindow(url)
        }
      }),
  )
})