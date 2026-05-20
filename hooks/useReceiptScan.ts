'use client'

import { useState, useCallback } from 'react'
import type { CategoryValue } from '@/lib/types/expense'

export interface ScanResult {
  amount:   number | null   // VND, null nếu không nhận diện được
  date:     string | null   // YYYY-MM-DD
  category: CategoryValue
  title:    string
  note:     string
}

type ScanStatus = 'idle' | 'scanning' | 'done' | 'error'

// Resize ảnh client-side trước khi upload — giảm băng thông, tránh vượt 4MB
async function compressImage(file: File, maxDim = 1024, quality = 0.85): Promise<Blob> {
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

export function useReceiptScan() {
  const [status,  setStatus]  = useState<ScanStatus>('idle')
  const [result,  setResult]  = useState<ScanResult | null>(null)
  const [errorMsg,setErrorMsg]= useState<string | null>(null)

  const scan = useCallback(async (file: File): Promise<ScanResult | null> => {
    setStatus('scanning')
    setResult(null)
    setErrorMsg(null)

    try {
      // Compress nếu ảnh lớn hơn 2MB
      const blob = file.size > 2 * 1024 * 1024
        ? await compressImage(file)
        : file

      const formData = new FormData()
      formData.append('image', blob, 'receipt.jpg')

      const res = await fetch('/api/ai/scan-receipt', {
        method: 'POST',
        body:   formData,
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        const msg = data.error ?? 'Không nhận diện được hóa đơn.'
        setErrorMsg(msg)
        setStatus('error')
        return null
      }

      const scanResult: ScanResult = {
        amount:   data.amount   ?? null,
        date:     data.date     ?? null,
        category: data.category ?? 'other',
        title:    data.title    ?? '',
        note:     data.note     ?? '',
      }
      setResult(scanResult)
      setStatus('done')
      return scanResult

    } catch (err) {
      console.error('[useReceiptScan]', err)
      setErrorMsg('Lỗi kết nối. Vui lòng thử lại.')
      setStatus('error')
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setStatus('idle')
    setResult(null)
    setErrorMsg(null)
  }, [])

  return { status, result, errorMsg, scan, reset }
}
