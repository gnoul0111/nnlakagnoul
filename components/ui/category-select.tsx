'use client'

import { CATEGORIES, type CategoryValue } from '@/lib/types/expense'
import { cn } from '@/lib/utils/cn'

interface CategorySelectProps {
  value: CategoryValue
  onChange: (v: CategoryValue) => void
  hidden?: CategoryValue[]
  className?: string
}

/**
 * Compact category selector — dùng trong entry card multi-entry form.
 * Hiển thị icon + label của category đang chọn; click bung grid nhỏ.
 */
export function CategorySelect({ value, onChange, hidden = [], className }: CategorySelectProps) {
  const visible = CATEGORIES.filter(c => !hidden.includes(c.value))
  const current = CATEGORIES.find(c => c.value === value) ?? CATEGORIES[0]

  return (
    <div className={cn('space-y-1.5', className)}>
      <p className="text-xs font-medium text-muted-foreground">Danh mục</p>
      <div className="grid grid-cols-4 gap-1.5">
        {visible.map(cat => (
          <button
            key={cat.value}
            type="button"
            onClick={() => onChange(cat.value)}
            className={cn(
              'flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-xs font-medium transition-colors',
              cat.value === current.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-muted text-muted-foreground',
            )}
          >
            <span className="text-base leading-tight">{cat.icon}</span>
            <span className="leading-tight text-center text-[10px]">{cat.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
