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
    // Build info tu dong inject luc Vercel build — khong can Vercel CLI
    // VERCEL_GIT_COMMIT_SHA: bien Vercel tu set, san co trong moi build
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
    NEXT_PUBLIC_BUILD_TIME: (() => {
      const d = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    })(),
  },
}

export default withSerwist(nextConfig)