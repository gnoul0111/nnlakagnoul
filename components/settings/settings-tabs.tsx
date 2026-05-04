'use client'

import { cn } from '@/lib/utils/cn'

export type SettingsTabId = 'profile' | 'preferences' | 'data'

const TABS: { id: SettingsTabId; label: string; icon: string }[] = [
  { id: 'profile',     label: 'Hồ sơ',      icon: '👤' },
  { id: 'preferences', label: 'Tùy chỉnh',   icon: '⚙️' },
  { id: 'data',        label: 'Dữ liệu',     icon: '💾' },
]

interface SettingsTabsProps {
  active:   SettingsTabId
  onChange: (tab: SettingsTabId) => void
}

export function SettingsTabs({ active, onChange }: SettingsTabsProps) {
  return (
    <div className="flex bg-card border-b border-border px-4 py-2 gap-1 shrink-0">
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center min-w-0 whitespace-nowrap',
            active === tab.id
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          )}
        >
          <span className="text-base leading-none shrink-0">{tab.icon}</span>
          <span className="truncate">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}