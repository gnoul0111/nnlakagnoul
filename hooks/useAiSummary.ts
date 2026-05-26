'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useAppData, useMonthData } from './useAppData'
import { useBudget } from './useBudget'
import { calcCashflow, calcCategorySpending } from '@/lib/utils/budgetCalc'
import { computeTotalDeposited } from '@/lib/types/savings'
import { isDebtOverdue, isDebtUpcoming } from '@/lib/types/debt'
import { today, thisMonth } from '@/lib/utils/date'
import type { FinanceSummaryInput } from '@/app/api/ai/finance-summary/route'

export type SummaryStatus = 'idle' | 'loading' | 'done' | 'error'
export type TtsStatus     = 'idle' | 'speaking' | 'paused'

// In-session cache per monthKey — clears on page refresh, avoids repeated API calls
const summaryCache = new Map<string, string>()

export function useAiSummary(monthKey: string) {
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle')
  const [summary,       setSummary]       = useState<string | null>(null)
  const [summaryError,  setSummaryError]  = useState<string | null>(null)
  const [ttsStatus,     setTtsStatus]     = useState<TtsStatus>('idle')

  const utteranceRef  = useRef<SpeechSynthesisUtterance | null>(null)
  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Data ────────────────────────────────────────────────────────────────────
  const { expenses, allIncomes: incomes, debts, goals } = useAppData()
  const { monthIncomes, savingsPlan, spendingExpenses }  = useMonthData(monthKey)
  const { budget } = useBudget(monthKey)

  const financialData = useMemo((): FinanceSummaryInput => {
    const cashflow     = calcCashflow(expenses, incomes, debts, goals, savingsPlan, monthKey)
    const budgetAmount = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0

    // ── Thời gian ──────────────────────────────────────────────────────────────
    const [yearN, monthN] = monthKey.split('-').map(Number)
    const daysInMonth     = new Date(yearN, monthN, 0).getDate()
    const isCurrentMonth  = monthKey === thisMonth()
    const daysElapsed     = isCurrentMonth
      ? parseInt(today().split('-')[2], 10)
      : daysInMonth

    // ── Chi tiêu ───────────────────────────────────────────────────────────────
    const spendingTotal   = cashflow.spendingTotal
    const budgetPercent   = budgetAmount > 0
      ? Math.round((spendingTotal / budgetAmount) * 100) : 0
    const remainingBudget = budgetAmount > 0 ? budgetAmount - spendingTotal : 0
    const avgDailySpend   = daysElapsed > 0 ? spendingTotal / daysElapsed : 0
    const projectedSpend  = avgDailySpend * daysInMonth
    const totalTransactions = spendingExpenses.length

    // ── Danh mục (tất cả, không chỉ top 4) ────────────────────────────────────
    const allCategories = calcCategorySpending(expenses, monthKey)
      .filter(c => c.amount > 0)
      .map(c => ({
        category:          c.category,
        amount:            c.amount,
        percentOfSpending: c.percent,
        percentOfIncome:   cashflow.totalIncome > 0
          ? Math.round((c.amount / cashflow.totalIncome) * 100)
          : 0,
      }))

    // ── Tiết kiệm ──────────────────────────────────────────────────────────────
    const savingsDeposited = savingsPlan ? computeTotalDeposited(savingsPlan) : 0
    const savingsTarget    = savingsPlan?.targetAmount ?? 0
    const savingsPercent   = savingsTarget > 0
      ? Math.round((savingsDeposited / savingsTarget) * 100) : 0

    // ── Nợ ─────────────────────────────────────────────────────────────────────
    const todayStr = today()
    const totalDebtRemaining = debts
      .filter(d => !d.deleted)
      .reduce((sum, d) => sum + Math.max(0, d.amount - (d.paidAmount ?? 0)), 0)

    const alertDebts = debts
      .filter(d => !d.deleted && (isDebtOverdue(d, todayStr) || isDebtUpcoming(d, todayStr)))
      .map(d => ({
        name:      d.name,
        remaining: d.amount - (d.paidAmount ?? 0),
        dueDate:   d.dueDate ?? null,
        type:      d.type as string,
      }))

    // ── Month label ────────────────────────────────────────────────────────────
    const [year, month] = monthKey.split('-')
    const monthLabel = `tháng ${parseInt(month)}/${year}`

    return {
      monthLabel,
      isCurrentMonth,
      daysInMonth,
      daysElapsed,
      totalIncome:      cashflow.totalIncome,
      spendingTotal,
      budgetAmount,
      budgetPercent,
      remainingBudget,
      avgDailySpend,
      projectedSpend,
      totalTransactions,
      allCategories,
      savingsDeposited,
      savingsTarget,
      savingsPercent,
      debtPaidTotal:      cashflow.debtPaidTotal,
      totalDebtRemaining,
      netBalance:         cashflow.netBalance,
      alertDebts,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, incomes, debts, goals, savingsPlan, spendingExpenses, budget, monthKey])

  // ─── TTS helpers ─────────────────────────────────────────────────────────────

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  const stopSpeech = useCallback(() => {
    stopHeartbeat()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setTtsStatus('idle')
  }, [stopHeartbeat])

  // ─── Generate summary ────────────────────────────────────────────────────────

  const generateSummary = useCallback(async (force = false) => {
    if (!force) {
      const cached = summaryCache.get(monthKey)
      if (cached) {
        setSummary(cached)
        setSummaryStatus('done')
        return
      }
    } else {
      summaryCache.delete(monthKey)
    }

    setSummaryStatus('loading')
    setSummaryError(null)
    stopSpeech()

    try {
      const res  = await fetch('/api/ai/finance-summary', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(financialData),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setSummaryError(data.error ?? 'Không tạo được tóm tắt.')
        setSummaryStatus('error')
        return
      }

      summaryCache.set(monthKey, data.summary)
      setSummary(data.summary)
      setSummaryStatus('done')
    } catch {
      setSummaryError('Lỗi kết nối. Vui lòng thử lại.')
      setSummaryStatus('error')
    }
  }, [financialData, stopSpeech, monthKey])

  // ─── TTS ─────────────────────────────────────────────────────────────────────

  const speak = useCallback(async (text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    stopSpeech()

    const utterance  = new SpeechSynthesisUtterance(text)
    utterance.lang   = 'vi-VN'
    utterance.rate   = 1.15
    utterance.pitch  = 1.0

    const voices = await new Promise<SpeechSynthesisVoice[]>(resolve => {
      const v = window.speechSynthesis.getVoices()
      if (v.length > 0) { resolve(v); return }
      const tid = setTimeout(() => {
        window.speechSynthesis.onvoiceschanged = null
        resolve([])
      }, 1500)
      window.speechSynthesis.onvoiceschanged = () => {
        clearTimeout(tid)
        window.speechSynthesis.onvoiceschanged = null
        resolve(window.speechSynthesis.getVoices())
      }
    })

    const viVoice = voices.find(v => v.lang === 'vi-VN') ?? voices.find(v => v.lang.startsWith('vi'))
    if (viVoice) utterance.voice = viVoice

    utterance.onstart  = () => setTtsStatus('speaking')
    utterance.onend    = () => { stopHeartbeat(); setTtsStatus('idle') }
    utterance.onpause  = () => setTtsStatus('paused')
    utterance.onresume = () => setTtsStatus('speaking')
    utterance.onerror  = () => { stopHeartbeat(); setTtsStatus('idle') }

    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setTtsStatus('speaking')

    heartbeatRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 13000)
  }, [stopSpeech, stopHeartbeat])

  const pauseSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.pause()
    setTtsStatus('paused')
  }, [])

  const resumeSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    window.speechSynthesis.resume()
    setTtsStatus('speaking')
  }, [])

  const hasTts = typeof window !== 'undefined' && !!window.speechSynthesis

  return {
    summaryStatus,
    summary,
    summaryError,
    generateSummary,
    ttsStatus,
    hasTts,
    speak,
    pauseSpeech,
    resumeSpeech,
    stopSpeech,
  }
}
