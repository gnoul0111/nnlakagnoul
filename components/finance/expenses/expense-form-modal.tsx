'use client'

import { useEffect, useCallback } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { AmountInput } from '@/components/ui/amount-input'
import { DatePicker } from '@/components/ui/date-picker'
import { CategorySelect } from '@/components/ui/category-select'
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
  .refine(v => !v.trimStart().startsWith('-'), 'Số tiền không được âm.')
  .refine(v => parseAmount(v) > 0,            'Số tiền phải lớn hơn 0.')
  .refine(v => parseAmount(v) <= 999_000_000, 'Tối đa 999.000.000 ₫.')

const dateSchema = z.string()
  .min(1, 'Chọn ngày.')
  .refine(v => {
    const d = new Date(v)
    return !isNaN(d.getTime()) && d >= new Date('2000-01-01') && d <= new Date('2099-12-31')
  }, 'Ngày không hợp lệ.')

// Schema cho 1 khoản trong multi-entry
const entrySchema = z.object({
  amount:   amountSchema,
  category: z.string().min(1, 'Chọn danh mục.'),
  title:    z.string().max(100, 'Tiêu đề tối đa 100 ký tự.').optional(),
  date:     dateSchema,
  note:     z.string().max(500, 'Ghi chú tối đa 500 ký tự.').optional(),
})

// Schema multi-entry (add mode)
const multiSchema = z.object({
  entries: z.array(entrySchema).min(1),
})
type MultiFormValues = z.infer<typeof multiSchema>

// Schema single-entry (edit / copy mode)
const singleSchema = z.object({
  amount:   amountSchema,
  date:     dateSchema,
  note:     z.string().max(500).optional(),
  title:    z.string().max(100).optional(),
  category: z.string().min(1, 'Chọn danh mục.'),
})
type SingleFormValues = z.infer<typeof singleSchema>

interface ExpenseFormModalProps {
  open: boolean
  onClose: () => void
  editExpense?: Expense | null
  copyFrom?: Expense | null
  defaultDate?: string
}

// ─── Multi-entry Add Form ─────────────────────────────────────────────────────

function MultiEntryForm({
  onClose,
  defaultDate,
}: {
  onClose: () => void
  defaultDate?: string
}) {
  const { appendBackgroundBatch } = useAppend()
  const toast   = useToast()
  const user    = useAuthStore(s => s.user)
  const hidden  = useSettingsStore(selectHiddenCategories)

  const defaultEntry = { amount: '', category: 'food', title: '', date: defaultDate ?? today(), note: '' }

  const { control, register, handleSubmit, setValue, watch, reset, getValues, formState: { errors, isSubmitting } } = useForm<MultiFormValues>({
    resolver: zodResolver(multiSchema),
    defaultValues: { entries: [defaultEntry] },
  })

  const { fields, append: appendField, remove } = useFieldArray({ control, name: 'entries' })

  // Reset khi modal mở
  useEffect(() => {
    reset({ entries: [{ ...defaultEntry, date: defaultDate ?? today() }] })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDate])

  // Mỗi ScanResult → 1 entry. Nếu entry đầu rỗng thì điền vào đó, còn lại append.
  const handleMultiScanResult = useCallback((results: ScanResult[]) => {
    if (results.length === 0) return
    const first = getValues('entries.0')
    const firstEmpty = !first?.amount && !first?.title

    if (firstEmpty && results[0]) {
      const r = results[0]
      setValue('entries.0.amount',   r.amount !== null ? String(r.amount) : '')
      setValue('entries.0.date',     r.date ?? today())
      setValue('entries.0.category', r.category)
      setValue('entries.0.title',    r.title)
      setValue('entries.0.note',     r.note)
    }

    const rest = firstEmpty ? results.slice(1) : results
    if (rest.length > 0) {
      appendField(
        rest.map(r => ({
          amount:   r.amount !== null ? String(r.amount) : '',
          category: r.category,
          title:    r.title,
          date:     r.date ?? today(),
          note:     r.note,
        })),
        { shouldFocus: false },
      )
    }
  }, [getValues, setValue, appendField])

  const onSubmit = (values: MultiFormValues) => {
    const userId = user?.uid ?? ''
    const batch = values.entries.map(entry => ({
      eventType: EVENT_TYPES.EXPENSE_ADDED,
      data: {
        id:       newExpenseId(),
        userId,
        amount:   parseAmount(entry.amount),
        category: entry.category as CategoryValue,
        date:     entry.date,
        note:     entry.note  ?? '',
        title:    entry.title ?? '',
        _debtId: null, _goalId: null, _savingsMonthKey: null,
        _paymentId: null, _depositId: null, _savingsDepositId: null,
      } as Record<string, unknown>,
    }))
    appendBackgroundBatch(batch)
    const n = batch.length
    toast.success(n === 1 ? 'Đã thêm chi tiêu!' : `Đã thêm ${n} khoản chi tiêu!`)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
      {/* AI Scanner — mỗi ảnh → 1 khoản riêng */}
      <ReceiptScanner multiple onMultiResult={handleMultiScanResult} disabled={isSubmitting} />

      {/* Danh sách khoản */}
      <div className="space-y-3">
        {fields.map((field, i) => {
          const entryErrors = errors.entries?.[i]
          const catValue = (watch(`entries.${i}.category`) ?? 'food') as CategoryValue
          return (
            // key=field.id (KHÔNG dùng i) → AmountInput giữ đúng state khi xoá giữa
            <div key={field.id} className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
              {/* Header dòng: số thứ tự + nút xoá */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Khoản {i + 1}
                </span>
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category */}
              <CategorySelect
                value={catValue}
                onChange={v => setValue(`entries.${i}.category`, v)}
                hidden={hidden}
              />
              {entryErrors?.category && (
                <p className="text-xs text-destructive">{entryErrors.category.message}</p>
              )}

              {/* Tiêu đề */}
              <FormField label="Tiêu đề">
                <Input placeholder="VD: Ăn trưa, Xăng xe..." {...register(`entries.${i}.title`)} />
              </FormField>

              {/* Số tiền */}
              <FormField label="Số tiền (₫)" error={entryErrors?.amount?.message} required>
                <AmountInput placeholder="0" {...register(`entries.${i}.amount`)} />
              </FormField>

              {/* Ngày + Ghi chú */}
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Ngày" error={entryErrors?.date?.message} required>
                  <DatePicker
                    value={watch(`entries.${i}.date`)}
                    onChange={v => setValue(`entries.${i}.date`, v)}
                  />
                </FormField>
                <FormField label="Ghi chú">
                  <Input placeholder="Tùy chọn" {...register(`entries.${i}.note`)} />
                </FormField>
              </div>
            </div>
          )
        })}
      </div>

      {/* Thêm khoản */}
      <button
        type="button"
        onClick={() => appendField({ ...defaultEntry, date: today() }, { shouldFocus: false })}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
      >
        <Plus className="w-4 h-4" />
        Thêm khoản
      </button>

      {/* Submit */}
      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={isSubmitting}>
        {fields.length === 1 ? 'Thêm chi tiêu' : `Lưu ${fields.length} khoản`}
      </Button>
    </form>
  )
}

// ─── Single-entry Edit / Copy Form ───────────────────────────────────────────

function SingleEntryForm({
  onClose,
  editExpense,
  copyFrom,
  defaultDate,
}: {
  onClose: () => void
  editExpense?: Expense | null
  copyFrom?: Expense | null
  defaultDate?: string
}) {
  const { appendBackground } = useAppend()
  const toast   = useToast()
  const user    = useAuthStore(s => s.user)
  const hidden  = useSettingsStore(selectHiddenCategories)
  const visibleCats = CATEGORIES.filter(c => !hidden.includes(c.value))

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<SingleFormValues>({
    resolver: zodResolver(singleSchema),
    defaultValues: { date: defaultDate ?? today(), category: 'food' },
  })
  const selectedCategory = watch('category') as CategoryValue

  useEffect(() => {
    if (editExpense) {
      reset({ amount: String(editExpense.amount), date: editExpense.date, note: editExpense.note, title: editExpense.title ?? '', category: editExpense.category })
    } else if (copyFrom) {
      reset({ amount: String(copyFrom.amount), date: today(), note: copyFrom.note, title: copyFrom.title ?? '', category: copyFrom.category })
    } else {
      reset({ date: defaultDate ?? today(), category: 'food' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editExpense, copyFrom, defaultDate])

  const handleScanResult = useCallback((result: ScanResult) => {
    if (result.amount !== null) setValue('amount', String(result.amount))
    if (result.date)            setValue('date', result.date)
    if (result.category)        setValue('category', result.category)
    if (result.title)           setValue('title', result.title)
    if (result.note)            setValue('note', result.note)
  }, [setValue])

  const onSubmit = (values: SingleFormValues) => {
    const amount = parseAmount(values.amount)
    const userId = user?.uid ?? ''

    if (editExpense) {
      appendBackground(EVENT_TYPES.EXPENSE_UPDATED, {
        id: editExpense.id, userId, amount,
        category: values.category as CategoryValue,
        date: values.date, note: values.note ?? '', title: values.title ?? '',
      })
      toast.success('Đã cập nhật chi tiêu!')
    } else {
      appendBackground(EVENT_TYPES.EXPENSE_ADDED, {
        id: newExpenseId(), userId, amount,
        category: values.category as CategoryValue,
        date: values.date, note: values.note ?? '', title: values.title ?? '',
        _debtId: null, _goalId: null, _savingsMonthKey: null,
        _paymentId: null, _depositId: null, _savingsDepositId: null,
      })
      toast.success(copyFrom ? 'Đã sao chép chi tiêu!' : 'Đã thêm chi tiêu!')
    }
    onClose()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
      {!copyFrom && (
        <ReceiptScanner onResult={handleScanResult} disabled={isSubmitting} />
      )}

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

      <FormField label="Tiêu đề">
        <Input placeholder="VD: Ăn trưa, Xăng xe..." {...register('title')} />
      </FormField>

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

      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={isSubmitting}>
        {editExpense ? 'Lưu thay đổi' : 'Thêm chi tiêu'}
      </Button>
    </form>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

export function ExpenseFormModal({ open, onClose, editExpense, copyFrom, defaultDate }: ExpenseFormModalProps) {
  const isSingleMode = !!(editExpense || copyFrom)
  const title = editExpense ? 'Sửa chi tiêu' : copyFrom ? 'Sao chép chi tiêu' : 'Thêm chi tiêu'

  return (
    <Modal variant="center" open={open} onClose={onClose} title={title}>
      {isSingleMode ? (
        <SingleEntryForm
          key={editExpense?.id ?? copyFrom?.id ?? 'single'}
          onClose={onClose}
          editExpense={editExpense}
          copyFrom={copyFrom}
          defaultDate={defaultDate}
        />
      ) : (
        <MultiEntryForm
          key={defaultDate ?? 'multi'}
          onClose={onClose}
          defaultDate={defaultDate}
        />
      )}
    </Modal>
  )
}
