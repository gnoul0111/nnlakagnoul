'use client'

import { useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { QuickAddModal } from './quick-add-modal'

/**
 * QuickAddBar — chỉ dùng cho desktop (lg+), hiện 2 button inline trong topbar.
 * Mobile FAB được render trực tiếp trong DashboardPage qua <QuickAddFab />.
 */
export function QuickAddBar() {
  const [open, setOpen]           = useState(false)
  const [defaultTab, setDefaultTab] = useState<'expense' | 'income'>('expense')

  const openModal = (tab: 'expense' | 'income') => {
    setDefaultTab(tab)
    setOpen(true)
  }

  return (
    <>
      <div className="hidden lg:flex items-center gap-2">
        <button
          onClick={() => openModal('expense')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-sm font-medium transition-colors"
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Chi tiêu
        </button>
        <button
          onClick={() => openModal('income')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 hover:bg-success/20 text-success text-sm font-medium transition-colors"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Thu nhập
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