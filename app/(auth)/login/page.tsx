import type { Metadata } from 'next'
import { AuthLayout } from '@/components/auth/auth-layout'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = {
  title: 'Đăng nhập — Chi Tiêu',
}

export default function LoginPage() {
  return (
    <AuthLayout
      title="Chào mừng trở lại"
      subtitle="Đăng nhập để tiếp tục quản lý chi tiêu của bạn."
    >
      <LoginForm />
    </AuthLayout>
  )
}
