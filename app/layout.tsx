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
  // Khop mau thanh nav (bg-card dark = hsl 0 0% 11% = #1c1c1c) → vung
  // home-indicator iOS (iOS to bang theme-color) lien mach voi nav, het khoang den.
  themeColor:   '#1c1c1c',
  width:        'device-width',
  initialScale: 1,
  viewportFit:  'cover',
  maximumScale: 1,
  userScalable: false,
}

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