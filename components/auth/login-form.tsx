'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, FormField, PasswordInput } from '@/components/ui/input'
import { loginWithEmail, logout, sendVerificationEmail, getAuthErrorMessage } from '@/lib/firebase/auth'
import { GoogleSignInButton, OrDivider } from './google-sign-in-button'
import { useToast } from '@/hooks/useToast'

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  email:    z.string().min(1, 'Vui lòng nhập email.').email('Email không hợp lệ.'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu.'),
})

type FormValues = z.infer<typeof schema>

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginForm() {
  const toast = useToast()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const user = await loginWithEmail(values.email, values.password)
      if (!user.emailVerified) {
        // Gửi lại email xác minh (xử lý cả user cũ chưa từng verify)
        try { await sendVerificationEmail(user) } catch { /* bỏ qua nếu gửi thất bại */ }
        await logout()
        setServerError('Email chưa được xác minh. Em vừa gửi lại link xác minh — vui lòng kiểm tra hộp thư (kể cả Spam) rồi thử đăng nhập lại.')
        return
      }
      toast.success('Đăng nhập thành công!')
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setServerError(getAuthErrorMessage(code))
    }
  }

  return (
    <div className="space-y-0">
      {/* Google sign-in */}
      <GoogleSignInButton label="Đăng nhập với Google" />
      <OrDivider />

    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {/* Server error banner */}
      {serverError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm text-destructive font-medium">{serverError}</p>
        </div>
      )}

      {/* Email */}
      <FormField label="Email" error={errors.email?.message} required>
        <Input
          type="email"
          placeholder="email@example.com"
          autoComplete="email"
          autoFocus
          error={!!errors.email}
          {...register('email')}
        />
      </FormField>

      {/* Password */}
      <FormField label="Mật khẩu" error={errors.password?.message} required>
        <PasswordInput
          placeholder="••••••••"
          autoComplete="current-password"
          error={!!errors.password}
          {...register('password')}
        />
      </FormField>

      {/* Forgot password */}
      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-sm text-primary hover:underline underline-offset-4"
        >
          Quên mật khẩu?
        </Link>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full mt-2"
        size="lg"
        loading={isSubmitting}
      >
        Đăng nhập
      </Button>

      {/* Divider + link sang signup */}
      <p className="text-center text-sm text-muted-foreground pt-2">
        Chưa có tài khoản?{' '}
        <Link href="/signup" className="text-primary font-medium hover:underline underline-offset-4">
          Đăng ký ngay
        </Link>
      </p>
    </form>
    </div>
  )
}
