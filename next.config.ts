import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc:   'sw.ts',          // gốc project
  swDest:  'public/sw.js',
  exclude: [/firebase-messaging-sw\.js$/],
  disable: process.env.NODE_ENV === 'development',
})

const IS_PROD = process.env.NODE_ENV === 'production'

// CSP report-only: log vi phạm nhưng không block — monitor trước khi enforce
// Sau khi xác nhận không có false positive → chuyển sang Content-Security-Policy
const cspDirectives = [
  "default-src 'self'",
  // Firebase SDK + Firestore + Auth + FCM + reCAPTCHA Enterprise (www.google.com + gstatic)
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://fcm.googleapis.com https://www.google.com https://apis.google.com https://www.gstatic.com",
  // Scripts: 'self' + reCAPTCHA + gapi (apis.google.com — Firebase Auth iframe loader)
  "script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.google.com https://apis.google.com",
  // Styles: 'self' + inline (Next.js inject inline styles)
  "style-src 'self' 'unsafe-inline'",
  // Fonts
  "font-src 'self' data:",
  // Images: 'self' + data URIs (avatars) + Firebase Storage
  "img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com",
  // Frames: reCAPTCHA cần frame google.com
  "frame-src https://www.google.com https://nnlakagnoul.firebaseapp.com",
  // Workers: service worker
  "worker-src 'self' blob:",
  // Report URI (tùy chọn — uncomment nếu có endpoint nhận report)
  // "report-uri /api/csp-report",
].join('; ')

const securityHeaders = [
  // same-origin-allow-popups: cho phép Google sign-in popup communicate về app
  // (Vercel mặc định set same-origin, block hoàn toàn → Google OAuth không hoạt động)
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  // Ngăn app bị nhúng vào iframe trên domain khác → chống clickjacking
  { key: 'X-Frame-Options', value: 'DENY' },
  // Ngăn browser đoán content-type → chống MIME sniffing attacks
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Giảm thông tin referrer leak khi user click link ra ngoài
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Tắt các browser feature không dùng — giảm attack surface
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Bật DNS prefetch để tăng tốc — không ảnh hưởng bảo mật
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // HSTS: buộc HTTPS trong 2 năm, bao gồm subdomain — chỉ production
  ...(IS_PROD ? [{
    key:   'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }] : []),
  // CSP report-only: quan sát vi phạm, chưa block
  // Khi không còn vi phạm → đổi key thành 'Content-Security-Policy' để enforce
  { key: 'Content-Security-Policy-Report-Only', value: cspDirectives },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
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