'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
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
import { useCurrentMonth } from '@/hooks/useCurrentMonth'
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

const schema = z.object({
  amount: z.string().min(1, 'Nhập số tiền.')
    .refine(v => parseAmount(v) > 0, 'Phải lớn hơn 0.')
    .refine(v => parseAmount(v) < 999_000_000, 'Số tiền không được vượt quá 999 triệu.'),
  source: z.string().min(1, 'Nhập nguồn thu.'),
  date:   z.string().min(1, 'Chọn ngày.'),
  note:   z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function IncomeFormModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { append, isPending } = useAppend()
  const toast  = useToast()
  const user   = useAuthStore(s => s.user)
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: today(), source: 'Lương' },
  })

  const onSubmit = async (values: FormValues) => {
    const date   = values.date
    // userId BẮT BUỘC phải có trong data để ownership check hoạt động đúng
    // (INCOME_DELETED kiểm tra state.incomes[idx].userId === event.userId)
    const userId = user?.uid ?? ''
    try {
      await append(EVENT_TYPES.INCOME_ADDED, {
        id: newIncomeId(), userId, amount: parseAmount(values.amount),
        source: values.source, date,
        month: getMonthFromDateString(date), note: values.note ?? '',
      })
      toast.success('Đã thêm thu nhập!')
      reset({ date: today(), source: 'Lương' })
      onClose()
    } catch (err) {
      console.error('[income] add failed:', err)
      toast.error('Không lưu được. Kiểm tra kết nối rồi thử lại.')
    }
  }

  return (
    <Modal variant="center" open={open} onClose={onClose} title="Thêm thu nhập">
      <form onSubmit={handleSubmit(onSubmit)} className="px-4 pb-6 space-y-4">
        <FormField label="Nguồn thu" error={errors.source?.message} required>
          <Input placeholder="Lương, Freelance, Thưởng..." autoFocus {...register('source')} />
        </FormField>
        <FormField label="Số tiền (₫)" error={errors.amount?.message} required>
          <AmountInput placeholder="0" {...register('amount')} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Ngày" error={errors.date?.message} required>
            <DatePicker value={watch('date')} onChange={v => setValue('date', v)} />
          </FormField>
          <FormField label="Ghi chú">
            <Input placeholder="Tùy chọn" {...register('note')} />
          </FormField>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isPending}>Thêm thu nhập</Button>
      </form>
    </Modal>
  )
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function IncomeTab() {
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const { append }  = useAppend()
  const toast       = useToast()

  const { currentMonth, goToPrevMonth, goToNextMonth, goToToday, isCurrentMonth } = useCurrentMonth()
  const { monthIncomes } = useMonthData(currentMonth)

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
        <MonthPicker currentMonth={currentMonth} onPrev={goToPrevMonth}
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