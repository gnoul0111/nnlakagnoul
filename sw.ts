import { defaultCache }                              from '@serwist/next/worker'
import { Serwist, NetworkFirst, CacheFirst, ExpirationPlugin } from 'serwist'
import type { PrecacheEntry, SerwistGlobalConfig }  from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}
declare const self: ServiceWorkerGlobalScope

// skipWaiting: true → SW mới tự activate, không cần message từ UI

const serwist = new Serwist({
  precacheEntries:  self.__SW_MANIFEST,
  skipWaiting:      true,   // Auto activate SW mới — UI update được handle bởi NetworkFirst
  clientsClaim:     true,
  // navigationPreload: false — QUAN TRONG
  // Neu true: Serwist v9's NetworkFirst KHONG tu tieu thu event.preloadResponse
  // → browser cancel preload request → warning "no-response" tren moi navigation
  // App nay la SPA/PWA: moi route tra ve cung 1 HTML shell, preload khong co ich
  navigationPreload: false,
  runtimeCaching: [
    // Firebase Firestore
    // SW-05 fix: giảm cache từ 24h xuống 5 phút
    // 24h quá dài cho financial data — user xóa expense → đi offline → vẫn thấy data cũ
    // 5 phút là tradeoff hợp lý: offline vẫn hoạt động, data không quá stale
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
    // Navigation fallback — tránh console warning "FetchEvent ... promise rejected"
    // khi mạng fail VÀ cache miss (vd: page mới chưa precache, mạng chập chờn).
    // handlerDidError luôn trả về 1 Response hợp lệ → handler không bao giờ reject.
    {
      matcher: ({ request, url }) =>
        request.mode === 'navigate' && url.origin === self.location.origin,
      handler: new NetworkFirst({
        cacheName:             'app-pages',
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 }),
          {
            handlerDidError: async () => new Response(
              '<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
              '<title>Offline — Chi Tiêu</title></head>' +
              '<body style="margin:0;font-family:system-ui,-apple-system,sans-serif;' +
              'padding:40px 24px;text-align:center;background:#fafafa;color:#0a0a0a">' +
              '<div style="max-width:320px;margin:20vh auto">' +
              '<div style="font-size:64px;margin-bottom:16px">📡</div>' +
              '<h1 style="font-size:20px;margin:0 0 8px">Không có kết nối</h1>' +
              '<p style="font-size:14px;color:#71717a;margin:0 0 24px">' +
              'Kết nối mạng bị gián đoạn. Hãy kiểm tra mạng rồi thử lại.</p>' +
              '<button onclick="location.reload()" style="padding:10px 20px;' +
              'border-radius:10px;border:none;background:#0a0a0a;color:white;' +
              'font-size:14px;font-weight:500;cursor:pointer">Tải lại</button>' +
              '</div></body></html>',
              { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
            ),
          },
        ],
      }),
    },
    // Phần còn lại dùng default Next.js strategy
    ...defaultCache,
  ],
})

serwist.addEventListeners()