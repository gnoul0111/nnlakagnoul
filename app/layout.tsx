import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title:       'Chi Tiêu',
  description: 'Ứng dụng quản lý chi tiêu cá nhân',
  manifest:    '/manifest.json',
  icons:       { icon: '/icons/favicon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Chi Tiêu' },
}

export const viewport: Viewport = {
  themeColor:   '#0a0a0a',
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
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}