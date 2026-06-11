'use client'

import { useState, useCallback } from 'react'
import type { CategoryValue } from '@/lib/types/expense'
import { authHeader } from '@/lib/auth/getIdToken'

export interface ScanResult {
  amount:   number | null   // VND, null nếu không nhận diện được
  date:     string | null   // YYYY-MM-DD
  category: CategoryValue
  title:    string
  note:     string
}

type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

// Luôn convert sang JPEG (xử lý HEIC từ iPhone) + resize nếu cần
// maxDim=1280 + quality 0.82: ảnh nhẹ hơn ~40% so với 1536@0.9
// → upload nhanh hơn + Gemini vision xử lý ít token hơn = scan nhanh hơn,
//   vẫn đủ nét để OCR chữ trên hóa đơn.
async function compressImage(file: File, maxDim = 1280, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img

      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height / width) * maxDim)
          width  = maxDim
        } else {
          width  = Math.round((width / height) * maxDim)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('Canvas không khả dụng')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Nén ảnh thất bại')),
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')) }
    img.src = url
  })
}

// Module-level function — dùng được trong Promise.allSettled (không cần hook context)
export async function scanReceipt(file: File): Promise<ScanResult> {
  const blob = await compressImage(file)
  const formData = new FormData()
  formData.append('image', blob, 'receipt.jpg')
  const headers = await authHeader()
  const res = await fetch('/api/ai/scan-receipt', { method: 'POST', headers, body: formData })
  const data = await res.json()
  if (!res.ok || data.error) {
    throw new Error(data.error ?? 'Không nhận diện được hóa đơn.')
  }
  return {
    amount:   data.amount   ?? null,
    date:     data.date     ?? null,
    category: data.category ?? 'other',
    title:    data.title    ?? '',
    note:     data.note     ?? '',
  }
}

export interface ScanSummary {
  success: number
  fail:    number
}

export interface MultiProgress {
  done:  number
  total: number
}

export const MAX_MULTI_SCAN = 5

export function useReceiptScan() {
  const [status,       setStatus]       = useState<ScanStatus>('idle')
  const [result,       setResult]       = useState<ScanResult | null>(null)
  const [errorMsg,     setErrorMsg]     = useState<string | null>(null)
  const [multiProgress,setMultiProgress]= useState<MultiProgress | null>(null)
  const [scanSummary,  setScanSummary]  = useState<ScanSummary | null>(null)

  const scan = useCallback(async (file: File): Promise<ScanResult | null> => {
    setStatus('scanning')
    setResult(null)
    setErrorMsg(null)
    setScanSummary(null)
    setMultiProgress(null)

    try {
      const r = await scanReceipt(file)
      setResult(r)
      setStatus('done')
      setScanSummary({ success: 1, fail: 0 })
      return r
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối. Vui lòng thử lại.'
      setErrorMsg(msg)
      setStatus('error')
      return null
    }
  }, [])

  // Scan tối đa MAX_MULTI_SCAN ảnh song song; trả về các kết quả thành công.
  // Mỗi ảnh = 1 API call độc lập → partial failure xử lý tự nhiên qua allSettled.
  const scanMany = useCallback(async (files: File[]): Promise<ScanResult[]> => {
    if (files.length === 0) return []
    const capped = files.slice(0, MAX_MULTI_SCAN)

    setStatus('scanning')
    setResult(null)
    setErrorMsg(null)
    setScanSummary(null)
    setMultiProgress({ done: 0, total: capped.length })

    const settled = await Promise.allSettled(
      capped.map(async file => {
        const r = await scanReceipt(file)
        setMultiProgress(p => p ? { ...p, done: p.done + 1 } : p)
        return r
      })
    )

    setMultiProgress(null)

    const successes = settled
      .filter((r): r is PromiseFulfilledResult<ScanResult> => r.status === 'fulfilled')
      .map(r => r.value)
    const failCount = settled.filter(r => r.status === 'rejected').length

    setScanSummary({ success: successes.length, fail: failCount })

    if (successes.length === 0) {
      setStatus('error')
      setErrorMsg(capped.length === 1
        ? 'Không nhận diện được hóa đơn.'
        : 'Không nhận diện được ảnh nào.')
    } else {
      setStatus('done')
    }

    return successes
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg(null)
    setMultiProgress(null)
    setScanSummary(null)
  }, [])

  return { status, result, errorMsg, multiProgress, scanSummary, scan, scanMany, reset }
}
