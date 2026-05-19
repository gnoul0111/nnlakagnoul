'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input, FormField, PasswordInput } from '@/components/ui/input'
import { signupWithEmail, getAuthErrorMessage } from '@/lib/firebase/auth'
import { upsertUserProfile } from '@/lib/services/settingsService'
import { useToast } from '@/hooks/useToast'

// ─── Schema ───────────────────────────────────────────────────────────────────
//
// FIX S-07: mật khẩu cũ chỉ yêu cầu min 6 ký tự (Firebase default).
// Đã nâng lên 8 ký tự + bắt buộc có chữ cái và chữ số.
// Regex không quá phức tạp để không gây khó chịu cho user.

const passwordSchema = z
  .string()
  .min(1, 'Vui lòng nhập mật khẩu.')
  .min(8, 'Mật khẩu cần ít nhất 8 ký tự.')
  .max(128, 'Mật khẩu không được quá 128 ký tự.')
  .refine(
    val => /[A-Za-z]/.test(val),
    'Mật khẩu phải chứa ít nhất 1 chữ cái.',
  )
  .refine(
    val => /[0-9]/.test(val),
    'Mật khẩu phải chứa ít nhất 1 chữ số.',
  )

const schema = z
  .object({
    displayName: z
      .string()
      .min(1, 'Vui lòng nhập tên.')
      .min(2, 'Tên cần ít nhất 2 ký tự.')
      .max(50, 'Tên không được quá 50 ký tự.'),
    email: z
      .string()
      .min(1, 'Vui lòng nhập email.')
      .email('Email không hợp lệ.'),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu.'),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp.',
    path: ['confirmPassword'],
  })

type FormValues = z.infer<typeof schema>

// ─── Component ────────────────────────────────────────────────────────────────

export function SignupForm() {
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
      const user = await signupWithEmail(
        values.email,
        values.password,
        values.displayName,
      )
      await upsertUserProfile(user.uid, {
        uid: user.uid,
        email: values.email,
        displayName: values.displayName,
        photoURL: null,
      })
      toast.success('Đăng ký thành công! Chào mừng bạn.')
      // Không redirect ở đây — onAuthStateChanged sẽ fire và (auth)/layout.tsx
      // tự redirect về / khi user được set vào store.
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      setServerError(getAuthErrorMessage(code))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {/* Server error */}
      {serverError && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm text-destructive font-medium">{serverError}</p>
        </div>
      )}

      {/* Display name */}
      <FormField label="Họ và tên" error={errors.displayName?.message} required>
        <Input
          type="text"
          placeholder="Nguyễn Văn A"
          autoComplete="name"
          autoFocus
          error={!!errors.displayName}
          {...register('displayName')}
        />
      </FormField>

      {/* Email */}
      <FormField label="Email" error={errors.email?.message} required>
        <Input
          type="email"
          placeholder="email@example.com"
          autoComplete="email"
          error={!!errors.email}
          {...register('email')}
        />
      </FormField>

      {/* Password — hint text cập nhật theo policy mới */}
      <FormField
        label="Mật khẩu"
        error={errors.password?.message}
        hint="Tối thiểu 8 ký tự, gồm chữ cái và chữ số."
        required
      >
        <PasswordInput
          placeholder="••••••••"
          autoComplete="new-password"
          error={!!errors.password}
          {...register('password')}
        />
      </FormField>

      {/* Confirm password */}
      <FormField label="Xác nhận mật khẩu" error={errors.confirmPassword?.message} required>
        <PasswordInput
          placeholder="••••••••"
          autoComplete="new-password"
          error={!!errors.confirmPassword}
          {...register('confirmPassword')}
        />
      </FormField>

      {/* Submit */}
      <Button
        type="submit"
        className="w-full mt-2"
        size="lg"
        loading={isSubmitting}
      >
        Tạo tài khoản
      </Button>

      {/* Link sang login */}
      <p className="text-center text-sm text-muted-foreground pt-2">
        Đã có tài khoản?{' '}
        <Link href="/login" className="text-primary font-medium hover:underline underline-offset-4">
          Đăng nhập
        </Link>
      </p>
    </form>
  )
}