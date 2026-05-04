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
}

export default withSerwist(nextConfig)