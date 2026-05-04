'use client'

import { useState } from 'react'
import { Plus, TrendingDown, TrendingUp, X } from 'lucide-react'
import { QuickAddModal } from './quick-add-modal'
import { cn } from '@/lib/utils/cn'

/**
 * QuickAddFab — FAB thêm nhanh thu/chi, chỉ hiện trên mobile (lg:hidden).
 * Render trực tiếp trong DashboardPage, không qua topbar slot.
 *
 * Vị trí: fixed bottom-20 right-4 (trên bottom nav).
 * Tương tác: bấm ➕ → expand 2 sub-button Chi tiêu / Thu nhập → mở modal đúng tab.
 */
export function QuickAddFab() {
  const [expanded, setExpanded]     = useState(false)
  const [open, setOpen]             = useState(false)
  const [defaultTab, setDefaultTab] = useState<'expense' | 'income'>('expense')

  const openModal = (tab: 'expense' | 'income') => {
    setDefaultTab(tab)
    setExpanded(false)
    setOpen(true)
  }

  return (
    <>
      {/* Backdrop — đóng FAB khi tap ra ngoài */}
      {expanded && (
        <div
          className="lg:hidden fixed inset-0 z-20"
          onClick={() => setExpanded(false)}
        />
      )}

      <div className="lg:hidden fixed bottom-20 right-4 z-30 flex flex-col items-end gap-2.5">
        {/* Sub-buttons — animate in khi expanded */}
        {expanded && (
          <>
            {/* Thu nhập */}
            <div className="flex items-center gap-2.5 animate-fade-in">
              <span className="text-xs font-medium text-foreground bg-card border border-border px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                Thu nhập
              </span>
              <button
                onClick={() => openModal('income')}
                className="w-11 h-11 rounded-full bg-success shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform"
                aria-label="Thêm thu nhập"
              >
                <TrendingUp className="w-5 h-5" />
              </button>
            </div>

            {/* Chi tiêu */}
            <div className="flex items-center gap-2.5 animate-fade-in">
              <span className="text-xs font-medium text-foreground bg-card border border-border px-2.5 py-1 rounded-full shadow-sm whitespace-nowrap">
                Chi tiêu
              </span>
              <button
                onClick={() => openModal('expense')}
                className="w-11 h-11 rounded-full bg-destructive shadow-lg flex items-center justify-center text-white active:scale-95 transition-transform"
                aria-label="Thêm chi tiêu"
              >
                <TrendingDown className="w-5 h-5" />
              </button>
            </div>
          </>
        )}

        {/* Main FAB */}
        <button
          onClick={() => setExpanded(v => !v)}
          className={cn(
            'w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-all duration-200 active:scale-95',
            expanded ? 'bg-muted-foreground rotate-45' : 'bg-primary',
          )}
          aria-label="Thêm nhanh"
        >
          {expanded ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
        </button>
      </div>

      <QuickAddModal
        open={open}
        onClose={() => setOpen(false)}
        defaultTab={defaultTab}
      />
    </>
  )
}