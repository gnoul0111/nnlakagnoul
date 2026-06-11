'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils/cn'
import { useReceiptScan, MAX_MULTI_SCAN, type ScanResult } from '@/hooks/useReceiptScan'

interface ReceiptScannerProps {
  // Single-scan mode (default): called với 1 result
  onResult?: (result: ScanResult) => void
  // Multi-scan mode: called với mảng results (kể cả khi chỉ 1 ảnh)
  onMultiResult?: (results: ScanResult[]) => void
  // Bật chế độ chọn nhiều ảnh. Khi true, luôn gọi onMultiResult.
  multiple?: boolean
  disabled?: boolean
  className?: string
}

export function ReceiptScanner({ onResult, onMultiResult, multiple, disabled, className }: ReceiptScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { status, errorMsg, multiProgress, scanSummary, scan, scanMany, reset } = useReceiptScan()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    e.target.value = '' // reset để chọn lại cùng file được

    if (multiple) {
      // Multi mode: luôn qua scanMany, kể cả khi chỉ 1 file
      const results = await scanMany(files)
      if (results.length > 0) onMultiResult?.(results)
    } else {
      // Single mode: hành vi cũ
      const result = await scan(files[0])
      if (result) onResult?.(result)
    }
  }

  const isScanning = status === 'scanning'

  // Label hiển thị khi scan xong
  const doneLabel = (() => {
    if (!scanSummary || scanSummary.success === 1) return 'Đã điền từ hóa đơn — quét lại?'
    if (scanSummary.fail > 0) return `Đã scan ${scanSummary.success}/${scanSummary.success + scanSummary.fail} ảnh — quét lại?`
    return `Đã điền ${scanSummary.success} hóa đơn — quét lại?`
  })()

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={handleFileChange}
        disabled={isScanning || disabled}
      />

      {status === 'idle' || status === 'done' ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isScanning || disabled}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed text-sm font-medium transition-colors',
            status === 'done'
              ? 'border-green-500/50 bg-green-500/5 text-green-600 dark:text-green-400'
              : 'border-border hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary',
            (isScanning || disabled) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {status === 'done' ? (
            <>
              <CheckIcon />
              <span>{doneLabel}</span>
            </>
          ) : (
            <>
              <CameraIcon />
              <span>
                {multiple
                  ? `Chụp / chọn tối đa ${MAX_MULTI_SCAN} hóa đơn để AI điền`
                  : 'Chụp / chọn hóa đơn để AI điền'}
              </span>
            </>
          )}
        </button>
      ) : status === 'scanning' ? (
        <div className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 text-sm text-primary">
          <SpinnerIcon />
          <span>
            {multiProgress && multiProgress.total > 1
              ? `Đang scan ${multiProgress.done}/${multiProgress.total} ảnh...`
              : 'Đang nhận diện hóa đơn...'}
          </span>
        </div>
      ) : (
        // error state
        <div className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 text-sm">
          <span className="text-destructive text-xs truncate">{errorMsg}</span>
          <button
            type="button"
            onClick={() => { reset(); inputRef.current?.click() }}
            className="shrink-0 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
