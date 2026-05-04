import type { Metadata } from 'next'
import { AuthLayout } from '@/components/auth/auth-layout'
import { SignupForm } from '@/components/auth/signup-form'

export const metadata: Metadata = {
  title: 'Đăng ký — Chi Tiêu',
}

export default function SignupPage() {
  return (
    <AuthLayout
      title="Tạo tài khoản"
      subtitle="Bắt đầu quản lý chi tiêu thông minh hơn ngay hôm nay."
    >
      <SignupForm />
    </AuthLayout>
  )
}
