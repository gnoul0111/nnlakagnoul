'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, User, Moon, Sun } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectTheme } from '@/lib/store/settingsStore'

interface TopbarProps {
  title?: string
  right?: React.ReactNode
}

export function Topbar({ title, right }: TopbarProps) {
  const user         = useAuthStore(s => s.user)
  const profilePhoto = useSettingsStore(s => (s as any).profilePhoto as string | null)
  const logout       = useAuthStore(s => s.logout)
  const theme        = useSettingsStore(selectTheme)
  const setTheme     = useSettingsStore(s => s.setTheme)
  const router       = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleLogout = async () => {
    setMenuOpen(false)
    await logout()
    router.replace('/login')
  }

  const toggleTheme = () => {
    if (!user) return
    setTheme(user.uid, theme === 'dark' ? 'light' : 'dark')
    setMenuOpen(false)
  }

  return (
    <header
      className="flex items-center justify-between px-4 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-30"
      style={{ paddingTop: 'env(safe-area-inset-top)', minHeight: 'calc(3.5rem + env(safe-area-inset-top))' }}>
      <h1 className="text-base font-semibold text-foreground truncate">
        {title ?? 'Chi Tiêu'}
      </h1>

      <div className="flex items-center gap-2">
        {right}

        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="flex items-center gap-2 rounded-lg px-2 py-2 min-h-[44px] hover:bg-muted transition-colors"
            aria-label="Menu tài khoản"
          >
            <Avatar src={profilePhoto ?? user?.photoURL} name={user?.displayName ?? user?.email ?? ''} size="sm" />
            <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">
              {user?.displayName ?? 'Người dùng'}
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium text-foreground truncate">{user?.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setMenuOpen(false); router.push('/settings') }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    <User className="w-4 h-4 text-muted-foreground" />
                    Hồ sơ cá nhân
                  </button>
                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                  >
                    {theme === 'dark'
                      ? <Sun className="w-4 h-4 text-muted-foreground" />
                      : <Moon className="w-4 h-4 text-muted-foreground" />
                    }
                    {theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
                  </button>
                </div>
                <div className="border-t border-border py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Đăng xuất
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}