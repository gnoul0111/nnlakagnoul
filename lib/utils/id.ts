/**
 * Generate ID với prefix dùng cho expense, income, goal, v.v.
 *
 * FIX ID-01: Thay timestamp + Math.random() (~31 bits entropy) bằng
 * crypto.randomUUID() (122 bits entropy, CSPRNG, browser + Node native).
 *
 * Format cũ: exp_lx2k4fabc   → predictable timestamp + weak random
 * Format mới: exp_550e8400-e29b-41d4-a716-446655440000 → unpredictable
 *
 * Backward compatible: prefix vẫn giữ nguyên, chỉ phần sau thay đổi.
 * Dữ liệu cũ trong Firestore không bị ảnh hưởng.
 */
export function generateId(prefix: string): string {
  const uuid = crypto.randomUUID()
  return `${prefix}_${uuid}`
}

// Convenience helpers — API không đổi, caller không cần sửa gì
export const newExpenseId  = () => generateId('exp')
export const newIncomeId   = () => generateId('inc')
export const newGoalId     = () => generateId('goal')
export const newDebtId     = () => generateId('debt')
export const newTemplateId = () => generateId('tpl')
export const newDepositId  = () => generateId('dep')
export const newPaymentId  = () => generateId('pay')
export const newWithdrawId = () => generateId('wd')
export const newAllocId    = () => generateId('alloc')
export const newEventId    = () => generateId('evt')