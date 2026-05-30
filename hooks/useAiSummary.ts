'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { authHeader } from '@/lib/auth/getIdToken'
import { useAppData, useMonthData } from './useAppData'
import { useBudget } from './useBudget'
import { calcCashflow, calcCategorySpending } from '@/lib/utils/budgetCalc'
import { computeTotalDeposited } from '@/lib/types/savings'
import { isDebtOverdue, isDebtUpcoming, computeRemaining } from '@/lib/types/debt'
import { today, thisMonth } from '@/lib/utils/date'
import type { FinanceSummaryInput } from '@/app/api/ai/finance-summary/route'

export type SummaryStatus = 'idle' | 'loading' | 'done' | 'error'
export type TtsStatus     = 'idle' | 'loading' | 'speaking' | 'paused'

// In-session cache per monthKey — clears on page refresh, avoids repeated API calls
const summaryCache = new Map<string, string>()

export function useAiSummary(monthKey: string) {
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>('idle')
  const [summary,       setSummary]       = useState<string | null>(null)
  const [summaryError,  setSummaryError]  = useState<string | null>(null)
  const [ttsStatus,     setTtsStatus]     = useState<TtsStatus>('idle')

  const utteranceRef  = useRef<SpeechSynthesisUtterance | null>(null)
  const heartbeatRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioRef      = useRef<HTMLAudioElement | null>(null)
  // Mỗi lần speak/stop tăng id này. Fetch TTS xong mà id đã đổi → bỏ qua (chống audio cũ phát chồng).
  const ttsReqIdRef   = useRef(0)

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
    // FIX: dùng computeRemaining() (tính lại từ payments — source of truth) thay cho
    // d.paidAmount (field "KHÔNG tin tưởng", có thể stale = 0 → ra nợ gốc thay vì còn lại).
    // Chỉ tính nợ type 'borrow' (tôi đang nợ) — khớp với cách tab Nợ hiển thị "Tôi đang nợ".
    const totalDebtRemaining = debts
      .filter(d => !d.deleted && d.type === 'borrow')
      .reduce((sum, d) => sum + computeRemaining(d), 0)

    const alertDebts = debts
      .filter(d => !d.deleted && (isDebtOverdue(d, todayStr) || isDebtUpcoming(d, todayStr)))
      .map(d => ({
        name:      d.name,
        remaining: computeRemaining(d),
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
    // Vô hiệu hóa mọi fetch TTS đang bay → audio cũ về sẽ không phát
    ttsReqIdRef.current++
    // Dừng Audio element (Google Cloud TTS)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    // Dừng browser TTS nếu đang dùng fallback
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
      const headers = await authHeader()
      const res  = await fetch('/api/ai/finance-summary', {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
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

  // ─── TTS — Google Cloud Neural2 với fallback browser ─────────────────────────

  const speak = useCallback(async (text: string) => {
    if (typeof window === 'undefined') return

    stopSpeech()             // dừng audio cũ + tăng reqId (mọi fetch cũ sẽ bị bỏ)
    const myId = ttsReqIdRef.current
    setTtsStatus('loading')  // stopSpeech vừa set 'idle' → đặt lại 'loading'

    try {
      // Gọi API server để lấy audio từ Google Cloud TTS Neural2
      const headers = await authHeader()
      const res = await fetch('/api/ai/tts', {
        method:  'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      })

      // Trong lúc fetch, user đã bấm Dừng / Đọc lại → bỏ kết quả này
      if (ttsReqIdRef.current !== myId) return

      if (!res.ok) throw new Error(`TTS API ${res.status}`)

      const { audio, mimeType } = await res.json()
      if (ttsReqIdRef.current !== myId) return

      const audioSrc = `data:${mimeType};base64,${audio}`
      const el = new Audio(audioSrc)
      audioRef.current = el
      el.onended  = () => setTtsStatus('idle')
      el.onerror  = () => setTtsStatus('idle')
      await el.play()
      setTtsStatus('speaking')

    } catch {
      // User đã dừng trong lúc fetch → không fallback
      if (ttsReqIdRef.current !== myId) return
      // Fallback: browser SpeechSynthesis khi API không khả dụng
      if (!window.speechSynthesis) { setTtsStatus('idle'); return }

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang  = 'vi-VN'
      utterance.rate  = 0.95

      const voices = window.speechSynthesis.getVoices()
      const viVoice = voices.find(v => v.lang === 'vi-VN') ?? voices.find(v => v.lang.startsWith('vi'))
      if (viVoice) utterance.voice = viVoice

      utterance.onstart = () => setTtsStatus('speaking')
      utterance.onend   = () => { stopHeartbeat(); setTtsStatus('idle') }
      utterance.onerror = () => { stopHeartbeat(); setTtsStatus('idle') }
      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
      setTtsStatus('speaking')

      // Heartbeat giữ browser TTS không bị ngắt giữa chừng trên một số browser
      heartbeatRef.current = setInterval(() => {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        }
      }, 13000)
    }
  }, [stopSpeech, stopHeartbeat])

  const pauseSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setTtsStatus('paused')
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause()
      setTtsStatus('paused')
    }
  }, [])

  const resumeSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => setTtsStatus('idle'))
      setTtsStatus('speaking')
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume()
      setTtsStatus('speaking')
    }
  }, [])

  const hasTts = true // Google Cloud TTS luôn available khi đã login

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
