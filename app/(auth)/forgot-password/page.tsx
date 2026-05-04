import type { Metadata } from 'next'
import { AuthLayout } from '@/components/auth/auth-layout'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export const metadata: Metadata = {
  title: 'Quên mật khẩu — Chi Tiêu',
}

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Quên mật khẩu?"
      subtitle="Nhập email của bạn, chúng tôi sẽ gửi link đặt lại mật khẩu."
    >
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
