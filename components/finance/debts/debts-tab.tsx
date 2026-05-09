'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, PlusCircle } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { AmountInput } from '@/components/ui/amount-input'
import { Progress } from '@/components/ui/progress'
import { CascadeModal } from '@/components/ui/cascade-modal'
import { useAppData } from '@/hooks/useAppData'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { useAppend } from '@/hooks/useAppend'
import { useSync } from '@/hooks/useSync'
import { useToast } from '@/hooks/useToast'
import {
  addDebt, updateDebt, deleteDebt,
  addDebtPayment, deleteDebtPayment,
  findLinkedExpenseIds, findPaymentLinkedExpense,
} from '@/lib/services/debtService'
import { newDebtId, newPaymentId } from '@/lib/utils/id'
import { computePaidAmount, computeRemaining, isDebtSettled, isDebtOverdue, isDebtUpcoming } from '@/lib/types/debt'
import type { Debt, DebtPayment } from '@/lib/types/debt'
import { parseAmount, formatMoney, formatPercent } from '@/lib/utils/currency'
import { today, formatDateVN } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

const debtSchema = z.object({
  name:    z.string().min(1, 'Nhập tên.'),
  amount:  z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
  type:    z.enum(['lend', 'borrow']),
  dueDate: z.string().optional(),
  note:    z.string().optional(),
})
type DebtFormValues = z.infer<typeof debtSchema>

// Payment schema đơn giản — validate amount > còn lại được làm ở runtime
// trong onPaymentSubmit vì phụ thuộc paymentFor (debt đang trả)
const paymentSchema = z.object({
  amount: z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
  date:   z.string().min(1, 'Chọn ngày.'),
})
type PaymentFormValues = z.infer<typeof paymentSchema>

export function DebtsTab() {
  const user        = useAuthStore(s => s.user)
  const moneyHidden = false
  const { appendOptimistic } = useAppend()
  const sync        = useSync()
  const toast       = useToast()
  const { debts, expenses } = useAppData()

  const [debtForm, setDebtForm]     = useState<{ open: boolean; edit?: Debt }>({ open: false })
  const [paymentFor, setPaymentFor] = useState<Debt | null>(null)
  const [addToExpenses, setAddToExpenses] = useState(false)
  const [savingDebt, setSavingDebt]   = useState(false)
  const [savingPayment, setSavingPayment] = useState(false)
  const [deleteDebtTarget, setDeleteDebtTarget]       = useState<Debt | null>(null)
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<{ debt: Debt; payment: DebtPayment } | null>(null)

  const df = useForm<DebtFormValues>({ resolver: zodResolver(debtSchema), defaultValues: { type: 'borrow' } })
  const pf = useForm<PaymentFormValues>({ resolver: zodResolver(paymentSchema), defaultValues: { date: today() } })

  const active   = debts.filter(d => !d.deleted)
  const todayStr = today()

  // Normalize createdAt về ms — hỗ trợ cả Unix seconds lẫn ISO string
  function getCreatedMs(debt: Debt): number {
    const v = debt.createdAt
    if (!v) return 0
    if (typeof v === 'number') {
      // Unix seconds nếu < 1e12, milliseconds nếu >= 1e12
      return v < 1_000_000_000_000 ? v * 1000 : v
    }
    return new Date(v).getTime() || 0
  }

  // Sort: quá hạn → sắp đến hạn → không hạn (theo createdAt desc)
  function sortActive(list: Debt[]): Debt[] {
    return [...list].sort((a, b) => {
      const aOver = isDebtOverdue(a, todayStr)
      const bOver = isDebtOverdue(b, todayStr)
      const aUp   = isDebtUpcoming(a, todayStr)
      const bUp   = isDebtUpcoming(b, todayStr)
      if (aOver && !bOver) return -1
      if (!aOver && bOver) return 1
      if (aUp && !bUp) return -1
      if (!aUp && bUp) return 1
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return getCreatedMs(b) - getCreatedMs(a)
    })
  }

  const lendDebts   = active.filter(d => d.type === 'lend')
  const borrowDebts = active.filter(d => d.type === 'borrow')
  const lendActive    = sortActive(lendDebts.filter(d => !isDebtSettled(d)))
  const lendSettled   = lendDebts.filter(d => isDebtSettled(d))
  const borrowActive  = sortActive(borrowDebts.filter(d => !isDebtSettled(d)))
  const borrowSettled = borrowDebts.filter(d => isDebtSettled(d))
  const [showLendSettled,   setShowLendSettled]   = useState(false)
  const [showBorrowSettled, setShowBorrowSettled] = useState(false)

  // Bug 2: Tổng tiền còn phải trả/thu (chỉ tính debt chưa xong)
  const totalBorrowRemaining = borrowActive.reduce((s, d) => s + computeRemaining(d), 0)
  const totalLendRemaining   = lendActive.reduce((s, d) => s + computeRemaining(d), 0)

  const openDebtEdit = (debt?: Debt) => {
    if (debt) df.reset({ name: debt.name, amount: String(debt.amount), type: debt.type, dueDate: debt.dueDate ?? undefined, note: debt.note })
    else df.reset({ type: 'borrow', dueDate: '' })
    setDebtForm({ open: true, edit: debt })
  }

  const onDebtSubmit = async (values: DebtFormValues) => {
    if (!user) return
    setSavingDebt(true)
    const amount = parseAmount(values.amount)

    // FIX PERF-03: Optimistic update
    let rollback: (() => void) | null = null
    let preDebtId: string | undefined

    if (!debtForm.edit) {
      // Add: pre-generate ID → dùng cùng ID ở service call để pruneReplacedOptimistic match
      preDebtId = newDebtId()
      rollback = appendOptimistic('DEBT_CREATED', {
        id:          preDebtId,
        userId:      user.uid,
        name:        values.name,
        amount,
        type:        values.type,
        dueDate:     values.dueDate ?? null,
        note:        values.note ?? '',
        paidAmount:  0,
        payments:    [],
        deleted:     false,
        createdAt:   Math.floor(Date.now() / 1000),
      }).rollback
    } else {
      // Update: chỉ cần delta fields
      rollback = appendOptimistic('DEBT_UPDATED', {
        id:      debtForm.edit.id,
        name:    values.name,
        amount,
        dueDate: values.dueDate ?? null,
        note:    values.note ?? '',
      }).rollback
    }

    setDebtForm({ open: false })

    try {
      if (debtForm.edit) {
        await updateDebt(user.uid, debtForm.edit.id, { name: values.name, amount, dueDate: values.dueDate, note: values.note })
      } else {
        await addDebt(user.uid, { id: preDebtId, name: values.name, amount, type: values.type, dueDate: values.dueDate, note: values.note })
      }
      await sync()
      toast.success(debtForm.edit ? 'Đã cập nhật khoản nợ!' : 'Đã thêm khoản nợ!')
    } catch (err) {
      rollback?.()
      console.error('[debts] submit failed:', err)
      toast.error('Không lưu được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSavingDebt(false)
    }
  }

  const onPaymentSubmit = async (values: PaymentFormValues) => {
    if (!user || !paymentFor) return

    const amount = parseAmount(values.amount)
    const remaining = computeRemaining(paymentFor)
    if (amount > remaining) {
      toast.error(`Số tiền trả không được lớn hơn ${formatMoney(remaining, false)} còn lại.`)
      return
    }

    setSavingPayment(true)
    const paymentId = newPaymentId()
    const date      = values.date

    // FIX PERF-03: Optimistic payment update
    const { rollback } = appendOptimistic('DEBT_PAYMENT_ADDED', {
      debtId:  paymentFor.id,
      payment: { id: paymentId, amount, date },
    })

    setPaymentFor(null)

    try {
      await addDebtPayment(
        user.uid,
        paymentFor,
        { paymentId, amount, date },
        { addToExpenses },
      )
      await sync()
      toast.success('Đã thêm lần trả nợ!')
    } catch (err) {
      rollback()
      console.error('[debts] payment failed:', err)
      toast.error('Không ghi được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSavingPayment(false)
    }
  }

  const handleDeleteDebt = async (choice: string) => {
    if (!user || !deleteDebtTarget) return
    try {
      const linkedIds = findLinkedExpenseIds(deleteDebtTarget.id, expenses)
      await deleteDebt(user.uid, deleteDebtTarget.id, {
        deleteLinkedExpenses: choice === 'all',
        linkedExpenseIds: linkedIds,
      })
      await sync()
      setDeleteDebtTarget(null)
      toast.success('Đã xóa khoản nợ.')
    } catch (err) {
      console.error('[debts] deleteDebt failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  const handleDeletePayment = async (choice: string) => {
    if (!user || !deletePaymentTarget) return
    try {
      const { debt, payment } = deletePaymentTarget
      const linkedExpId = findPaymentLinkedExpense(payment.id, expenses)
      await deleteDebtPayment(user.uid, debt, payment.id, {
        deleteLinkedExpense: choice === 'both',
        linkedExpenseId: linkedExpId,
      })
      await sync()
      setDeletePaymentTarget(null)
      toast.success('Đã xóa lần trả nợ.')
    } catch (err) {
      console.error('[debts] deletePayment failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  const renderDebtCard = (debt: Debt) => {
          const paid      = computePaidAmount(debt)
          const remaining = computeRemaining(debt)
          const pct       = Math.min(100, Math.round((paid / debt.amount) * 100))
          const overdue   = isDebtOverdue(debt, todayStr)
          const upcoming  = isDebtUpcoming(debt, todayStr)
          const settled   = remaining <= 0
          return (
            <div key={debt.id} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{debt.name}</span>
                      {settled  && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">Xong</span>}
                      {overdue  && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Quá hạn</span>}
                      {upcoming && !overdue && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning/10 text-warning">Sắp đến hạn</span>}
                    </div>
                    {debt.dueDate
                      ? <p className="text-xs text-muted-foreground mt-0.5">Đến hạn: {formatDateVN(debt.dueDate)}{debt.note ? ` · ${debt.note}` : ''}</p>
                      : debt.note ? <p className="text-xs text-muted-foreground mt-0.5">{debt.note}</p> : null
                    }
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => openDebtEdit(debt)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteDebtTarget(debt)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <Progress value={pct} level={settled ? 'ok' : overdue ? 'over' : 'ok'} />
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { l: 'Tổng nợ', v: debt.amount, cls: 'text-foreground' },
                    { l: 'Đã trả',  v: paid,         cls: 'text-success'    },
                    { l: 'Còn lại', v: remaining,    cls: remaining > 0 ? 'text-destructive' : 'text-success' },
                  ].map(item => (
                    <div key={item.l} className="bg-muted/50 rounded-lg p-1.5">
                      <p className="text-[10px] text-muted-foreground">{item.l}</p>
                      <p className={cn('text-xs font-bold mt-0.5', item.cls, moneyHidden && 'blur-sm')}>{formatMoney(item.v, moneyHidden)}</p>
                    </div>
                  ))}
                </div>
                {/* Payment history */}
                {debt.payments.length > 0 && (
                  <div className="border-t border-border/50 pt-2 space-y-1.5">
                    {debt.payments.slice(-3).map(p => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{formatDateVN(p.date)}</span>
                        <div className="flex items-center gap-1">
                          <span className={cn('font-medium text-foreground', moneyHidden && 'blur-sm')}>{formatMoney(p.amount, moneyHidden)}</span>
                          <button onClick={() => setDeletePaymentTarget({ debt, payment: p })}
                            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!settled && (
                <div className="border-t border-border px-4 py-2">
                  <button onClick={() => { setPaymentFor(debt); pf.reset({ date: today() }); setAddToExpenses(false) }}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-2">
                    <PlusCircle className="w-4 h-4" /> Thêm lần trả
                  </button>
                </div>
              )}
            </div>
          )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {/* Stats: tổng còn phải trả / thu */}
        <div className="grid grid-cols-2 gap-2 flex-1">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🙏 Tôi đang nợ</p>
            <p className={cn('text-base font-bold mt-1', totalBorrowRemaining > 0 ? 'text-destructive' : 'text-muted-foreground', moneyHidden && 'blur-sm')}>
              {formatMoney(totalBorrowRemaining, moneyHidden)}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">🤲 Cho vay</p>
            <p className={cn('text-base font-bold mt-1', totalLendRemaining > 0 ? 'text-success' : 'text-muted-foreground', moneyHidden && 'blur-sm')}>
              {formatMoney(totalLendRemaining, moneyHidden)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => openDebtEdit()}>Thêm khoản nợ</Button>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🤲 Tôi cho vay ({lendDebts.length})</h3>
        {lendActive.length === 0 && lendSettled.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Không có khoản nào</p>}
        {lendActive.map(d => renderDebtCard(d))}
        {lendSettled.length > 0 && (
          <div>
            <button onClick={() => setShowLendSettled(v => !v)} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full py-1">
              <span className="text-success">✓</span>Đã xong ({lendSettled.length})<span className="ml-auto">{showLendSettled ? '▲' : '▼'}</span>
            </button>
            {showLendSettled && <div className="mt-2 space-y-3 opacity-60">{lendSettled.map(d => renderDebtCard(d))}</div>}
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">🙏 Tôi đang nợ ({borrowDebts.length})</h3>
        {borrowActive.length === 0 && borrowSettled.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Không có khoản nào</p>}
        {borrowActive.map(d => renderDebtCard(d))}
        {borrowSettled.length > 0 && (
          <div>
            <button onClick={() => setShowBorrowSettled(v => !v)} className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors w-full py-1">
              <span className="text-success">✓</span>Đã xong ({borrowSettled.length})<span className="ml-auto">{showBorrowSettled ? '▲' : '▼'}</span>
            </button>
            {showBorrowSettled && <div className="mt-2 space-y-3 opacity-60">{borrowSettled.map(d => renderDebtCard(d))}</div>}
          </div>
        )}
      </div>

      {/* Debt form */}
      <Modal variant="center" open={debtForm.open} onClose={() => setDebtForm({ open: false })} title={debtForm.edit ? 'Sửa khoản nợ' : 'Thêm khoản nợ'}>
        <form onSubmit={df.handleSubmit(onDebtSubmit)} className="px-4 pb-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Loại</p>
            <div className="flex gap-2">
              {[{ v: 'borrow', l: '🙏 Tôi đang nợ' }, { v: 'lend', l: '🤲 Tôi cho vay' }].map(opt => (
                <button key={opt.v} type="button" onClick={() => df.setValue('type', opt.v as any)}
                  className={cn('flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                    df.watch('type') === opt.v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          <FormField label="Tên người" error={df.formState.errors.name?.message} required>
            <Input placeholder="Nguyễn Văn A" autoFocus {...df.register('name')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Số tiền (₫)" error={df.formState.errors.amount?.message} required>
              <AmountInput placeholder="0" {...df.register('amount')} />
            </FormField>
            <FormField label="Đến hạn" error={df.formState.errors.dueDate?.message}>
              <DatePicker value={df.watch('dueDate') ?? ''} onChange={v => df.setValue('dueDate', v)} />
            </FormField>
          </div>
          <FormField label="Ghi chú">
            <Input placeholder="Tùy chọn" {...df.register('note')} />
          </FormField>
          <Button type="submit" className="w-full" size="lg" loading={savingDebt}>
            {debtForm.edit ? 'Lưu thay đổi' : 'Thêm khoản nợ'}
          </Button>
        </form>
      </Modal>

      {/* Payment modal */}
      <Modal variant="center" open={!!paymentFor} onClose={() => setPaymentFor(null)} title={`Trả nợ — ${paymentFor?.name}`}>
        <form onSubmit={pf.handleSubmit(onPaymentSubmit)} className="px-4 pb-6 space-y-4">
          <FormField label="Số tiền trả (₫)" required>
            <AmountInput placeholder="0" autoFocus {...pf.register('amount')} />
            {paymentFor && (
              <p className="text-xs text-muted-foreground mt-1">
                Còn lại: <span className="font-medium text-foreground">{formatMoney(computeRemaining(paymentFor), false)}</span>
              </p>
            )}
          </FormField>
          <FormField label="Ngày trả" required>
            <DatePicker value={pf.watch('date')} onChange={v => pf.setValue('date', v)} />
          </FormField>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={addToExpenses} onChange={e => setAddToExpenses(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            Ghi vào chi tiêu
          </label>
          <Button type="submit" className="w-full" size="lg" loading={savingPayment}>Lưu lần trả</Button>
        </form>
      </Modal>

      {/* Delete debt cascade */}
      <CascadeModal
        open={!!deleteDebtTarget} onClose={() => setDeleteDebtTarget(null)} onChoose={handleDeleteDebt}
        title={`Xóa khoản nợ "${deleteDebtTarget?.name}"?`}
        description="Khoản nợ này có thể có chi tiêu liên kết."
        choices={[
          { label: 'Xóa tất cả liên quan (nợ + chi tiêu)', variant: 'danger', value: 'all' },
          { label: 'Chỉ xóa khoản nợ, giữ chi tiêu', variant: 'warning', value: 'debt_only' },
        ]} />

      {/* Delete payment cascade */}
      <CascadeModal
        open={!!deletePaymentTarget} onClose={() => setDeletePaymentTarget(null)} onChoose={handleDeletePayment}
        title="Xóa lần trả nợ?"
        description={deletePaymentTarget ? `${formatMoney(deletePaymentTarget.payment.amount, false)} · ${deletePaymentTarget.payment.date}` : ''}
        choices={[
          { label: 'Xóa cả hai (lần trả + chi tiêu liên kết)', variant: 'danger', value: 'both' },
          { label: 'Chỉ xóa lần trả, giữ chi tiêu', variant: 'warning', value: 'payment_only' },
        ]} />
    </div>
  )
}