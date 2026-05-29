import { defaultCache }                              from '@serwist/next/worker'
import { Serwist, NetworkFirst, CacheFirst, ExpirationPlugin } from 'serwist'
import type { PrecacheEntry, SerwistGlobalConfig }  from 'serwist'

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
    // FIX SW-NAVFAIL: Navigation handler cho SPA routes (/finance, /analytics, v.v.)
    //
    // Vấn đề gốc: Serwist v9 kiểm tra precache manifest trước runtimeCaching.
    // /finance không có trong __SW_MANIFEST → không match precache → Serwist
    // reject FetchEvent → lỗi "no-response" trên console.
    //
    // Fix: Đăng ký NavigationRoute tường minh với NetworkFirst.
    // - Online: fetch từ network (luôn ra HTML shell mới nhất từ Vercel)
    // - Offline + cache hit: serve từ app-pages cache
    // - Offline + cache miss: PrecacheFallbackPlugin serve /offline.html
    //   (đã được precache qua fallbacks.entries ở trên)
    //
    // navigateFallbackAllowlist: loại trừ _next/, api/, static assets
    // để không intercept những request không phải app route.
    {
      matcher: ({ request, url }: { request: Request; url: URL }) =>
        request.mode === 'navigate' &&
        url.origin === self.location.origin &&
        !url.pathname.startsWith('/_next/') &&
        !url.pathname.startsWith('/api/') &&
        !url.pathname.startsWith('/icons/') &&
        url.pathname !== '/manifest.json' &&
        url.pathname !== '/sw.js' &&
        url.pathname !== '/firebase-messaging-sw.js',
      handler: new NetworkFirst({
        cacheName:             'app-navigation',
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }),
          {
            handlerDidError: async () => {
              try {
                const cache = await caches.open('serwist-precache-v2')
                const resp  = await cache.match('/offline.html', { ignoreSearch: true })
                if (resp) return resp
              } catch { /* storage unavailable (incognito, quota exceeded) */ }
              // Luôn trả về response hợp lệ — không bao giờ throw
              // Tránh "no-response: no-response" uncaught promise trong console
              return new Response(
                '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Offline</title></head><body><p>Không có kết nối mạng. Vui lòng thử lại.</p></body></html>',
                { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
              )
            },
          },
        ],
      }),
    },
    // Phần còn lại dùng default Next.js strategy
    ...defaultCache,
  ],
})

serwist.addEventListeners()