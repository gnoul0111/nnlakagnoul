'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, FormField } from '@/components/ui/input'
import { resetPassword, getAuthErrorMessage } from '@/lib/firebase/auth'

const schema = z.object({
  email: z.string().min(1, 'Vui lòng nhập email.').email('Email không hợp lệ.'),
})

type FormValues = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      await resetPassword(values.email)
      setSent(true)
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      // Nếu email không tồn tại — vẫn hiển thị thành công để bảo mật
      if (code === 'auth/user-not-found') {
        setSent(true)
      } else {
        setServerError(getAuthErrorMessage(code))
      }
    }
  }

  // ─── Success state ────────────────────────────────────────────────────────

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.03 2.18 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>
          </svg>
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Email đã được gửi!</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Kiểm tra hộp thư của{' '}
            <span className="font-medium text-foreground">{getValues('email')}</span>{' '}
            để đặt lại mật khẩu. Nếu không thấy, kiểm tra thư mục spam.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline underline-offset-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
          Quay lại đăng nhập
        </Link>
      </div>
    )
  }

  // ─── Form ─────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm text-destructive font-medium">{serverError}</p>
        </div>
      )}

      <FormField
        label="Email đã đăng ký"
        error={errors.email?.message}
        required
      >
        <Input
          type="email"
          placeholder="email@example.com"
          autoComplete="email"
          autoFocus
          error={!!errors.email}
          {...register('email')}
        />
      </FormField>

      <Button
        type="submit"
        variant="gradient"
        className="w-full mt-2"
        size="lg"
        loading={isSubmitting}
      >
        Gửi link đặt lại mật khẩu
      </Button>

      <p className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline underline-offset-4 flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
          Quay lại đăng nhập
        </Link>
      </p>
    </form>
  )
}
