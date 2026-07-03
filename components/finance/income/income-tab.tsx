'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2 } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { AmountInput } from '@/components/ui/amount-input'
import { MonthPicker } from '@/components/dashboard/month-picker'
import { useAppend } from '@/hooks/useAppend'
import { useMonthData } from '@/hooks/useAppData'
import { usePeriod } from '@/hooks/usePeriod'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useToast } from '@/hooks/useToast'
import { EVENT_TYPES } from '@/lib/types/events'
import { newIncomeId } from '@/lib/utils/id'
import { today, getMonthFromDateString, formatDateShort } from '@/lib/utils/date'
import { parseAmount, formatMoney } from '@/lib/utils/currency'
import type { Income } from '@/lib/types/income'
import { cn } from '@/lib/utils/cn'

// ─── Form Modal ───────────────────────────────────────────────────────────────

const entrySchema = z.object({
  amount: z.string().min(1, 'Nhập số tiền.')
    .refine(v => parseAmount(v) > 0, 'Phải lớn hơn 0.')
    .refine(v => parseAmount(v) <= 999_000_000, 'Tối đa 999 triệu.'),
  source: z.string().min(1, 'Nhập nguồn thu.').max(100),
  date:   z.string().min(1, 'Chọn ngày.'),
  note:   z.string().optional(),
})

const multiSchema = z.object({
  entries: z.array(entrySchema).min(1),
})
type MultiFormValues = z.infer<typeof multiSchema>

const defaultEntry = { amount: '', source: 'Lương', date: today(), note: '' }

function IncomeFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { appendBackgroundBatch } = useAppend()
  const toast  = useToast()
  const user   = useAuthStore(s => s.user)

  const { control, register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<MultiFormValues>({
    resolver: zodResolver(multiSchema),
    defaultValues: { entries: [{ ...defaultEntry, date: today() }] },
  })

  const { fields, append: appendField, remove } = useFieldArray({ control, name: 'entries' })

  const onSubmit = (values: MultiFormValues) => {
    // userId BẮT BUỘC phải có trong data để ownership check hoạt động đúng
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
    reset({ entries: [{ ...defaultEntry, date: today() }] })
    onClose()
  }

  return (
    <Modal variant="center" open={open} onClose={onClose} title="Thêm thu nhập">
      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
        {/* Danh sách khoản */}
        <div className="space-y-3">
          {fields.map((field, i) => {
            const entryErrors = errors.entries?.[i]
            return (
              // key=field.id (KHÔNG dùng i) → AmountInput giữ đúng state khi xoá giữa
              <div key={field.id} className="rounded-xl border border-border bg-card/50 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Khoản {i + 1}</span>
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

                <FormField label="Nguồn thu" error={entryErrors?.source?.message} required>
                  <Input placeholder="Lương, Freelance, Thưởng..." {...register(`entries.${i}.source`)} />
                </FormField>

                <FormField label="Số tiền (₫)" error={entryErrors?.amount?.message} required>
                  <AmountInput placeholder="0" {...register(`entries.${i}.amount`)} />
                </FormField>

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

        <Button type="submit" variant="gradient" className="w-full" size="lg" loading={isSubmitting}>
          {fields.length === 1 ? 'Thêm thu nhập' : `Lưu ${fields.length} khoản`}
        </Button>
      </form>
    </Modal>
  )
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function IncomeTab() {
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const { append }  = useAppend()
  const toast       = useToast()

  const { periodKey: currentMonth, range, label, goToPrev: goToPrevMonth, goToNext: goToNextMonth, goToToday, isCurrentPeriod: isCurrentMonth } = usePeriod()
  const { monthIncomes } = useMonthData(currentMonth, range)

  const [formOpen, setFormOpen]         = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Income | null>(null)

  const active  = monthIncomes.filter(i => !i.deleted)
  const total   = active.reduce((s, i) => s + i.amount, 0)
  const sorted  = [...active].sort((a, b) => b.date.localeCompare(a.date))

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await append(EVENT_TYPES.INCOME_DELETED, { id: deleteTarget.id, deletedAt: new Date().toISOString() })
      toast.success('Đã xóa thu nhập.')
      setDeleteTarget(null)
    } catch (err) {
      console.error('[income] delete failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MonthPicker label={label} onPrev={goToPrevMonth}
          onNext={goToNextMonth} onToday={goToToday} isCurrentMonth={isCurrentMonth} />
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setFormOpen(true)}>
          Thêm
        </Button>
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-success/5 border border-success/20 rounded-xl">
        <span className="text-sm text-muted-foreground">Tổng thu nhập</span>
        <span className={cn('text-base font-bold text-success')}>
          {formatMoney(total, moneyHidden)}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <span className="text-4xl">💰</span>
          <p className="text-sm text-muted-foreground">Chưa có thu nhập nào tháng này</p>
          <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setFormOpen(true)}>
            Thêm thu nhập
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {sorted.map((income, i) => (
            <div key={income.id}
              className={cn('flex items-center gap-3 px-4 py-3', i < sorted.length - 1 && 'border-b border-border/50')}>
              <div className="w-9 h-9 rounded-xl bg-success/10 flex items-center justify-center text-base shrink-0">💰</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{income.source}</p>
                <p className="text-xs text-muted-foreground">{formatDateShort(income.date)}{income.note ? ` · ${income.note}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn('text-sm font-semibold text-success mr-1')}>
                  +{formatMoney(income.amount, moneyHidden)}
                </span>
                <button onClick={() => setDeleteTarget(income)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <IncomeFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Xóa thu nhập?" confirmLabel="Xóa" danger />
    </div>
  )
}