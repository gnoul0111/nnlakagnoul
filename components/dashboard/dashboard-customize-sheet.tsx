'use client'

import { RotateCcw } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils/cn'
import {
  METRIC_CATALOG,
  DEFAULT_DASHBOARD_METRICS,
  MIN_DASHBOARD_METRICS,
  MAX_DASHBOARD_METRICS,
} from '@/lib/dashboard/metricCatalog'

// ─── ToggleSwitch (đồng bộ style với preferences-tab) ──────────────────────────

function ToggleSwitch({ checked, onChange, disabled }: {
  checked: boolean; onChange: () => void; disabled?: boolean
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        disabled && 'opacity-40 pointer-events-none',
      )}
    >
      <span className={cn(
        'absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-all duration-200',
        checked ? 'left-[23px]' : 'left-[3px]',
      )} />
    </button>
  )
}

// ─── Sheet ─────────────────────────────────────────────────────────────────────

interface DashboardCustomizeSheetProps {
  open:      boolean
  onClose:   () => void
  enabledIds: string[]
  onChange:  (ids: string[]) => void   // apply ngay (persist ngầm)
}

export function DashboardCustomizeSheet({
  open, onClose, enabledIds, onChange,
}: DashboardCustomizeSheetProps) {
  const enabled = new Set(enabledIds)
  const count   = enabled.size

  function toggle(id: string) {
    const next = new Set(enabled)
    if (next.has(id)) {
      if (count <= MIN_DASHBOARD_METRICS) return  // không bỏ thẻ cuối cùng
      next.delete(id)
    } else {
      if (count >= MAX_DASHBOARD_METRICS) return  // đã đạt tối đa
      next.add(id)
    }
    // Luôn xếp theo thứ tự catalog → ổn định, không phụ thuộc thứ tự bật
    onChange(METRIC_CATALOG.filter(m => next.has(m.id)).map(m => m.id))
  }

  return (
    <Modal open={open} onClose={onClose} title="Tùy chỉnh tổng quan" variant="bottom">
      <div className="px-4 pb-6 pt-1">
        <p className="text-xs text-muted-foreground mb-3">
          Chọn thẻ hiển thị ở Tổng quan. Bật/tắt áp dụng ngay.
        </p>

        <div className="space-y-1">
          {METRIC_CATALOG.map(m => {
            const Icon      = m.icon
            const isOn      = enabled.has(m.id)
            const lockOff   = isOn  && count <= MIN_DASHBOARD_METRICS  // không tắt được
            const lockOn    = !isOn && count >= MAX_DASHBOARD_METRICS  // không bật thêm được
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5">
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', m.color)}>
                  <Icon className={cn('w-4 h-4', m.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{m.label}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{m.description}</p>
                </div>
                <ToggleSwitch checked={isOn} onChange={() => toggle(m.id)} disabled={lockOff || lockOn} />
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Đang hiện {count}/{MAX_DASHBOARD_METRICS}
          </span>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_DASHBOARD_METRICS)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Khôi phục mặc định
          </button>
        </div>
      </div>
    </Modal>
  )
}
