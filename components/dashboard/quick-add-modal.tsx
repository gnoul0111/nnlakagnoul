'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectHiddenCategories } from '@/lib/store/settingsStore'
import { newExpenseId, newIncomeId } from '@/lib/utils/id'
import { today, getMonthFromDateString } from '@/lib/utils/date'
import { CATEGORIES, type CategoryValue } from '@/lib/types/expense'
import { EVENT_TYPES } from '@/lib/types/events'
import { parseAmount } from '@/lib/utils/currency'
import { cn } from '@/lib/utils/cn'
import type { ScanResult } from '@/hooks/useReceiptScan'

// ─── Schemas ──────────────────────────────────────────────────────────────────

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

const expenseEntrySchema = z.object({
  amount:   amountSchema,
  category: z.string().min(1, 'Chọn danh mục.'),
  title:    z.string().max(100).optional(),
  date:     dateSchema,
  note:     z.string().max(500).optional(),
})
const expenseSchema = z.object({ entries: z.array(expenseEntrySchema).min(1) })
type ExpenseFormValues = z.infer<typeof expenseSchema>

const incomeEntrySchema = z.object({
  amount: amountSchema,
  source: z.string().min(1, 'Nhập nguồn thu.').max(100),
  date:   dateSchema,
  note:   z.string().max(500).optional(),
})
const incomeSchema = z.object({ entries: z.array(incomeEntrySchema).min(1) })
type IncomeFormValues = z.infer<typeof incomeSchema>

type TabType = 'expense' | 'income'

// ─── Inner form: Chi tiêu ─────────────────────────────────────────────────────

function ExpenseEntries({
  onClose,
  defaultDate,
}: {
  onClose: () => void
  defaultDate?: string
}) {
  const { appendBackgroundBatch } = useAppend()
  const toast  = useToast()
  const user   = useAuthStore(s => s.user)
  const hidden = useSettingsStore(selectHiddenCategories)

  const defaultEntry = { amount: '', category: 'food', title: '', date: defaultDate ?? today(), note: '' }

  const { control, register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { entries: [defaultEntry] },
  })

  const { fields, append: appendField, remove } = useFieldArray({ control, name: 'entries' })

  // Scanner điền dòng đầu tiên
  const handleScanResult = useCallback((result: ScanResult) => {
    if (result.amount !== null) setValue('entries.0.amount',   String(result.amount))
    if (result.date)            setValue('entries.0.date',     result.date)
    if (result.category)        setValue('entries.0.category', result.category)
    if (result.title)           setValue('entries.0.title',    result.title)
    if (result.note)            setValue('entries.0.note',     result.note)
  }, [setValue])

  const onSubmit = (values: ExpenseFormValues) => {
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* AI Scanner — điền dòng đầu */}
      <ReceiptScanner onResult={handleScanResult} disabled={isSubmitting} />

      <div className="space-y-3">
        {fields.map((field, i) => {
          const entryErrors = errors.entries?.[i]
          const catValue = (watch(`entries.${i}.category`) ?? 'food') as CategoryValue
          return (
            // key=field.id (KHÔNG dùng i) → AmountInput giữ đúng state khi xoá giữa
            <div key={field.id} className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Khoản {i + 1}</span>
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(i)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <CategorySelect
                value={catValue}
                onChange={v => setValue(`entries.${i}.category`, v)}
                hidden={hidden}
              />
              {entryErrors?.category && (
                <p className="text-xs text-destructive">{entryErrors.category.message}</p>
              )}

              <FormField label="Tiêu đề">
                <Input placeholder="VD: Ăn trưa, Xăng xe..." {...register(`entries.${i}.title`)} />
              </FormField>

              <FormField label="Số tiền (₫)" error={entryErrors?.amount?.message} required>
                <AmountInput placeholder="0" {...register(`entries.${i}.amount`)} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Ngày" error={entryErrors?.date?.message} required>
                  <DatePicker value={watch(`entries.${i}.date`)} onChange={v => setValue(`entries.${i}.date`, v)} />
                </FormField>
                <FormField label="Ghi chú">
                  <Input placeholder="Tùy chọn" {...register(`entries.${i}.note`)} />
                </FormField>
              </div>
            </div>
          )
        })}
      </div>

      <button type="button"
        onClick={() => appendField({ ...defaultEntry, date: today() })}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
        <Plus className="w-4 h-4" />
        Thêm khoản
      </button>

      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={isSubmitting}>
        {fields.length === 1 ? 'Thêm chi tiêu' : `Lưu ${fields.length} khoản`}
      </Button>
    </form>
  )
}

// ─── Inner form: Thu nhập ─────────────────────────────────────────────────────

function IncomeEntries({
  onClose,
  defaultDate,
}: {
  onClose: () => void
  defaultDate?: string
}) {
  const { appendBackgroundBatch } = useAppend()
  const toast = useToast()
  const user  = useAuthStore(s => s.user)

  const defaultEntry = { amount: '', source: 'Lương', date: defaultDate ?? today(), note: '' }

  const { control, register, handleSubmit, setValue, watch, formState: { errors, isSubmitting } } = useForm<IncomeFormValues>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { entries: [defaultEntry] },
  })

  const { fields, append: appendField, remove } = useFieldArray({ control, name: 'entries' })

  const onSubmit = (values: IncomeFormValues) => {
    const userId = user?.uid ?? ''
    const batch = values.entries.map(entry => ({
      eventType: EVENT_TYPES.INCOME_ADDED,
      data: {
        id:     newIncomeId(),
        userId,
        amount: parseAmount(entry.amount),
        source: entry.source,
        date:   entry.date,
        month:  getMonthFromDateString(entry.date),
        note:   entry.note ?? '',
      } as Record<string, unknown>,
    }))
    appendBackgroundBatch(batch)
    const n = batch.length
    toast.success(n === 1 ? 'Đã thêm thu nhập!' : `Đã thêm ${n} khoản thu nhập!`)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-3">
        {fields.map((field, i) => {
          const entryErrors = errors.entries?.[i]
          return (
            <div key={field.id} className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">Khoản {i + 1}</span>
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(i)}
                    className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <FormField label="Nguồn thu" error={entryErrors?.source?.message} required>
                <Input placeholder="Lương, Freelance, Thưởng..." {...register(`entries.${i}.source`)} />
              </FormField>

              <FormField label="Số tiền (₫)" error={entryErrors?.amount?.message} required>
                <AmountInput placeholder="0" {...register(`entries.${i}.amount`)} />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Ngày" error={entryErrors?.date?.message} required>
                  <DatePicker value={watch(`entries.${i}.date`)} onChange={v => setValue(`entries.${i}.date`, v)} />
                </FormField>
                <FormField label="Ghi chú">
                  <Input placeholder="Tùy chọn" {...register(`entries.${i}.note`)} />
                </FormField>
              </div>
            </div>
          )
        })}
      </div>

      <button type="button"
        onClick={() => appendField({ ...defaultEntry, date: today() })}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
        <Plus className="w-4 h-4" />
        Thêm khoản
      </button>

      <Button type="submit" variant="gradient" className="w-full" size="lg" loading={isSubmitting}>
        {fields.length === 1 ? 'Thêm thu nhập' : `Lưu ${fields.length} khoản`}
      </Button>
    </form>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

interface QuickAddModalProps {
  open: boolean
  onClose: () => void
  defaultDate?: string
  defaultTab?: 'expense' | 'income'
}

export function QuickAddModal({ open, onClose, defaultDate, defaultTab = 'expense' }: QuickAddModalProps) {
  const [tab, setTab] = useState<TabType>(defaultTab)

  // FIX defaultTab: useState chỉ dùng initial value 1 lần.
  // Nếu user bấm "Thu nhập" → đóng modal → bấm "Chi tiêu", tab phải reset lại đúng.
  useEffect(() => {
    if (open) setTab(defaultTab)
  }, [open, defaultTab])

  return (
    <Modal open={open} onClose={onClose} title="Thêm nhanh" variant="center">
      <div className="px-4 pb-6 space-y-4">
        {/* Tab switch — đổi tab reset form về 1 dòng trống (key=tab) */}
        <div className="flex bg-muted rounded-lg p-1">
          {(['expense', 'income'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground',
              )}>
              {t === 'expense' ? '💸 Chi tiêu' : '💰 Thu nhập'}
            </button>
          ))}
        </div>

        {/* key=tab → re-mount form khi đổi tab → state sạch, không lẫn entry */}
        {tab === 'expense' ? (
          <ExpenseEntries key="expense" onClose={onClose} defaultDate={defaultDate} />
        ) : (
          <IncomeEntries key="income" onClose={onClose} defaultDate={defaultDate} />
        )}
      </div>
    </Modal>
  )
}
