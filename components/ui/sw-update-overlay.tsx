'use client'

import { useSwUpdateStore } from '@/lib/store/swUpdateStore'

/**
 * Overlay full-screen khi user bấm "Cập nhật" và app đang chờ SW mới active + reload.
 *
 * Mục đích: user thấy app phản hồi NGAY khi bấm Cập nhật, không phải chờ 2-3s
 * trong im lặng. Overlay giữ tới khi browser hard reload.
 */
export function SwUpdateOverlay() {
  const applying = useSwUpdateStore(s => s.applying)

  if (!applying) return null

  return (
    <div
      className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full border-4 border-muted border-t-primary animate-spin" />
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Đang cập nhật…</p>
          <p className="text-sm text-muted-foreground">
            Vui lòng chờ trong giây lát
          </p>
        </div>
      </div>
    </div>
  )
}
