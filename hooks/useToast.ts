import { useToastStore } from '@/lib/store/toastStore'

export function useToast() {
  const add = useToastStore(s => s.add)

  return {
    success: (message: string, duration?: number) =>
      add({ type: 'success', message, duration }),
    error: (message: string, duration?: number) =>
      add({ type: 'error', message, duration: duration ?? 5000 }),
    warning: (message: string, duration?: number) =>
      add({ type: 'warning', message, duration }),
    info: (message: string, duration?: number) =>
      add({ type: 'info', message, duration }),
  }
}
