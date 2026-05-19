'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, FormField, PasswordInput } from '@/components/ui/input'
import { loginWithEmail, getAuthErrorMessage } from '@/lib/firebase/auth'
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
      await loginWithEmail(values.email, values.password)
      toast.success('Đăng nhập thành công!')
      // Không redirect ở đây — onAuthStateChanged sẽ fire và (auth)/layout.tsx
      // tự redirect về / khi user được set vào store.
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setServerError(getAuthErrorMessage(code))
    }
  }

  return (
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
  )
}
