interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      {/* Logo + App name */}
      <div className="flex flex-col items-center gap-2 mb-8">
        <img src="/icons/icon-192x192.png" alt="Chi Tiêu" className="w-14 h-14 shadow-md rounded-2xl" />
        <span className="text-xl font-bold text-foreground tracking-tight">Chi Tiêu</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl shadow-sm px-6 py-8 sm:px-8">
          {/* Heading */}
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Chi Tiêu. Quản lý tài chính thông minh.
      </p>
    </div>
  )
}
