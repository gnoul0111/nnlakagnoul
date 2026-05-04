/**
 * middleware.ts — Server-side route protection
 *
 * FIX S-04: Không có middleware → route guard chỉ chạy client-side (useEffect),
 * SSR có thể render HTML private trước khi redirect xảy ra.
 *
 * Cách hoạt động:
 *   - authStore.ts set cookie `auth_session=1` sau khi Firebase xác nhận login
 *   - authStore.ts xóa cookie đó khi logout
 *   - Middleware này đọc cookie đó (server-side, trước khi render bất cứ thứ gì)
 *   - Protected route + không có cookie → redirect /login ngay lập tức
 *   - Auth route + có cookie → redirect / (tránh login khi đã đăng nhập)
 *
 * Lưu ý bảo mật:
 *   Cookie `auth_session` là "hint" cho middleware, KHÔNG phải token xác thực.
 *   Bảo mật dữ liệu thực sự được đảm bảo bởi Firebase Auth SDK + Firestore Rules.
 *   Middleware này giải quyết vấn đề UX (flash) và ngăn SSR render private HTML.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cookie name phải khớp với authStore.ts
export const SESSION_COOKIE = 'auth_session'

// Routes yêu cầu đăng nhập
const PROTECTED_PREFIXES = ['/', '/finance', '/analytics', '/calendar', '/settings']

// Routes chỉ dành cho người chưa đăng nhập
const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password']

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(SESSION_COOKIE)

  // Chưa đăng nhập → vào protected route → redirect login
  if (isProtected(pathname) && !hasSession) {
    const loginUrl = new URL('/login', request.url)
    // Giữ lại destination để redirect sau khi login thành công
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Đã đăng nhập → vào auth route → redirect về app
  if (isAuthRoute(pathname) && hasSession) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match tất cả routes NGOẠI TRỪ:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - SW files (sw.js, firebase-messaging-sw.js)
     * - Files có extension (png, jpg, svg, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|firebase-messaging-sw\\.js|.*\\..*).*)',
  ],
}