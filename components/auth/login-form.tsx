'use client'

import { GoogleSignInButton } from './google-sign-in-button'

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginForm() {
  return (
    <div className="space-y-0">
      {/* Google sign-in */}
      <GoogleSignInButton label="Đăng nhập với Google" />
    </div>
  )
}
