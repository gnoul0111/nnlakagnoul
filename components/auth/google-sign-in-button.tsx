'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/lib/firebase/auth'
import { warmUpAppCheck } from '@/lib/firebase/appCheck'
import { upsertUserProfile } from '@/lib/services/settingsService'
import { useToast } from '@/hooks/useToast'

interface Props {
  label?: string
}

export function GoogleSignInButton({ label = 'Tiếp tục với Google' }: Props) {
  const [loading, setLoading] = useState(false)
  const toast  = useToast()
  const router = useRouter()

  // Làm nóng App Check reCAPTCHA ngay khi vào trang login → token sẵn sàng
  // trước khi đăng nhập xong, tránh chặn lúc tải dữ liệu sau redirect.
  useEffect(() => { warmUpAppCheck() }, [])

  const handleClick = async () => {
    setLoading(true)
    // TODO(tam thoi): log de do thoi gian dang nhap tren production. Go sau khi xong.
    const t0 = performance.now()
    try {
      const { user, isNewUser } = await signInWithGoogle()
      const t1 = performance.now()
      console.log(`[signin] popup OAuth: ${Math.round(t1 - t0)}ms (isNewUser=${isNewUser})`)

      // Lần đầu đăng nhập bằng Google → tạo profile trong Firestore
      if (isNewUser) {
        await upsertUserProfile(user.uid, {
          uid:         user.uid,
          email:       user.email ?? '',
          displayName: user.displayName ?? 'Người dùng',
          photoURL:    user.photoURL ?? null,
        })
        console.log(`[signin] upsert profile: ${Math.round(performance.now() - t1)}ms`)
      }

      console.log(`[signin] total truoc khi redirect: ${Math.round(performance.now() - t0)}ms`)
      toast.success(isNewUser ? 'Chào mừng bạn đến với Chi Tiêu!' : 'Đăng nhập thành công!')
      router.replace('/')
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      // User đóng popup — không cần show lỗi
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setLoading(false)
        return
      }
      toast.error('Đăng nhập Google thất bại. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full gap-3"
      loading={loading}
      onClick={handleClick}
      leftIcon={
        !loading ? (
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        ) : undefined
      }
    >
      {label}
    </Button>
  )
}

// Divider "hoặc" dùng giữa Google button và form email
export function OrDivider() {
  return (
    <div className="relative my-5">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-card px-3 text-muted-foreground">hoặc</span>
      </div>
    </div>
  )
}
