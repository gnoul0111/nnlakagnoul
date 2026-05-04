import {
  LayoutDashboard,
  Wallet,
  BarChart2,
  CalendarDays,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Tổng quan',  href: '/',          icon: LayoutDashboard },
  { label: 'Tài chính',  href: '/finance',    icon: Wallet          },
  { label: 'Phân tích',  href: '/analytics',  icon: BarChart2       },
  { label: 'Lịch',       href: '/calendar',   icon: CalendarDays    },
  { label: 'Cài đặt',    href: '/settings',   icon: Settings        },
]

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname.startsWith(href)
}
