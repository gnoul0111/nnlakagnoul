import type { Budget } from '@/lib/types/budget'

/**
 * In-memory budget cache — dùng chung giữa useBudget hook và providers preload.
 * Key: `${userId}_${YYYY-MM}`
 *
 * Tách ra module riêng để tránh circular dependency:
 *   providers → budgetCache ← useBudget
 */
export const budgetCache = new Map<string, Budget | null>()

export function budgetCacheKey(userId: string, monthKey: string): string {
  return `${userId}_${monthKey}`
}