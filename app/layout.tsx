import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title:       'Chi Tiêu',
  description: 'Ứng dụng quản lý chi tiêu cá nhân',
  manifest:    '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Chi Tiêu' },
}

export const viewport: Viewport = {
  themeColor:          '#ffffff',
  width:               'device-width',
  initialScale:        1,
  viewportFit:         'cover',
  maximumScale:        1,
  userScalable:        false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}