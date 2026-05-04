'use client'

import { useState, useCallback } from 'react'
import { thisMonth, prevMonth, nextMonth } from '@/lib/utils/date'

interface UseCurrentMonthReturn {
  currentMonth: string         // YYYY-MM
  setCurrentMonth: (m: string) => void
  goToPrevMonth: () => void
  goToNextMonth: () => void
  goToToday: () => void
  isCurrentMonth: boolean
}

/** Hook quản lý month picker — dùng ở Dashboard, Finance, Analytics */
export function useCurrentMonth(initialMonth?: string): UseCurrentMonthReturn {
  const [currentMonth, setCurrentMonth] = useState<string>(
    initialMonth ?? thisMonth(),
  )

  const goToPrevMonth = useCallback(() => {
    setCurrentMonth(m => prevMonth(m))
  }, [])

  const goToNextMonth = useCallback(() => {
    setCurrentMonth(m => nextMonth(m))
  }, [])

  const goToToday = useCallback(() => {
    setCurrentMonth(thisMonth())
  }, [])

  const isCurrentMonth = currentMonth === thisMonth()

  return {
    currentMonth,
    setCurrentMonth,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    isCurrentMonth,
  }
}
