'use client'

import { useToastStore, type Toast, type ToastType } from '@/lib/store/toastStore'
import { cn } from '@/lib/utils/cn'

// ─── Icons ────────────────────────────────────────────────────────────────────

function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
    </svg>
  )
  if (type === 'error') return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
    </svg>
  )
  if (type === 'warning') return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
    </svg>
  )
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
    </svg>
  )
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

const toastStyles: Record<ToastType, string> = {
  success: 'bg-success text-success-foreground',
  error:   'bg-destructive text-destructive-foreground',
  warning: 'bg-warning text-warning-foreground',
  info:    'bg-primary text-primary-foreground',
}

function ToastItem({ toast }: { toast: Toast }) {
  const remove = useToastStore(s => s.remove)

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2.5 px-4 py-3 rounded-lg shadow-lg',
        'min-w-[260px] max-w-sm text-sm font-medium',
        'animate-slide-up',
        toastStyles[toast.type],
      )}
    >
      <ToastIcon type={toast.type} />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => remove(toast.id)}
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity ml-1"
        aria-label="Đóng"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Toast Container — mount ở root layout ───────────────────────────────────

export function ToastContainer() {
  const toasts = useToastStore(s => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
