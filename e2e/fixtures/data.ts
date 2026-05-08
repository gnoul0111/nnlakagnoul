/**
 * e2e/fixtures/data.ts
 * Deterministic test data for E2E specs.
 * All amounts in VND (integers).
 */

import type { CategoryValue } from '@/lib/types/expense'

export const TODAY = new Date().toISOString().slice(0, 10)

export const EXPENSE_FIXTURES = {
  /** Simple food expense — used by create-expense spec */
  basic: {
    amount:   '150000',
    category: 'food' as CategoryValue,
    note:     `E2E basic ${Date.now()}`,
    date:     TODAY,
  },

  /** Large amount near max — used for boundary tests */
  nearMax: {
    amount:   '999000000',
    category: 'other' as CategoryValue,
    note:     `E2E near-max ${Date.now()}`,
    date:     TODAY,
  },

  /** Transport expense for category-breakdown tests */
  transport: {
    amount:   '50000',
    category: 'transport' as CategoryValue,
    note:     `E2E transport ${Date.now()}`,
    date:     TODAY,
  },

  /** Expense with title — used to verify BUG-A (title data loss) fix */
  withTitle: {
    amount:   '200000',
    category: 'shopping' as CategoryValue,
    note:     `E2E title-test ${Date.now()}`,
    title:    `Mua sắm E2E ${Date.now()}`,
    date:     TODAY,
  },
} as const

// Validation error fixtures
export const INVALID_INPUTS = {
  zeroAmount:     { amount: '0',           expectedError: /lớn hơn 0/i },
  negativeAmount: { amount: '-100',         expectedError: /không được âm/i },
  overMaxAmount:  { amount: '1000000000',   expectedError: /tối đa/i },
  emptyAmount:    { amount: '',             expectedError: /nhập số tiền/i },
  textAmount:     { amount: 'abc',          expectedError: /lớn hơn 0/i },
  futureDate:     { date: '2100-01-01',     expectedError: /không hợp lệ/i },
} as const
