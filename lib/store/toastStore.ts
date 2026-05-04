import { create } from 'zustand'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number  // ms, default 3500
}

interface ToastStore {
  toasts: Toast[]
  add: (toast: Omit<Toast, 'id'>) => void
  remove: (id: string) => void
  clear: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  add: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    set(s => ({ toasts: [...s.toasts, { id, duration: 3500, ...toast }] }))

    // Auto-dismiss
    setTimeout(() => {
      set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
    }, toast.duration ?? 3500)
  },

  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}))
