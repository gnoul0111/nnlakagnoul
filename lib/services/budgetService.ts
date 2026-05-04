import { Timestamp } from 'firebase/firestore'
import { COLLECTIONS, getDocument, setDocument, updateDocument } from '@/lib/firebase/firestore'
import type { Budget, BudgetInput } from '@/lib/types/budget'

// Budget document ID = {userId}_{YYYY-MM}
function budgetDocId(userId: string, month: string): string {
  return `${userId}_${month}`
}

// ─── Get budget for a month ───────────────────────────────────────────────────

export async function getBudget(userId: string, month: string): Promise<Budget | null> {
  const docId = budgetDocId(userId, month)
  const budget = await getDocument<Budget>(COLLECTIONS.BUDGETS, docId)
  if (!budget) return null

  // Normalize: ưu tiên spendingAmount, fallback sang amount (schema cũ)
  return {
    ...budget,
    spendingAmount: budget.spendingAmount ?? budget.amount ?? 0,
  }
}

// ─── Set / update budget ─────────────────────────────────────────────────────

export async function setBudget(userId: string, input: BudgetInput): Promise<void> {
  const docId = budgetDocId(userId, input.month)
  const existing = await getDocument<Budget>(COLLECTIONS.BUDGETS, docId)
  const now = Timestamp.now()

  if (existing) {
    await updateDocument(COLLECTIONS.BUDGETS, docId, {
      spendingAmount: input.spendingAmount,
      amount: input.spendingAmount, // giữ backward compat
      savingsTarget: input.savingsTarget,
      updatedAt: now,
    })
  } else {
    await setDocument(COLLECTIONS.BUDGETS, docId, {
      userId,
      month: input.month,
      amount: input.spendingAmount,
      spendingAmount: input.spendingAmount,
      savingsTarget: input.savingsTarget,
      createdAt: now,
      updatedAt: now,
    })
  }
}

// ─── Per-category budgets (lưu trong user_settings) ──────────────────────────
// Đây chỉ là service helper — actual read/write qua settingsService để tránh
// duplicate logic. Budget tab sẽ dùng useSettingsStore.

import { COLLECTIONS as C } from '@/lib/firebase/firestore'
import type { CategoryBudgets } from '@/lib/types/budget'

export async function getCategoryBudgets(
  userId: string,
  month: string,
): Promise<CategoryBudgets> {
  const docId = userId
  const snap = await getDocument<Record<string, unknown>>(C.USER_SETTINGS, docId)
  if (!snap) return {}
  const key = `cat-budgets-${month}` as const
  return (snap[key] as CategoryBudgets) ?? {}
}

export async function setCategoryBudgets(
  userId: string,
  month: string,
  budgets: CategoryBudgets,
): Promise<void> {
  const key = `cat-budgets-${month}`
  await updateDocument(C.USER_SETTINGS, userId, { [key]: budgets })
}
