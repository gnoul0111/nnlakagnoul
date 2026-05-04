'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV_ITEMS, isNavItemActive } from './nav-items'
import { Avatar } from '@/components/ui/avatar'
import { useAuthStore }     from '@/lib/store/authStore'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { useNavStore, type NavStore } from '@/lib/store/navStore'
import { cn } from '@/lib/utils/cn'

const COLLAPSE_KEY = 'chitieu_sidebar_collapsed'

export function Sidebar() {
  const pathname = usePathname()
  const user         = useAuthStore(s => s.user)
  const profilePhoto = useSettingsStore(s => (s as any).profilePhoto as string | null)
  const pendingHref  = useNavStore((s: NavStore) => s.pendingHref)
  const setPending   = useNavStore((s: NavStore) => s.setPending)
  const router       = useRouter()

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(COLLAPSE_KEY) === 'true'
  })

  const toggleCollapse = () => {
    setCollapsed(v => {
      const next = !v
      localStorage.setItem(COLLAPSE_KEY, String(next))
      return next
    })
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col h-screen sticky top-0',
        'border-r border-border bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 h-14 border-b border-border shrink-0', collapsed && 'justify-center px-0')}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-base font-bold shrink-0">
          💰
        </div>
        {!collapsed && (
          <span className="font-bold text-base text-foreground truncate">Chi Tiêu</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive      = isNavItemActive(item.href, pathname)
          const isPending     = pendingHref === item.href
          const isHighlighted = isActive || isPending
          const Icon = item.icon
          return (
            <button
              key={item.href}
              onClick={() => { if (!isActive) { setPending(item.href); router.push(item.href) } }}
              className={cn(
                'flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors w-full',
                'hover:bg-accent hover:text-accent-foreground active:scale-[0.97]',
                isHighlighted
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground',
                collapsed && 'justify-center px-0',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn('w-[18px] h-[18px] shrink-0', isPending && !isActive && 'animate-pulse')} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* User + collapse toggle */}
      <div className="border-t border-border p-2 space-y-1 shrink-0">
        {/* User info */}
        <div className={cn('flex items-center gap-2.5 px-2 py-2 rounded-lg', collapsed && 'justify-center')}>
          <Avatar src={profilePhoto ?? user?.photoURL} name={user?.displayName ?? user?.email ?? ''} size="sm" />
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{user?.displayName ?? 'Người dùng'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className={cn(
            'flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs text-muted-foreground',
            'hover:bg-accent hover:text-accent-foreground transition-colors',
            collapsed && 'justify-center',
          )}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          {collapsed
            ? <PanelLeftOpen className="w-4 h-4" />
            : <><PanelLeftClose className="w-4 h-4" /><span>Thu gọn</span></>
          }
        </button>
      </div>
    </aside>
  )
}