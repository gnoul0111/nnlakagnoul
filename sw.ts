import { defaultCache }                              from '@serwist/next/worker'
import { Serwist, NetworkFirst, CacheFirst, ExpirationPlugin } from 'serwist'
import type { PrecacheEntry, SerwistGlobalConfig }  from 'serwist'

// FIX AUTH-HANG: Service worker KHÔNG được đụng vào request đăng nhập của Firebase.
// Phải BỎ QUA HOÀN TOÀN: stopImmediatePropagation() → browser fetch native.
const AUTH_PASSTHROUGH = /^https:\/\/(apis\.google\.com|accounts\.google\.com|www\.google\.com|[^/]+\.firebaseapp\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)\//i

// FIX REALTIME: kênh streaming dài của Firestore dùng WebChannel tại .../channel.
// CHỈ nhắm /channel streaming — getDocs một-phát vẫn qua NetworkFirst (giữ cache offline).
const FIRESTORE_STREAM_PASSTHROUGH = /^https:\/\/firestore\.googleapis\.com\/.*\/(Listen|Write)\/channel/i

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  // KHÔNG thêm /offline.html thủ công — file này nằm trong public/ nên
  // Serwist tự đưa vào __SW_MANIFEST với revision hash. Thêm tay = duplicate entry → SW crash.
  precacheEntries:   self.__SW_MANIFEST,
  skipWaiting:       true,
  clientsClaim:      true,
  navigationPreload: false,
  runtimeCaching: [
    // Firebase Firestore
    {
      matcher: /^https:\/\/firestore\.googleapis\.com\/.*/i,
      handler: new NetworkFirst({
        cacheName:             'firebase-firestore',
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 }),
        ],
      }),
    },
    // Firebase Realtime DB
    {
      matcher: /^https:\/\/.*\.firebaseio\.com\/.*/i,
      handler: new NetworkFirst({
        cacheName:             'firebase-db',
        networkTimeoutSeconds: 10,
      }),
    },
    // Google Fonts
    {
      matcher: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: new CacheFirst({
        cacheName: 'google-fonts',
        plugins: [
          new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }),
        ],
      }),
    },
    // Phần còn lại dùng default Next.js strategy
    ...defaultCache,
  ],
})

// PHẢI đăng ký TRƯỚC serwist.addEventListeners() để stopImmediatePropagation() có tác dụng.
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)

  // Auth + Firestore streaming + /__/ path: bỏ qua hoàn toàn → browser fetch native.
  if (
    AUTH_PASSTHROUGH.test(event.request.url) ||
    FIRESTORE_STREAM_PASSTHROUGH.test(event.request.url) ||
    url.pathname.startsWith('/__/')
  ) {
    event.stopImmediatePropagation()
    return
  }

  // FIX SW-NAV-NO-RESPONSE: Xử lý navigation trước Serwist với respondWith() luôn resolve.
  //
  // Root cause: Serwist precache + runtimeCaching đua với SW activation (skipWaiting +
  // clientsClaim) → throw "no-response" trước khi handlerDidError kịp return fallback.
  // Chrome DevTools log promise rejection ngay lập tức — trước khi unhandledrejection
  // event có thể suppress → event.preventDefault() không ẩn được khỏi console.
  //
  // Fix thật sự: intercept navigation ở đây với stopImmediatePropagation + respondWith
  // bằng promise luôn resolve (không bao giờ reject) → Serwist không thấy request này.
  if (
    event.request.mode === 'navigate' &&
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/_next/') &&
    !url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/icons/') &&
    url.pathname !== '/manifest.json' &&
    url.pathname !== '/sw.js' &&
    url.pathname !== '/firebase-messaging-sw.js'
  ) {
    event.stopImmediatePropagation()
    event.respondWith(
      fetch(event.request)
        .then(res => {
          // Cache lại để dùng offline (fire-and-forget)
          if (res.ok) {
            caches.open('app-navigation')
              .then(cache => cache.put(event.request, res.clone()))
              .catch(() => { /* quota exceeded hoặc incognito */ })
          }
          return res
        })
        .catch(async () => {
          // Offline: thử cache navigation trước
          const cached = await caches.match(event.request, { ignoreSearch: true })
          if (cached) return cached
          // Thử offline.html từ serwist precache
          try {
            const precache = await caches.open('serwist-precache-v2')
            const offline  = await precache.match('/offline.html', { ignoreSearch: true })
            if (offline) return offline
          } catch { /* storage unavailable (incognito, quota exceeded) */ }
          // Luôn trả về response hợp lệ — không bao giờ reject
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head><body><p>Không có kết nối mạng. Vui lòng thử lại.</p></body></html>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          )
        })
    )
    return
  }
})

serwist.addEventListeners()