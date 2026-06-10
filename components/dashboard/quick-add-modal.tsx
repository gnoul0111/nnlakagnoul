'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { DatePicker } from '@/components/ui/date-picker'
import { ReceiptScanner } from '@/components/ai/ReceiptScanner'
import { useAppend } from '@/hooks/useAppend'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectHiddenCategories, selectMoneyHidden } from '@/lib/store/settingsStore'
import { newExpenseId, newIncomeId } from '@/lib/utils/id'
import { today, getMonthFromDateString } from '@/lib/utils/date'
import { CATEGORIES, type CategoryValue } from '@/lib/types/expense'
import { EVENT_TYPES } from '@/lib/types/events'
import { parseAmount } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'
import type { ScanResult } from '@/hooks/useReceiptScan'

const amountSchema = z.string()
  .min(1, 'Nhập số tiền.')
  .refine(v => !v.trimStart().startsWith('-'), 'Số tiền không được âm.')
  .refine(v => parseAmount(v) > 0,            'Số tiền phải lớn hơn 0.')
  .refine(v => parseAmount(v) <= 999_000_000, 'Tối đa 999.000.000 ₫.')

const dateSchema = z.string()
  .min(1, 'Chọn ngày.')
  .refine(v => {
    const d = new Date(v)
    return !isNaN(d.getTime()) && d >= new Date('2000-01-01') && d <= new Date('2099-12-31')
  }, 'Ngày không hợp lệ.')

const schema = z.object({
  amount:   amountSchema,
  note:     z.string().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
  title:    z.string().max(100, 'Tiêu đề tối đa 100 ký tự.').optional(),
  date:     dateSchema,
  category: z.string().optional(),
  // income: required để nhất quán với Finance module; fallback 'Thu nhập' nếu rỗng
  source:   z.string().min(1, 'Nhập nguồn thu.').max(100, 'Nguồn thu tối đa 100 ký tự.').optional(),
})

type FormValues = z.infer<typeof schema>
type TabType = 'expense' | 'income'

interface QuickAddModalProps {
  open: boolean
  onClose: () => void
  defaultDate?: string
  defaultTab?: 'expense' | 'income'
}

export function QuickAddModal({ open, onClose, defaultDate, defaultTab = 'expense' }: QuickAddModalProps) {
  const { append, isPending } = useAppend()
  const toast = useToast()
  const user  = useAuthStore(s => s.user)
  const hiddenCategories = useSettingsStore(selectHiddenCategories)
  const [tab, setTab] = useState<TabType>(defaultTab)
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>('food')
  // Dùng CATEGORIES đã lọc — nhất quán với ExpenseFormModal trong Finance module
  const visibleCats = CATEGORIES.filter(c => !hiddenCategories.includes(c.value))

  // FIX defaultTab: useState chỉ dùng initial value 1 lần.
  // Nếu user bấm "Thu nhập" → đóng modal → bấm "Chi tiêu", tab phải reset lại đúng.
  useEffect(() => {
    if (open) setTab(defaultTab)
  }, [open, defaultTab])

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    unregister,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: defaultDate ?? today() },
  })

  const handleTabChange = (newTab: TabType) => {
    if (newTab === 'expense') unregister('source')
    setTab(newTab)
  }

  const handleClose = () => { reset(); onClose() }

  // Nhận kết quả từ AI scanner — QuickAddModal dùng setSelectedCategory (useState)
  // thay vì setValue('category'), nên phải handle cả 2 setter.
  const handleScanResult = useCallback((result: ScanResult) => {
    if (result.amount !== null) setValue('amount', String(result.amount))
    if (result.date)            setValue('date',   result.date)
    if (result.category)        setSelectedCategory(result.category as CategoryValue)
    if (result.title)           setValue('title',  result.title)
    if (result.note)            setValue('note',   result.note)
  }, [setValue])

  const onSubmit = async (values: FormValues) => {
    const amount = parseAmount(values.amount)
    const date   = values.date

    // FIX: userId BẮT BUỘC phải có trong data của event.
    // Nếu thiếu → expense/income được push vào state với userId = undefined
    // → ownership check trong replay (state.expenses[idx].userId === event.userId)
    //   luôn fail (undefined !== 'uid') → EXPENSE_DELETED / EXPENSE_UPDATED bị bỏ qua
    // → delete/edit chạy xong, toast hiện, nhưng UI không đổi gì cả.
    const userId = user?.uid ?? ''

    if (tab === 'expense') {
      await append(EVENT_TYPES.EXPENSE_ADDED, {
        id: newExpenseId(),
        userId,
        amount,
        title:    values.title ?? '',
        category: selectedCategory,
        date,
        note: values.note ?? '',
        _debtId: null, _goalId: null, _savingsMonthKey: null,
        _paymentId: null, _depositId: null, _savingsDepositId: null,
      })
      toast.success('Đã thêm chi tiêu!')
    } else {
      await append(EVENT_TYPES.INCOME_ADDED, {
        id: newIncomeId(),
        userId,
        amount,
        source: values.source || 'Thu nhập',
        date,
        month: getMonthFromDateString(date),
        note: values.note ?? '',
      })
      toast.success('Đã thêm thu nhập!')
    }

    reset({ date: today() })
    setSelectedCategory('food')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Thêm nhanh" variant="center">
      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
        {/* Tab switch — luôn hiện đầu tiên để user chọn loại */}
        <div className="flex bg-muted rounded-lg p-1">
          {(['expense', 'income'] as const).map(t => (
            <button key={t} type="button" onClick={() => handleTabChange(t)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground',
              )}>
              {t === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'}
            </button>
          ))}
        </div>

        {/* AI Receipt Scanner — chỉ Chi tiêu */}
        {tab === 'expense' && (
          <ReceiptScanner onResult={handleScanResult} disabled={isSubmitting || isPending} />
        )}

        {/* Danh mục — chỉ Chi tiêu */}
        {tab === 'expense' && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Danh mục</p>
            <div className="grid grid-cols-4 gap-2">
              {visibleCats.map(cat => (
                <button key={cat.value} type="button" onClick={() => setSelectedCategory(cat.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-medium transition-colors',
                    selectedCategory === cat.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted text-muted-foreground',
                  )}>
                  <span className="text-xl">{cat.icon}</span>
                  <span className="leading-tight text-center">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'expense' && (
          <FormField label="Tiêu đề" error={errors.title?.message}>
            <Input placeholder="VD: Ăn trưa, Xăng xe..." {...register('title')} />
          </FormField>
        )}

        {tab === 'income' && (
          <FormField label="Nguồn thu" error={errors.source?.message} required>
            <Input placeholder="Lương, Freelance, ..." {...register('source')} />
          </FormField>
        )}

        <FormField label="Số tiền (₫)" error={errors.amount?.message} required>
          <AmountInput placeholder="0" autoFocus {...register('amount')} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ngày" error={errors.date?.message} required>
            <DatePicker value={watch('date')} onChange={v => setValue('date', v)} />
          </FormField>
          <FormField label="Ghi chú">
            <Input placeholder="Tùy chọn" {...register('note')} />
          </FormField>
        </div>

        <Button type="submit" variant="gradient" className="w-full" size="lg" loading={isSubmitting || isPending}>
          {tab === 'expense' ? 'Thêm chi tiêu' : 'Thêm thu nhập'}
        </Button>
      </form>
    </Modal>
  )
}