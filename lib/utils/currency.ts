/**
 * Currency utilities — VND (₫), không có decimal, locale vi-VN
 */

// ─── Format ───────────────────────────────────────────────────────────────────

/** Format số tiền VND: 1500000 → "1.500.000 ₫" */
export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Format không có ký hiệu ₫: 1500000 → "1.500.000" */
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Format compact: 1500000 → "1,5M" */
export function formatCompact(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1).replace('.0', '')}B`
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace('.0', '')}M`
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K`
  }
  return formatAmount(amount)
}

/** Ẩn số tiền — thay bằng "••••" */
export const HIDDEN_AMOUNT = '••••'

export function formatHidden(): string {
  return HIDDEN_AMOUNT
}

/** Format có thể ẩn */
export function formatMoney(amount: number, hidden: boolean): string {
  if (hidden) return HIDDEN_AMOUNT
  return formatVND(amount)
}

// ─── Parse ────────────────────────────────────────────────────────────────────

/**
 * Parse chuỗi người dùng nhập vào thành số nguyên VND.
 * Cho phép dấu chấm hoặc phẩy làm separator.
 * "1.500.000" → 1500000
 * "1,500,000" → 1500000
 * "1500000"   → 1500000
 */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[.,\s]/g, '')
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? 0 : num  // BUG-02 fix: bỏ Math.abs() — giữ nguyên dấu âm để Zod detect
}

/** Validate: amount phải là số dương */
export function isValidAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0
}

// ─── % helpers ────────────────────────────────────────────────────────────────

/** Tính % và clamp 0–100 */
export function percentage(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(Math.round((value / total) * 100), 100)
}

/** Format %: 75 → "75%" */
export function formatPercent(pct: number): string {
  return `${pct}%`
}