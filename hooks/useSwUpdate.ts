'use client'

import { useEffect } from 'react'
import { useSwUpdateStore } from '@/lib/store/swUpdateStore'

// Module-level flag — tránh setup listener nhiều lần khi hook được gọi ở nhiều component
let _initialized = false

// ─── Grace period cho post-update race condition ─────────────────────────────
//
// PROBLEM: Sau khi user bấm "Cập nhật" → postMessage(SKIP_WAITING) →
// controllerchange fire → reload(). Nhưng browser quirk (cả Chrome & Safari):
// state transition `waiting → active` có thể lag vài trăm ms sau controllerchange.
// Nếu reload xảy ra trong gap này, page load lại thấy `reg.waiting != null`
// (SW cũ tạm thời vẫn trong state waiting dù SW mới đã thực sự active).
// → Hook detect false positive → UI hiện "Có phiên bản mới!" dù vừa update xong.
//
// FIX: Set flag `sw-just-updated-ts` trong sessionStorage TRƯỚC khi reload.
// Sau reload, nếu flag còn trong window GRACE_PERIOD_MS → skip detection,
// đợi hết grace period rồi mới re-check. Đủ thời gian để browser transition xong.
//
// Nếu sau grace period VẪN thấy reg.waiting → đây là update thực sự (vd deploy
// mới diễn ra ngay sau update trước), hiện badge bình thường.
// ──────────────────────────────────────────────────────────────────────────────
const JUST_UPDATED_KEY = 'sw-just-updated-ts'
const GRACE_PERIOD_MS  = 15_000

function getJustUpdatedAge(): number {
  if (typeof sessionStorage === 'undefined') return Infinity
  const raw = sessionStorage.getItem(JUST_UPDATED_KEY)
  const ts  = raw ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(ts)) return Infinity
  return Date.now() - ts
}

function clearJustUpdated(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(JUST_UPDATED_KEY)
}

function markJustUpdated(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(JUST_UPDATED_KEY, Date.now().toString())
}

/**
 * Hook khởi tạo SW update detection.
 * Gọi 1 lần trong AppLayout — sau đó mọi component đọc từ useSwUpdateStore trực tiếp.
 *
 * Cách hoạt động:
 * - Khi có SW mới trong trạng thái `waiting` → đặt hasUpdate = true (trừ trong grace period)
 * - Badge "MỚI" hiện trên Settings nav
 * - User bấm "Cập nhật ngay" trong Data tab → gửi SKIP_WAITING → reload
 */
export function useSwUpdate() {
  const { setHasUpdate, setRegistration } = useSwUpdateStore()

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (_initialized) return
    _initialized = true

    const ageAtMount   = getJustUpdatedAge()
    const inGraceMount = ageAtMount < GRACE_PERIOD_MS

    // Helper: flag hasUpdate nếu KHÔNG đang trong grace period.
    // Gọi từ `updatefound` listener — cho update xảy ra sau khi app đã mount.
    const maybeFlagHasUpdate = () => {
      if (getJustUpdatedAge() < GRACE_PERIOD_MS) {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[sw-update] Trong grace period — skip setHasUpdate(true)')
        }
        return
      }
      setHasUpdate(true)
    }

    navigator.serviceWorker.ready.then(reg => {
      setRegistration(reg)

      if (process.env.NODE_ENV !== 'production') {
        console.info('[sw-update] ready', {
          hasWaiting:    !!reg.waiting,
          hasInstalling: !!reg.installing,
          hasActive:     !!reg.active,
          inGracePeriod: inGraceMount,
          graceAgeMs:    Number.isFinite(ageAtMount) ? Math.round(ageAtMount) : null,
        })
      }

      if (reg.waiting) {
        if (inGraceMount) {
          // Đang trong grace → schedule re-check sau khi hết grace
          const remaining = GRACE_PERIOD_MS - ageAtMount + 500 // +500ms safety
          setTimeout(() => {
            clearJustUpdated()
            if (reg.waiting) {
              if (process.env.NODE_ENV !== 'production') {
                console.info('[sw-update] Sau grace, reg.waiting vẫn tồn tại → flag update thật')
              }
              setHasUpdate(true)
            } else if (process.env.NODE_ENV !== 'production') {
              console.info('[sw-update] Sau grace, reg.waiting = null → OK, update sạch')
            }
          }, remaining)
        } else {
          // Không trong grace → flag ngay
          setHasUpdate(true)
        }
      } else {
        // Không có waiting → clear flag nếu còn (cold start không cần grace)
        clearJustUpdated()
      }

      // Listener cho updates TƯƠNG LAI
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            maybeFlagHasUpdate()
          }
        })
      })
    }).catch(() => {/* SW không có — bỏ qua */})

    // Kiểm tra update định kỳ mỗi 1 giờ
    const interval = setInterval(() => {
      navigator.serviceWorker.ready
        .then(reg => reg.update())
        .catch(() => {})
    }, 60 * 60 * 1000)

    return () => clearInterval(interval)
  }, [setHasUpdate, setRegistration])
}

/**
 * Áp dụng SW update: gửi SKIP_WAITING → reload trang.
 * Dùng trong Data tab khi user bấm "Cập nhật ngay".
 */
export function useApplySwUpdate() {
  const { registration, setHasUpdate, setApplying } = useSwUpdateStore()

  return () => {
    // Bật loading overlay NGAY — UX anh muốn thấy app load ngay khi bấm Cập nhật
    setApplying(true)

    // Không có SW waiting → reload thôi (fallback an toàn)
    if (!registration?.waiting) {
      markJustUpdated() // đánh dấu để hook sau reload bỏ qua race state
      window.location.reload()
      return
    }

    // Guard để đảm bảo CHỈ reload 1 lần duy nhất
    let reloaded = false
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null

    const doReload = () => {
      if (reloaded) return
      reloaded = true
      if (fallbackTimer) clearTimeout(fallbackTimer)
      // QUAN TRỌNG: đánh dấu grace period TRƯỚC reload để hook mới biết
      markJustUpdated()
      window.location.reload()
    }

    // BƯỚC 1: Đăng ký listener TRƯỚC khi gửi postMessage
    // Vì clientsClaim: true → SW mới có thể active + fire controllerchange
    // siêu nhanh ngay sau postMessage. Nếu đăng ký listener sau sẽ miss event.
    navigator.serviceWorker.addEventListener('controllerchange', doReload, { once: true })

    // BƯỚC 2: Fallback — nếu event không fire trong 3 giây thì force reload
    // (ví dụ: SW đã active rồi, hoặc browser không fire event đúng spec)
    fallbackTimer = setTimeout(doReload, 3000)

    // BƯỚC 3: Gửi message → SW skipWaiting → active → fire controllerchange
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    setHasUpdate(false)
  }
}
