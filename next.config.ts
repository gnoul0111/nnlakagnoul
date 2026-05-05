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
    // Inject build info at build time — tự động từ Vercel/git, không cần Vercel CLI
    // VERCEL_GIT_COMMIT_SHA: Vercel tự set, lấy 7 ký tự đầu làm build number
    // Fallback 'dev' khi chạy local
    NEXT_PUBLIC_BUILD_NUMBER: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    NEXT_PUBLIC_BUILD_VERSION: process.env.npm_package_version ?? '1.0.0',
    NEXT_PUBLIC_BUILD_TIME: new Date().toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }),
  },
}

export default withSerwist(nextConfig)