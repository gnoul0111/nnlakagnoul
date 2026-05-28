import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken } from '@/lib/auth/verifyToken'
import { SESSION_COOKIE } from '@/middleware'

const IS_PROD = process.env.NODE_ENV === 'production'

const COOKIE_OPTIONS = [
  `${SESSION_COOKIE}=1`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  IS_PROD ? 'Secure' : '',
].filter(Boolean).join('; ')

const CLEAR_OPTIONS = [
  `${SESSION_COOKIE}=`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  'Max-Age=0',
  IS_PROD ? 'Secure' : '',
].filter(Boolean).join('; ')

// POST /api/auth/session — set HttpOnly session cookie after Firebase login
export async function POST(request: NextRequest) {
  try {
    await verifyIdToken(request)
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', COOKIE_OPTIONS)
  return res
}

// DELETE /api/auth/session — clear session cookie on logout
export async function DELETE(_request: NextRequest) {
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', CLEAR_OPTIONS)
  return res
}
