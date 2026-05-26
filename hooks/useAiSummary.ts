'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { useAppData, useMonthData } from './useAppData'
import { useBudget } from './useBudget'
import { calcCashflow, calcCategorySpending } from '@/lib/utils/budgetCalc'
import { computeTotalDeposited } from '@/lib/types/savings'
import { isDebtOverdue, isDebtUpcoming } from '@/lib/types/debt'
import { today } from '@/lib/utils/date'
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
  const { monthIncomes, savingsPlan }  = useMonthData(monthKey)
  const { budget } = useBudget(monthKey)

  const financialData = useMemo((): FinanceSummaryInput => {
    const cashflow      = calcCashflow(expenses, incomes, debts, goals, savingsPlan, monthKey)
    const budgetAmount  = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0
    const budgetPercent = budgetAmount > 0
      ? Math.round((cashflow.spendingTotal / budgetAmount) * 100)
      : 0

    const topCategories = calcCategorySpending(expenses, monthKey).slice(0, 4).map(c => ({
      category: c.category,
      amount:   c.amount,
      percent:  c.percent,
    }))

    const todayStr   = today()
    const alertDebts = debts
      .filter(d => !d.deleted && (isDebtOverdue(d, todayStr) || isDebtUpcoming(d, todayStr)))
      .map(d => ({
        name:      d.name,
        remaining: d.amount - (d.paidAmount ?? 0),
        dueDate:   d.dueDate ?? null,
        type:      d.type as string,
      }))

    const [year, month] = monthKey.split('-')
    const monthLabel = `tháng ${parseInt(month)}/${year}`

    return {
      monthLabel,
      totalIncome:      cashflow.totalIncome,
      spendingTotal:    cashflow.spendingTotal,
      budgetAmount,
      budgetPercent,
      savingsDeposited: savingsPlan ? computeTotalDeposited(savingsPlan) : 0,
      savingsTarget:    savingsPlan?.targetAmount ?? 0,
      debtPaidTotal:    cashflow.debtPaidTotal,
      netBalance:       cashflow.netBalance,
      topCategories,
      alertDebts,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, incomes, debts, goals, savingsPlan, budget, monthKey])

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

  // force=true: bỏ qua cache và tạo lại (dùng cho nút "Tạo lại")
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

    // getVoices() trả về mảng rỗng ngay khi trang load trên PC/Chrome.
    // Phải chờ voiceschanged event để có danh sách giọng đầy đủ.
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

    // Chrome bug: speech stops after ~15s for long text. Heartbeat workaround.
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
    // Summary
    summaryStatus,
    summary,
    summaryError,
    generateSummary,
    // TTS
    ttsStatus,
    hasTts,
    speak,
    pauseSpeech,
    resumeSpeech,
    stopSpeech,
  }
}
