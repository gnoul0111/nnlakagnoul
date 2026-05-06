import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc:   'sw.ts',          // gốc project
  swDest:  'public/sw.js',
  exclude: [/firebase-messaging-sw\.js$/],
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    // Build time inject luc Vercel build, dung timezone Viet Nam (Asia/Ho_Chi_Minh)
    // new Date() tren Vercel server chay UTC → phai chi ro timezone khi format
    NEXT_PUBLIC_BUILD_TIME: new Date().toLocaleString('vi-VN', {
      timeZone:  'Asia/Ho_Chi_Minh',
      day:       '2-digit',
      month:     '2-digit',
      year:      'numeric',
      hour:      '2-digit',
      minute:    '2-digit',
      hour12:    false,
    }),
  },
}

export default withSerwist(nextConfig)