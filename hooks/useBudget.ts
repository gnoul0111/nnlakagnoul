'use client'

import { useState, useEffect, useRef } from 'react'
import { getBudget }    from '@/lib/services/budgetService'
import { budgetCache, budgetCacheKey } from '@/lib/cache/budgetCache'
import type { Budget }  from '@/lib/types/budget'
import { useAuthStore } from '@/lib/store/authStore'

/**
 * useBudget — load budget theo tháng với in-memory cache.
 *
 * - Đã có cache → trả về ngay (isLoading = false), revalidate background 1 lần
 * - Chưa có cache → fetch Firestore, show loading
 * - Khi toggle tháng qua lại: cache hit → không bị chớp loading
 */
export function useBudget(monthKey: string) {
  const user = useAuthStore(s => s.user)
  const key  = user ? budgetCacheKey(user.uid, monthKey) : null

  const cached   = key !== null ? budgetCache.get(key) : undefined
  const hasCache = cached !== undefined

  const [budget,    setBudget]    = useState<Budget | null>(cached ?? null)
  const [isLoading, setIsLoading] = useState(!hasCache)
  const revalidatedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user || !key) return

    const cached = budgetCache.get(key)

    // Cache hit → render ngay, revalidate background
    if (cached !== undefined) {
      setBudget(cached)
      setIsLoading(false)

      if (revalidatedRef.current !== key) {
        revalidatedRef.current = key
        let cancelled = false
        getBudget(user.uid, monthKey)
          .then(fresh => { if (!cancelled) { budgetCache.set(key, fresh); setBudget(fresh) } })
          .catch(err => console.warn('[useBudget] revalidate failed:', err))
        return () => { cancelled = true }
      }
      return
    }

    // Cache miss → full fetch
    let cancelled = false
    setIsLoading(true)
    revalidatedRef.current = key

    getBudget(user.uid, monthKey)
      .then(b => {
        if (cancelled) return
        budgetCache.set(key, b)
        setBudget(b)
        setIsLoading(false)
      })
      .catch(err => {
        console.error('[useBudget] fetch failed:', err)
        if (!cancelled) { budgetCache.set(key, null); setIsLoading(false) }
      })

    return () => { cancelled = true }
  }, [user?.uid, monthKey, key])

  const refetch = async () => {
    if (!user || !key) return
    const b = await getBudget(user.uid, monthKey)
    budgetCache.set(key, b)
    setBudget(b)
  }

  const invalidate = () => { if (key) budgetCache.delete(key) }

  return { budget, isLoading, refetch, invalidate }
}