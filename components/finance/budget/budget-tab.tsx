'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { Progress } from '@/components/ui/progress'
import { MonthPicker } from '@/components/dashboard/month-picker'
import { useBudget } from '@/hooks/useBudget'
import { usePeriod } from '@/hooks/usePeriod'
import { useMonthData } from '@/hooks/useAppData'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useAuthStore } from '@/lib/store/authStore'
import { useToast } from '@/hooks/useToast'
import { setBudget, getCategoryBudgets, setCategoryBudgets } from '@/lib/services/budgetService'
import { CATEGORIES } from '@/lib/types/expense'
import { getBudgetAlertLevel } from '@/lib/types/budget'
import type { CategoryBudgets } from '@/lib/types/budget'
import { formatMoney, parseAmount } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

const schema = z.object({
  spendingAmount: z.string().refine(v => parseAmount(v) >= 0, 'Không hợp lệ.'),
  savingsTarget:  z.string().refine(v => parseAmount(v) >= 0, 'Không hợp lệ.'),
})
type FormValues = z.infer<typeof schema>

export function BudgetTab() {
  const user        = useAuthStore(s => s.user)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const toast       = useToast()

  const { periodKey: currentMonth, range, label, goToPrev: goToPrevMonth, goToNext: goToNextMonth, goToToday, isCurrentPeriod: isCurrentMonth, isCycleMode } = usePeriod()
  const { budget, isLoading, refetch } = useBudget(currentMonth)
  const { spendingExpenses } = useMonthData(currentMonth, range)

  const [editing, setEditing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [catBudgets, setCatBudgets] = useState<CategoryBudgets>({})
  const catBudgetsCache = useRef<Record<string, CategoryBudgets>>({})
  const [catEditing, setCatEditing] = useState<string | null>(null)
  const [catInput, setCatInput]     = useState('')

  const spendingTotal = spendingExpenses.reduce((s, e) => s + e.amount, 0)
  const budgetAmount  = budget ? (budget.spendingAmount ?? budget.amount ?? 0) : 0
  const pct           = budgetAmount > 0 ? Math.min(100, Math.round((spendingTotal / budgetAmount) * 100)) : 0
  const level         = getBudgetAlertLevel(spendingTotal, budgetAmount)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (budget) reset({ spendingAmount: String(budget.spendingAmount ?? budget.amount ?? 0), savingsTarget: String(budget.savingsTarget ?? 0) })
    else reset({ spendingAmount: '0', savingsTarget: '0' })
  }, [budget])

  useEffect(() => {
    if (!user) return
    const key = `${user.uid}_${currentMonth}`
    if (catBudgetsCache.current[key]) {
      setCatBudgets(catBudgetsCache.current[key])
      return
    }
    getCategoryBudgets(user.uid, currentMonth).then(data => {
      catBudgetsCache.current[key] = data
      setCatBudgets(data)
    })
  }, [user?.uid, currentMonth])

  const onSubmit = async (values: FormValues) => {
    if (!user) return
    setSaving(true)
    try {
      await setBudget(user.uid, { month: currentMonth, spendingAmount: parseAmount(values.spendingAmount), savingsTarget: parseAmount(values.savingsTarget) })
      await refetch()
      setEditing(false)
      toast.success('Đã cập nhật ngân sách!')
    } catch (err) {
      console.error('[budget] submit failed:', err)
      toast.error('Không lưu được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const saveCatBudget = async (cat: string) => {
    if (!user) return
    const updated = { ...catBudgets, [cat]: parseAmount(catInput) }
    const previous = catBudgets
    // Optimistic update
    setCatBudgets(updated)
    try {
      await setCategoryBudgets(user.uid, currentMonth, updated)
      catBudgetsCache.current[`${user.uid}_${currentMonth}`] = updated
      setCatEditing(null)
      toast.success('Đã lưu ngân sách danh mục!')
    } catch (err) {
      console.error('[budget] saveCat failed:', err)
      // Rollback optimistic
      setCatBudgets(previous)
      toast.error('Không lưu được. Thử lại nhé.')
    }
  }

  const alertColors = { ok: 'text-success', warning: 'text-warning', danger: 'text-orange-500', over: 'text-destructive' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MonthPicker label={label} onPrev={goToPrevMonth} onNext={goToNextMonth} onToday={goToToday} isCurrentMonth={isCurrentMonth} />
        <Button size="sm" variant="outline" leftIcon={<Pencil className="w-3.5 h-3.5" />} onClick={() => setEditing(true)}>
          Chỉnh sửa
        </Button>
      </div>

      {/* Kỳ lương là dữ liệu mới — chưa kế thừa ngân sách tháng dương lịch cũ */}
      {isCycleMode && budgetAmount === 0 && (
        <p className="px-4 py-2.5 rounded-xl bg-primary/5 border border-primary/20 text-xs text-muted-foreground">
          Ngân sách theo kỳ lương là dữ liệu mới, cần thiết lập lại — chưa tự kế thừa từ tháng dương lịch.
        </p>
      )}

      {/* Budget overview card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Ngân sách tiêu dùng</h3>
          <span className={cn('text-sm font-bold', alertColors[level])}>{pct}%</span>
        </div>
        {budgetAmount > 0 ? (
          <>
            <Progress value={pct} level={level} />
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Ngân sách', value: budgetAmount, cls: 'text-foreground' },
                { label: 'Đã dùng', value: spendingTotal, cls: 'text-destructive' },
                { label: 'Còn lại', value: Math.max(0, budgetAmount - spendingTotal), cls: 'text-success' },
              ].map(item => (
                <div key={item.label} className="bg-muted/50 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={cn('text-sm font-bold mt-0.5', item.cls)}>{formatMoney(item.value, moneyHidden)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">Chưa đặt ngân sách — nhấn Chỉnh sửa để thiết lập</p>
        )}

        {budget?.savingsTarget ? (
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">Mục tiêu tiết kiệm</span>
            <span className={cn('text-sm font-semibold text-purple-500')}>{formatMoney(budget.savingsTarget, moneyHidden)}</span>
          </div>
        ) : null}
      </div>

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-card border border-border rounded-xl p-4 space-y-4">
          <h3 className="font-semibold text-foreground">Cập nhật ngân sách</h3>
          <FormField label="Ngân sách tiêu dùng (₫)" error={errors.spendingAmount?.message}>
            <AmountInput placeholder="5.000.000" {...register('spendingAmount')} />
          </FormField>
          <FormField label="Mục tiêu tiết kiệm (₫)" error={errors.savingsTarget?.message}>
            <AmountInput placeholder="1.000.000" {...register('savingsTarget')} />
          </FormField>
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" loading={saving}>Lưu</Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => setEditing(false)}>Hủy</Button>
          </div>
        </form>
      )}

      {/* Per-category budgets */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">Ngân sách theo danh mục</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Đặt giới hạn cho từng danh mục</p>
        </div>
        {CATEGORIES.map((cat, i) => {
          const catSpending = spendingExpenses.filter(e => e.category === cat.value).reduce((s, e) => s + e.amount, 0)
          const catBudget   = catBudgets[cat.value] ?? 0
          const catPct      = catBudget > 0 ? Math.min(100, Math.round((catSpending / catBudget) * 100)) : 0
          const catLevel    = getBudgetAlertLevel(catSpending, catBudget)
          return (
            <div key={cat.value} className={cn('px-4 py-3 space-y-2', i < CATEGORIES.length - 1 && 'border-b border-border/50')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.icon}</span>
                  <span className="text-sm font-medium text-foreground">{cat.label}</span>
                </div>
                {catEditing === cat.value ? (
                  <div className="flex items-center gap-1.5">
                    <AmountInput className="h-7 w-28 text-xs" placeholder="0" value={catInput}
                      onChange={e => setCatInput(e.target.value)} autoFocus />
                    <button onClick={() => saveCatBudget(cat.value)}
                      className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setCatEditing(cat.value); setCatInput(String(catBudget || '')) }}
                    className="text-xs text-primary hover:underline underline-offset-2">
                    {catBudget > 0 ? formatMoney(catBudget, moneyHidden) : '+ Đặt giới hạn'}
                  </button>
                )}
              </div>
              {catBudget > 0 && (
                <>
                  <Progress value={catPct} level={catLevel} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatMoney(catSpending, moneyHidden)}</span>
                    <span className={cn(catLevel !== 'ok' && alertColors[catLevel])}>{catPct}%</span>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}