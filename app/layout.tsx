import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title:       'Chi Tiêu',
  description: 'Ứng dụng quản lý chi tiêu cá nhân',
  manifest:    '/manifest.json',
  icons:       { icon: '/icons/favicon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Chi Tiêu' },
  // Next chỉ emit `mobile-web-app-capable` (kiểu mới). iOS cần meta apple-prefix
  // tường minh để cho viewport fullscreen edge-to-edge (debug: innerHeight 768 <
  // screen 812 = chưa fullscreen). Thêm thủ công:
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  // Array theme-color: iOS doc static <meta> luc "Add to Home Screen",
  // khong doc tag duoc tao bang JS. Dung media query de khop ca 2 mode.
  // light=bg-card #ffffff, dark=bg-card #1c1c1c — khop mau nav → home-indicator zone lien mach.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)',  color: '#1c1c1c' },
  ],
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
  maximumScale: 1,
  userScalable: false,
}

// FIX CHUNK-LOAD-CRASH: tu phuc hoi khi SW lam fetch chunk tinh (_next/static/...)
// resolve voi no-response (xem comment trong sw.ts ve race skipWaiting/clientsClaim).
// Khi rơi vao truong hop nay, chunk goc (vd layout.js) load fail TRUOC khi React
// mount → app/error.tsx (error boundary) khong co co hoi bat duoc, browser fallback
// ve thong bao generic "Application error". Script nay nam ngay trong <head>, INLINE
// (khong phai 1 chunk rieng) nen luon chay duoc du chunk nao khac fail.
//
// Chien luoc 2 buoc trong 1 session, co guard chong reload-loop vo han:
//  - Lan 1: reload binh thuong — thuong du de lay lai bundle/manifest moi nhat.
//  - Lan 2 (trong vong 30s): SW cu/cache cu co the van con sai → unregister SW +
//    xoa toan bo Cache Storage truoc khi reload.
//  - Lan 3+: dung lai, tranh loop vo han neu la su co thuc (server down, mat mang...).
const chunkErrorRecoveryScript = `
(function() {
  var KEY = 'chunk-error-recovery';
  function getState() {
    try {
      var raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : { count: 0, ts: 0 };
    } catch (e) { return { count: 0, ts: 0 }; }
  }
  function setState(s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function isChunkError(msg) {
    return /ChunkLoadError|Loading chunk [\\w-]+ failed|Loading CSS chunk|failed to fetch dynamically imported module/i.test(msg || '');
  }
  function recover() {
    var state = getState();
    var now = Date.now();
    if (now - state.ts > 30000) state.count = 0;
    state.count += 1;
    state.ts = now;
    setState(state);

    if (state.count === 1) {
      window.location.reload();
    } else if (state.count === 2) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function(regs) {
          regs.forEach(function(r) { r.unregister(); });
        }).catch(function() {});
      }
      if (window.caches) {
        caches.keys().then(function(keys) {
          keys.forEach(function(k) { caches.delete(k); });
        }).catch(function() {});
      }
      setTimeout(function() { window.location.reload(); }, 300);
    }
  }
  window.addEventListener('error', function(e) {
    if (isChunkError(e && e.message)) recover();
  });
  window.addEventListener('unhandledrejection', function(e) {
    var msg = e && e.reason && (e.reason.message || String(e.reason));
    if (isChunkError(msg)) recover();
  });
})();
`

// Script chay DONG BO truoc khi browser paint —
// doc theme tu localStorage va apply class 'dark' ngay lap tuc.
// Neu khong co script nay: browser render trang voi light theme (mau trang)
// roi sau khi JS load moi chuyen sang dark → user thay flash trang (FOUC).
const themeScript = `
(function() {
  try {
    var cache = localStorage.getItem('chitieu_settings_cache');
    if (cache) {
      var theme = JSON.parse(cache).theme;
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } else {
      // Mac dinh dark neu chua co cache
      document.documentElement.classList.add('dark');
    }
  } catch(e) {
    // Fallback: dark mac dinh
    document.documentElement.classList.add('dark');
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Phai la 2 the script DAU TIEN trong <head>, chay truoc moi thu khac.
            Recovery truoc theme — neu chunk loi xay ra cuc som thi van bat duoc. */}
        <script dangerouslySetInnerHTML={{ __html: chunkErrorRecoveryScript }} />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />

        {/* PERF: warm up ket noi toi cac origin cua Google/Firebase Auth.
            Giam latency cho lan dang nhap Google dau tien (popup + token exchange). */}
        <link rel="preconnect" href="https://apis.google.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://www.google.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://identitytoolkit.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://securetoken.googleapis.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://firestore.googleapis.com" crossOrigin="anonymous" />
        {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN && (
          <link rel="preconnect" href={`https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}`} crossOrigin="anonymous" />
        )}
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}