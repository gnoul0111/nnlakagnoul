'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  today, thisMonth, prevMonth, nextMonth, formatMonthLabel, startOfMonth, endOfMonth,
  getSalaryCycleRange, prevCycle, nextCycle, cycleKeyToRange, formatCycleLabel,
} from '@/lib/utils/date'
import { useSettingsStore, selectIsCycleModeActive, selectSalaryDay } from '@/lib/store/settingsStore'

interface UsePeriodReturn {
  /** monthKey ("YYYY-MM") ở chế độ tháng dương lịch, hoặc cycleKey ("YYYY-MM-DD") ở chế độ kỳ lương */
  periodKey: string
  /** Khoảng ngày thực — luôn resolve sẵn, truyền thẳng vào budgetCalc/replay */
  range: { start: string; end: string }
  /** "Tháng 7/2026" hoặc "Kỳ lương 25/06 - 24/07" */
  label: string
  goToPrev: () => void
  goToNext: () => void
  goToToday: () => void
  isCurrentPeriod: boolean
  isCycleMode: boolean
}

/** Hook quản lý period picker — superset của useCurrentMonth, tự chuyển giữa
 *  tháng dương lịch / kỳ lương theo setting cycleModeEnabled + salaryDay. */
export function usePeriod(initialKey?: string): UsePeriodReturn {
  const isCycleMode = useSettingsStore(selectIsCycleModeActive)
  const salaryDay   = useSettingsStore(selectSalaryDay)

  const [periodKey, setPeriodKey] = useState<string>(
    initialKey ?? (isCycleMode ? getSalaryCycleRange(today(), salaryDay).cycleKey : thisMonth()),
  )

  // Bật/tắt cycle mode → nhảy về kỳ/tháng hiện tại (không cố giữ khoảng đang xem,
  // vì monthKey/cycleKey khác định dạng, không có ánh xạ 1-1 rõ ràng)
  const prevModeRef = useRef(isCycleMode)
  useEffect(() => {
    if (prevModeRef.current !== isCycleMode) {
      prevModeRef.current = isCycleMode
      setPeriodKey(
        isCycleMode
          ? getSalaryCycleRange(today(), salaryDay).cycleKey
          : thisMonth(),
      )
    }
  }, [isCycleMode, salaryDay])

  const goToPrev = useCallback(() => {
    setPeriodKey(k => (isCycleMode ? prevCycle(k, salaryDay) : prevMonth(k)))
  }, [isCycleMode, salaryDay])

  const goToNext = useCallback(() => {
    setPeriodKey(k => (isCycleMode ? nextCycle(k, salaryDay) : nextMonth(k)))
  }, [isCycleMode, salaryDay])

  const goToToday = useCallback(() => {
    setPeriodKey(
      isCycleMode
        ? getSalaryCycleRange(today(), salaryDay).cycleKey
        : thisMonth(),
    )
  }, [isCycleMode, salaryDay])

  const range = isCycleMode
    ? cycleKeyToRange(periodKey, salaryDay)
    : { start: startOfMonth(periodKey), end: endOfMonth(periodKey) }

  const todayKey = isCycleMode
    ? getSalaryCycleRange(today(), salaryDay).cycleKey
    : thisMonth()

  const label = isCycleMode ? formatCycleLabel(range.start, range.end) : formatMonthLabel(periodKey)

  return {
    periodKey,
    range: { start: range.start, end: range.end },
    label,
    goToPrev,
    goToNext,
    goToToday,
    isCurrentPeriod: periodKey === todayKey,
    isCycleMode,
  }
}
