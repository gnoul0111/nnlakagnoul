'use client'

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

type AmountInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toDigits = (v: unknown): string => {
  if (v === undefined || v === null || v === '') return ''
  return String(v).replace(/\D/g, '')
}

const format = (digits: string): string => {
  if (!digits) return ''
  return parseInt(digits, 10).toLocaleString('vi-VN')
}

// Cache native getter/setter của HTMLInputElement.prototype.value một lần lúc module load.
// Dùng để đọc/ghi native [[value]] slot, bypass JS property override.
// Guard typeof để tránh crash khi chạy SSR (Node không có HTMLInputElement).
const _nativeDesc =
  typeof HTMLInputElement !== 'undefined'
    ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    : undefined

/**
 * AmountInput — input số tiền tự format theo locale vi-VN (111.111).
 *
 * Hỗ trợ cả 2 pattern:
 * 1. Controlled:  <AmountInput value={x} onChange={...} />
 * 2. RHF:         <AmountInput {...register('amount')} />
 *
 * ─── Cơ chế hoạt động ────────────────────────────────────────────────────────
 *
 * Component dùng Object.defineProperty để override el.value:
 *
 *   GETTER → gọi native prototype getter → trả native [[value]] slot.
 *            Trả về đúng thứ browser đang giữ (= formatted string sau khi
 *            React/setter đã ghi). React đọc getter và thấy nó khớp với
 *            prop value={display} → KHÔNG có mismatch → controlled input ổn định.
 *
 *   SETTER → called bởi React (el.value = display) hoặc RHF (el.value = rawDigits).
 *            Parse digits → cập nhật raw state → ghi formatted vào native slot
 *            qua native setter. Nhờ vậy browser luôn hiển thị số có dấu chấm.
 *
 * handleChange: e.target.value gọi getter → native slot → chuỗi user vừa gõ
 * (browser đã cập nhật slot trước khi bắn event) → strip non-digits → newRaw.
 * Không cần bypass getter vì getter trả đúng native slot.
 *
 * RHF integration: onChange truyền syntheticEvent với value = newRaw (digits thuần).
 * RHF lưu nội bộ = rawDigits. Zod validate rawDigits = OK. parseAmount = OK.
 *
 * RHF reset/setValue: RHF set el.value = rawDigits → setter → setRaw + native slot.
 * Component re-render, display update, user thấy formatted. Không cần Controller.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ onChange, onBlur, value, defaultValue, className, placeholder = '0', ...rest }, forwardedRef) => {
    const innerRef = useRef<HTMLInputElement | null>(null)

    // `raw` = source of truth (digits thuần, vd "200000"). display = format(raw).
    const [raw, setRaw] = useState<string>(() => toDigits(value ?? defaultValue))
    const rawRef = useRef<string>(raw)
    rawRef.current = raw

    const isControlled = value !== undefined

    // Controlled mode: sync raw khi parent thay đổi value prop
    useEffect(() => {
      if (isControlled) setRaw(toDigits(value))
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, isControlled])

    // ── Override getter + setter — chạy 1 lần lúc mount ──────────────────────
    useEffect(() => {
      const el = innerRef.current
      if (!el || !_nativeDesc?.get || !_nativeDesc?.set) return

      const nativeGet = _nativeDesc.get
      const nativeSet = _nativeDesc.set

      // FIX: Đọc native value TRƯỚC KHI cài setter.
      // Khi reset() được gọi trước khi modal mở (AmountInput chưa mount),
      // RHF set el.value = rawDigits qua native setter (chưa có setter tùy chỉnh).
      // Sau khi mount, useEffect này chạy — nếu không đọc trước, native value
      // "25000000" sẽ không bao giờ được format lại → input hiển thị số thô.
      const existingNative = nativeGet.call(el)

      Object.defineProperty(el, 'value', {
        configurable: true,

        // GETTER: trả native [[value]] slot (formatted string).
        // → React đọc getter, so sánh với prop display → MATCH → no infinite loop.
        // → e.target.value trong handleChange cũng qua đây → nhận native slot
        //   = chuỗi user vừa gõ (browser đã update slot trước khi fire event).
        get() {
          return nativeGet.call(el)
        },

        // SETTER: called bởi React (el.value = "200.000") hoặc RHF (el.value = "200000").
        // Trong cả 2 trường hợp: parse digits → update state → ghi formatted vào native.
        set(v: unknown) {
          const digits = toDigits(v)
          rawRef.current = digits
          setRaw(digits)
          // Ghi formatted vào native slot → browser render đúng, React nhất quán
          nativeSet.call(el, format(digits))
        },
      })

      // FIX: Sau khi setter được cài, re-format native value nếu cần.
      // Scenario: RHF đã ghi "25000000" qua native setter trước khi useEffect này chạy.
      // Lúc này existingNative = "25000000" (thô), cần format lại thành "25.000.000".
      if (existingNative) {
        const digits = toDigits(existingNative)
        if (digits && format(digits) !== existingNative) {
          rawRef.current = digits
          setRaw(digits)
          nativeSet.call(el, format(digits))
        }
      }

      return () => {
        try { delete (el as unknown as { value?: unknown }).value } catch { /* no-op */ }
      }
    }, [])

    // ── Forward ref ───────────────────────────────────────────────────────────
    const setRef = useCallback((el: HTMLInputElement | null) => {
      innerRef.current = el
      if (typeof forwardedRef === 'function') {
        forwardedRef(el)
      } else if (forwardedRef) {
        forwardedRef.current = el
      }
    }, [forwardedRef])

    // ── handleChange ──────────────────────────────────────────────────────────
    // e.target.value → getter → nativeGet.call(el) → native slot
    // = chính xác chuỗi user vừa gõ/paste (browser update slot trước khi fire event).
    // Strip non-digits để lấy raw. Gửi raw lên RHF qua syntheticEvent.
    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      // e.target.value đi qua getter của chúng ta → trả native slot → OK
      const newRaw = e.target.value.replace(/\D/g, '')
      rawRef.current = newRaw
      setRaw(newRaw)

      if (onChange) {
        const syntheticEvent = {
          ...e,
          target:        { ...e.target,        value: newRaw, name: e.target.name },
          currentTarget: { ...e.currentTarget, value: newRaw, name: e.currentTarget.name },
        } as React.ChangeEvent<HTMLInputElement>
        onChange(syntheticEvent)
      }
    }, [onChange])

    // Display string — rendered ra input, React dùng để sync controlled value
    const display = format(raw)

    return (
      <input
        ref={setRef}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn(
          'flex h-12 md:h-10 w-full rounded-lg border border-input bg-background px-3 py-2',
          'text-base md:text-sm text-foreground placeholder:text-muted-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    )
  },
)

AmountInput.displayName = 'AmountInput'