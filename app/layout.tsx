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
  // themeColor KHONG dat static o day — themeScript tu tao meta dung mau theo mode
  // (static dark #1c1c1c → iOS to home-indicator dam trong light mode, tao dai den)
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
  maximumScale: 1,
  userScalable: false,
}

// Script chay DONG BO truoc khi browser paint —
// (1) apply dark class de tranh FOUC
// (2) tao <meta name="theme-color"> dung mau (iOS to vung home-indicator bang gia tri nay)
//     light=bg-card light (#ffffff), dark=bg-card dark (#1c1c1c)
const themeScript = `
(function() {
  try {
    var cache = localStorage.getItem('chitieu_settings_cache');
    var isDark = true;
    if (cache) {
      var theme = JSON.parse(cache).theme;
      isDark = theme !== 'light';
    }
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = isDark ? '#1c1c1c' : '#ffffff';
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        {/* Script nay PHAI la the dau tien trong <head>, chay truoc moi thu */}
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