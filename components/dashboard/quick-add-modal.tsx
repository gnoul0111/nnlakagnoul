'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { DatePicker } from '@/components/ui/date-picker'
import { useAppend } from '@/hooks/useAppend'
import { useToast } from '@/hooks/useToast'
import { newExpenseId, newIncomeId } from '@/lib/utils/id'
import { today, getMonthFromDateString } from '@/lib/utils/date'
import { CATEGORIES, type CategoryValue } from '@/lib/types/expense'
import { EVENT_TYPES } from '@/lib/types/events'
import { parseAmount } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'

// ─── Schema ───────────────────────────────────────────────────────────────────

// ─── Shared validators (BUG-02, BUG-03, BUG-04, BUG-05) ─────────────────────

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
  date:     dateSchema,
  // expense only
  category: z.string().optional(),
  // income only
  source: z.string().max(100, 'Nguồn thu tối đa 100 ký tự.').optional(),
})

type FormValues = z.infer<typeof schema>
type TabType = 'expense' | 'income'

// ─── Component ────────────────────────────────────────────────────────────────

interface QuickAddModalProps {
  open: boolean
  onClose: () => void
  defaultDate?: string
  defaultTab?: "expense" | "income"
}

export function QuickAddModal({ open, onClose, defaultDate, defaultTab = 'expense' }: QuickAddModalProps) {
  const { append, isPending } = useAppend()
  const toast = useToast()
  const [tab, setTab] = useState<TabType>(defaultTab)

  // Sync tab với defaultTab mỗi khi modal mở — vì useState chỉ dùng initial value 1 lần,
  // nếu user bấm "Chi tiêu" → đóng → bấm "Thu nhập", tab phải cập nhật lại.
  useEffect(() => {
    if (open) setTab(defaultTab)
  }, [open, defaultTab])
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>('food')

  // BUG-01 fix: isSubmitting tự disable button trong toàn bộ onSubmit
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: defaultDate ?? today() },
  })

  const handleClose = () => { reset(); onClose() }

  const onSubmit = async (values: FormValues) => {
    const amount = parseAmount(values.amount)
    const date   = values.date

    if (tab === 'expense') {
      await append(EVENT_TYPES.EXPENSE_ADDED, {
        id: newExpenseId(),
        amount,
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
        {/* Tab switch */}
        <div className="flex bg-muted rounded-lg p-1 mt-2">
          {(['expense', 'income'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground',
              )}
            >
              {t === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'}
            </button>
          ))}
        </div>

        {/* Category grid (expense only) */}
        {tab === 'expense' && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Danh mục</p>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setSelectedCategory(cat.value)}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-xl border text-xs font-medium transition-colors',
                    selectedCategory === cat.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:bg-muted text-muted-foreground',
                  )}
                >
                  <span className="text-xl">{cat.icon}</span>
                  <span className="leading-tight text-center">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Income source */}
        {tab === 'income' && (
          <FormField label="Nguồn thu">
            <Input placeholder="Lương, Freelance, ..." {...register('source')} />
          </FormField>
        )}

        {/* Amount */}
        <FormField label="Số tiền" error={errors.amount?.message} required>
          <AmountInput
            placeholder="0"
            className="text-lg font-semibold"
            autoFocus
            {...register('amount')}
          />
        </FormField>

        {/* Date + note row */}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ngày" error={errors.date?.message} required>
            <DatePicker value={watch('date')} onChange={v => setValue('date', v)} />
          </FormField>
          <FormField label="Ghi chú">
            <Input placeholder="Tùy chọn" {...register('note')} />
          </FormField>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting || isPending}>
          Lưu
        </Button>
      </form>
    </Modal>
  )
}