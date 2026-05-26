'use client'

import { useEffect, useCallback } from 'react'
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
import { useSettingsStore, selectHiddenCategories } from '@/lib/store/settingsStore'
import { useAuthStore } from '@/lib/store/authStore'
import { CATEGORIES, type CategoryValue, type Expense } from '@/lib/types/expense'
import { EVENT_TYPES } from '@/lib/types/events'
import { newExpenseId } from '@/lib/utils/id'
import { today } from '@/lib/utils/date'
import { parseAmount } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'
import type { ScanResult } from '@/hooks/useReceiptScan'

// ─── Validators ───────────────────────────────────────────────────────────────

const amountSchema = z.string()
  .min(1, 'Nhập số tiền.')
  .refine(v => !v.trimStart().startsWith('-'), 'Số tiền không được âm.')   // BUG-02
  .refine(v => parseAmount(v) > 0,            'Số tiền phải lớn hơn 0.')  // BUG-02
  .refine(v => parseAmount(v) <= 999_000_000, 'Tối đa 999.000.000 ₫.')    // BUG-03

const dateSchema = z.string()
  .min(1, 'Chọn ngày.')
  .refine(v => {                                                            // BUG-05
    const d = new Date(v)
    return !isNaN(d.getTime()) && d >= new Date('2000-01-01') && d <= new Date('2099-12-31')
  }, 'Ngày không hợp lệ.')

const schema = z.object({
  amount:   amountSchema,
  date:     dateSchema,
  note:     z.string().max(500, 'Ghi chú tối đa 500 ký tự.').optional(), // BUG-04
  title:    z.string().max(100, 'Tiêu đề tối đa 100 ký tự.').optional(), // BUG-04
  category: z.string().min(1, 'Chọn danh mục.'),
})
type FormValues = z.infer<typeof schema>

interface ExpenseFormModalProps {
  open: boolean
  onClose: () => void
  editExpense?: Expense | null
  copyFrom?: Expense | null
  defaultDate?: string
}

export function ExpenseFormModal({ open, onClose, editExpense, copyFrom, defaultDate }: ExpenseFormModalProps) {
  const { append, isPending } = useAppend()
  const toast  = useToast()
  const user   = useAuthStore(s => s.user)
  const hidden = useSettingsStore(selectHiddenCategories)
  const visibleCats = CATEGORIES.filter(c => !hidden.includes(c.value))

  // BUG-01 fix: isSubmitting covers cả append() lẫn các async ops khác
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: defaultDate ?? today(), category: 'food' },
  })
  const selectedCategory = watch('category') as CategoryValue

  useEffect(() => {
    if (editExpense) {
      reset({
        amount:   String(editExpense.amount),
        date:     editExpense.date,
        note:     editExpense.note,
        title:    editExpense.title ?? '',
        category: editExpense.category,
      })
    } else if (copyFrom) {
      reset({
        amount:   String(copyFrom.amount),
        date:     today(),
        note:     copyFrom.note,
        title:    copyFrom.title ?? '',
        category: copyFrom.category,
      })
    } else {
      reset({ date: defaultDate ?? today(), category: 'food' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editExpense, copyFrom, open, defaultDate])

  // Nhận kết quả từ AI scanner và fill vào form
  // QUAN TRỌNG: dùng useCallback để tránh re-create mỗi render.
  // AmountInput nhận raw digits string (vd: "150000") — setter nội bộ tự format thành "150.000".
  const handleScanResult = useCallback((result: ScanResult) => {
    if (result.amount !== null) setValue('amount', String(result.amount))
    if (result.date)            setValue('date',   result.date)
    if (result.category)        setValue('category', result.category)
    if (result.title)           setValue('title',  result.title)
    if (result.note)            setValue('note',   result.note)
  }, [setValue])

  const onSubmit = async (values: FormValues) => {
    const amount = parseAmount(values.amount)
    // FIX: userId BẮT BUỘC phải có trong data.
    // Nếu thiếu → expense được lưu với userId = undefined trong replayedState
    // → ownership check (state.expenses[idx].userId === event.userId) luôn fail
    // → EXPENSE_DELETED / EXPENSE_UPDATED không có tác dụng, toast hiện nhưng UI không đổi.
    const userId = user?.uid ?? ''

    try {
      if (editExpense) {
        // FIX: Trước đây dùng updateExpense() + sync() — SAI vì:
        //   1. updateExpense() gọi appendEvent() trực tiếp → không có optimistic update
        //      → UI không phản hồi ngay, user tưởng bấm không được
        //   2. sync() sau đó có thể miss event do CLOCK_SKEW_BUFFER_MS = 30s hoặc
        //      App Check token chưa ready → Firestore read fail → state không cập nhật
        //
        // Sau: dùng append() như add và delete — đảm bảo:
        //   - Optimistic update ngay lập tức (appendLocalEvent)
        //   - Rollback nếu Firestore write fail (removeLocalEvent)
        //   - Sync delta sau khi confirmed
        await append(EVENT_TYPES.EXPENSE_UPDATED, {
          id:       editExpense.id,
          userId,
          amount,
          category: values.category as CategoryValue,
          date:     values.date,
          note:     values.note  ?? '',
          title:    values.title ?? '',
        })
        toast.success('Đã cập nhật chi tiêu!')
      } else {
        await append(EVENT_TYPES.EXPENSE_ADDED, {
          id:       newExpenseId(),
          userId,
          amount,
          category: values.category as CategoryValue,
          date:     values.date,
          note:     values.note  ?? '',
          title:    values.title ?? '',
          _debtId: null, _goalId: null, _savingsMonthKey: null,
          _paymentId: null, _depositId: null, _savingsDepositId: null,
        })
        toast.success(copyFrom ? 'Đã sao chép chi tiêu!' : 'Đã thêm chi tiêu!')
      }
      onClose()
    } catch (err) {
      console.error('[expense-form] submit failed:', err)
      toast.error('Không lưu được. Kiểm tra kết nối rồi thử lại.')
    }
  }

  return (
    <Modal variant="center" open={open} onClose={onClose}
      title={editExpense ? 'Sửa chi tiêu' : copyFrom ? 'Sao chép chi tiêu' : 'Thêm chi tiêu'}>
      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
        {/* Category grid */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Danh mục</p>
          <div className="grid grid-cols-4 gap-2">
            {visibleCats.map(cat => (
              <button key={cat.value} type="button" onClick={() => setValue('category', cat.value)}
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
          {errors.category && <p className="text-xs text-destructive mt-1">{errors.category.message}</p>}
        </div>

        {/* AI Receipt Scanner — sau danh mục, trước form fields; ẩn khi copy */}
        {!copyFrom && (
          <ReceiptScanner onResult={handleScanResult} disabled={isSubmitting} />
        )}

        <FormField label="Số tiền (₫)" error={errors.amount?.message} required>
          <AmountInput placeholder="0" autoFocus {...register('amount')} />
        </FormField>

        <FormField label="Tiêu đề">
          <Input placeholder="VD: Ăn trưa, Xăng xe..." {...register('title')} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ngày" error={errors.date?.message} required>
            <DatePicker value={watch('date')} onChange={v => setValue('date', v)} />
          </FormField>
          <FormField label="Ghi chú">
            <Input placeholder="Tùy chọn" {...register('note')} />
          </FormField>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          {editExpense ? 'Lưu thay đổi' : 'Thêm chi tiêu'}
        </Button>
      </form>
    </Modal>
  )
}