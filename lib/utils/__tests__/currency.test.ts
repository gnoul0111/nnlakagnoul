/**
 * QA Test Suite — Currency Utilities
 *
 * Covers:
 *   - formatVND, formatAmount, formatCompact
 *   - parseAmount
 *   - percentage
 *
 * Key edge cases:
 *   - Billion boundary rounding (BUG-03: 999_999_999 → should be "1B" not "1000M")
 *   - .replace('.0', '') fragility  (BUG-04: must use regex)
 *   - parseAmount with separators / negatives / NaN input
 *   - percentage clamp at 100
 */

import {
  formatVND,
  formatAmount,
  formatCompact,
  parseAmount,
  isValidAmount,
  percentage,
} from '../currency'

// ─── formatVND ────────────────────────────────────────────────────────────────

describe('formatVND', () => {
  test('formats 1_500_000 with ₫ symbol and Vietnamese locale', () => {
    const result = formatVND(1_500_000)
    expect(result).toContain('1')
    expect(result).toContain('500')
    expect(result).toContain('000')
    // Must include the currency symbol or VND code
    expect(result.includes('₫') || result.includes('VND') || result.includes('đ')).toBe(true)
  })

  test('formats 0 without decimal digits', () => {
    const result = formatVND(0)
    expect(result).not.toContain('.')
    expect(result).not.toContain(',') // no decimal comma either
  })

  test('large amounts: 1_000_000_000', () => {
    const result = formatVND(1_000_000_000)
    expect(result).toContain('1')
    expect(result).toContain('000')
  })
})

// ─── formatCompact ────────────────────────────────────────────────────────────

describe('formatCompact', () => {
  // Thousands
  test('1_000 → "1K"', () => {
    expect(formatCompact(1_000)).toBe('1K')
  })

  test('1_500 → "2K" (rounded)', () => {
    // 1500 / 1000 = 1.5 → toFixed(0) rounds to "2"
    expect(formatCompact(1_500)).toBe('2K')
  })

  test('999 → formatted as plain amount (below 1K)', () => {
    const result = formatCompact(999)
    expect(result).not.toContain('K')
    expect(result).not.toContain('M')
    expect(result).not.toContain('B')
  })

  // Millions
  test('1_000_000 → "1M"', () => {
    expect(formatCompact(1_000_000)).toBe('1M')
  })

  test('1_500_000 → "1.5M"', () => {
    expect(formatCompact(1_500_000)).toBe('1.5M')
  })

  test('2_000_000 → "2M" (.0 stripped)', () => {
    expect(formatCompact(2_000_000)).toBe('2M')
  })

  test('10_000_000 → "10M"', () => {
    expect(formatCompact(10_000_000)).toBe('10M')
  })

  // BUG-03: billion boundary — 999_999_999 must NOT become "1000M"
  // toFixed(1) on 999.999... rounds up to "1000.0" which should become "1B"
  test('999_999_999 → "1B" not "1000M" (boundary rounding fix)', () => {
    const result = formatCompact(999_999_999)
    expect(result).not.toBe('1000M')
    // After fix: triggers the billion branch → "1B"
    expect(result).toBe('1B')
  })

  // Billions
  test('1_000_000_000 → "1B"', () => {
    expect(formatCompact(1_000_000_000)).toBe('1B')
  })

  test('1_500_000_000 → "1.5B"', () => {
    expect(formatCompact(1_500_000_000)).toBe('1.5B')
  })

  test('2_000_000_000 → "2B" (.0 stripped)', () => {
    expect(formatCompact(2_000_000_000)).toBe('2B')
  })

  // BUG-04: .replace('.0', '') must use regex /\.0$/ not string '.0'
  // "10.0" → "10" ✓,  "100.0" → "100" ✓,  "1.05" must NOT become "1.5"
  test('1_050_000 → "1.1M" (not "1.5M" — fragile replace guard)', () => {
    // 1_050_000 / 1_000_000 = 1.05 → toFixed(1) = "1.1" → no .0 → "1.1M"
    expect(formatCompact(1_050_000)).toBe('1.1M')
  })

  test('zero → formatted as plain (not "0K")', () => {
    const result = formatCompact(0)
    expect(result).not.toContain('K')
    expect(result).not.toContain('M')
    expect(result).not.toContain('B')
  })
})

// ─── parseAmount ──────────────────────────────────────────────────────────────

describe('parseAmount', () => {
  test('"1500000" → 1500000', () => {
    expect(parseAmount('1500000')).toBe(1_500_000)
  })

  test('"1.500.000" (Vietnamese dot separator) → 1500000', () => {
    expect(parseAmount('1.500.000')).toBe(1_500_000)
  })

  test('"1,500,000" (comma separator) → 1500000', () => {
    expect(parseAmount('1,500,000')).toBe(1_500_000)
  })

  test('"  500 000  " (spaces) → 500000', () => {
    expect(parseAmount('  500 000  ')).toBe(500_000)
  })

  test('empty string → 0', () => {
    expect(parseAmount('')).toBe(0)
  })

  test('non-numeric string → 0', () => {
    expect(parseAmount('abc')).toBe(0)
  })

  test('"0" → 0', () => {
    expect(parseAmount('0')).toBe(0)
  })
})

// ─── isValidAmount ────────────────────────────────────────────────────────────

describe('isValidAmount', () => {
  test('positive integer → valid', () => {
    expect(isValidAmount(1_000)).toBe(true)
  })

  test('zero → invalid', () => {
    expect(isValidAmount(0)).toBe(false)
  })

  test('negative → invalid', () => {
    expect(isValidAmount(-1_000)).toBe(false)
  })

  test('NaN → invalid', () => {
    expect(isValidAmount(NaN)).toBe(false)
  })

  test('Infinity → invalid', () => {
    expect(isValidAmount(Infinity)).toBe(false)
  })
})

// ─── percentage ───────────────────────────────────────────────────────────────

describe('percentage', () => {
  test('50 of 100 → 50', () => {
    expect(percentage(50, 100)).toBe(50)
  })

  test('rounds correctly: 1 of 3 → 33', () => {
    expect(percentage(1, 3)).toBe(33)
  })

  test('clamps at 100: 150 of 100 → 100', () => {
    expect(percentage(150, 100)).toBe(100)
  })

  test('total = 0 → 0 (division guard)', () => {
    expect(percentage(100, 0)).toBe(0)
  })

  test('total negative → 0 (guard)', () => {
    expect(percentage(100, -500)).toBe(0)
  })

  test('0 of 100 → 0', () => {
    expect(percentage(0, 100)).toBe(0)
  })
})