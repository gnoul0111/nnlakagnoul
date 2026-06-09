'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Trash2, ArrowDownLeft } from 'lucide-react'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { AmountInput } from '@/components/ui/amount-input'
import { Progress } from '@/components/ui/progress'
import { MonthPicker } from '@/components/dashboard/month-picker'
import { CascadeModal } from '@/components/ui/cascade-modal'
import { useMonthData, useAppData } from '@/hooks/useAppData'
import { useCurrentMonth } from '@/hooks/useCurrentMonth'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useAppend } from '@/hooks/useAppend'
import { useSync } from '@/hooks/useSync'
import { useToast } from '@/hooks/useToast'
import {
  setSavingsTarget, savingsDeposit, deleteSavingsDeposit,
  savingsWithdraw, deleteSavingsWithdrawal, findSavingsDepositExpense,
} from '@/lib/services/savingsService'
import { newDepositId, newWithdrawId } from '@/lib/utils/id'
import {
  computeTotalDeposited, computeTotalWithdrawn, computeBalance,
} from '@/lib/types/savings'
import type { SavingsDeposit, SavingsWithdrawal } from '@/lib/types/savings'
import { parseAmount, formatMoney, formatPercent } from '@/lib/utils/currency'
import { today, formatDateVN } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'

const depositSchema = z.object({
  amount: z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
  date:   z.string().min(1, 'Chọn ngày.'),
  note:   z.string().optional(),
})
const withdrawSchema = z.object({
  amount: z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
  date:   z.string().min(1, 'Chọn ngày.'),
  reason: z.string().optional(),
  type:   z.enum(['spend', 'goal']),
  goalId: z.string().optional(),
})
const targetSchema = z.object({
  targetAmount: z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
})

export function SavingsTab() {
  const user        = useAuthStore(s => s.user)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const { appendOptimistic } = useAppend()
  const sync        = useSync()
  const toast       = useToast()

  const { currentMonth, goToPrevMonth, goToNextMonth, goToToday, isCurrentMonth } = useCurrentMonth()
  const { savingsPlan }                  = useMonthData(currentMonth)
  const { expenses, goals: activeGoals } = useAppData()

  const [depositOpen, setDepositOpen]   = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [targetOpen, setTargetOpen]     = useState(false)
  const [addToExpenses, setAddToExpenses] = useState(true)
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [savingWithdraw, setSavingWithdraw] = useState(false)
  const [deleteDepositTarget, setDeleteDepositTarget] = useState<SavingsDeposit | null>(null)
  const [deleteWithdrawTarget, setDeleteWithdrawTarget] = useState<SavingsWithdrawal | null>(null)

  const df = useForm<{ amount: string; date: string; note?: string }>({ resolver: zodResolver(depositSchema), defaultValues: { amount: '', date: today(), note: '' } })
  type WithdrawValues = { amount: string; date: string; reason?: string; type: 'spend' | 'goal'; goalId?: string }
  const wf = useForm<WithdrawValues>({ resolver: zodResolver(withdrawSchema), defaultValues: { amount: '', date: today(), type: 'spend', reason: '', goalId: '' } })
  const tf = useForm<{ targetAmount: string }>({ resolver: zodResolver(targetSchema), defaultValues: { targetAmount: '' } })

  const totalDeposited = savingsPlan ? computeTotalDeposited(savingsPlan) : 0
  const totalWithdrawn = savingsPlan ? computeTotalWithdrawn(savingsPlan) : 0
  const balance        = savingsPlan ? computeBalance(savingsPlan) : 0
  const target         = savingsPlan?.targetAmount ?? 0
  const pct            = target > 0 ? Math.min(100, Math.round((totalDeposited / target) * 100)) : 0

  const onDeposit = async (values: { amount: string; date: string; note?: string }) => {
    if (!user) return
    setSavingDeposit(true)
    const amount    = parseAmount(values.amount)
    const depositId = newDepositId()
    const date      = values.date

    // FIX PERF-03: Optimistic — UI cập nhật ngay, modal đóng ngay
    const { rollback } = appendOptimistic('SAVINGS_DEPOSIT', {
      monthKey: currentMonth,
      deposit:  { id: depositId, amount, date, note: values.note ?? '', allocations: [] },
    })

    setDepositOpen(false)

    try {
      await savingsDeposit(
        user.uid,
        currentMonth,
        { depositId, amount, date, note: values.note },
        { addToExpenses },
      )
      await sync()
      toast.success('Đã nạp tiền tiết kiệm!')
    } catch (err) {
      rollback()
      console.error('[savings] deposit failed:', err)
      toast.error('Không nạp được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSavingDeposit(false)
    }
  }

  const onWithdraw = async (values: WithdrawValues) => {
    if (!user) return
    setSavingWithdraw(true)
    const amount     = parseAmount(values.amount)
    const withdrawId = newWithdrawId()
    const date       = values.date
    const goalObj    = values.type === 'goal' && values.goalId
      ? activeGoals.find(g => g.id === values.goalId)
      : null

    // FIX PERF-03: Optimistic withdraw
    // Lưu ý: nếu type='goal', goalDepositId sẽ được confirm khi sync() — không optimistic
    // goal deposit để tránh hiện số tiền sai trên goal card trong thời gian chờ
    const { rollback } = appendOptimistic('SAVINGS_WITHDRAWN', {
      monthKey: currentMonth,
      withdrawal: {
        id:            withdrawId,
        amount,
        date,
        reason:        values.reason ?? '',
        type:          values.type,
        goalId:        values.goalId || null,
        goalDepositId: null,  // sẽ được fill đúng sau sync()
      },
    })

    setWithdrawOpen(false)

    try {
      await savingsWithdraw(
        user.uid,
        currentMonth,
        { withdrawalId: withdrawId, amount, date, reason: values.reason, type: values.type, goalId: values.goalId || null },
        goalObj,
      )
      await sync()
      toast.success('Đã rút tiền tiết kiệm!')
    } catch (err) {
      rollback()
      console.error('[savings] withdraw failed:', err)
      toast.error('Không rút được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSavingWithdraw(false)
    }
  }

  const onSetTarget = async (values: { targetAmount: string }) => {
    if (!user) return
    try {
      await setSavingsTarget(user.uid, currentMonth, parseAmount(values.targetAmount))
      await sync()
      setTargetOpen(false)
      toast.success('Đã đặt mục tiêu tiết kiệm!')
    } catch (err) {
      console.error('[savings] setTarget failed:', err)
      toast.error('Không đặt được mục tiêu. Thử lại nhé.')
    }
  }

  const handleDeleteDeposit = async (choice: string) => {
    if (!user || !deleteDepositTarget) return
    try {
      const linkedExpId = findSavingsDepositExpense(deleteDepositTarget.id, expenses)
      await deleteSavingsDeposit(user.uid, currentMonth, deleteDepositTarget.id, choice !== 'deposit_only' ? linkedExpId : null)
      await sync()
      setDeleteDepositTarget(null)
      toast.success('Đã xóa lần nạp tiền.')
    } catch (err) {
      console.error('[savings] deleteDeposit failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  const handleDeleteWithdraw = async () => {
    if (!user || !deleteWithdrawTarget) return
    try {
      await deleteSavingsWithdrawal(user.uid, currentMonth, deleteWithdrawTarget.id)
      await sync()
      setDeleteWithdrawTarget(null)
      toast.success('Đã xóa lần rút tiền.')
    } catch (err) {
      console.error('[savings] deleteWithdraw failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MonthPicker currentMonth={currentMonth} onPrev={goToPrevMonth} onNext={goToNextMonth} onToday={goToToday} isCurrentMonth={isCurrentMonth} />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setWithdrawOpen(true)} leftIcon={<ArrowDownLeft className="w-3.5 h-3.5" />}>Rút</Button>
          <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setDepositOpen(true)}>Nạp</Button>
        </div>
      </div>

      {/* Overview card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Tiết kiệm tháng này</h3>
          <button onClick={() => { tf.reset({ targetAmount: String(target || '') }); setTargetOpen(true) }}
            className="text-xs text-primary font-medium hover:underline underline-offset-2">
            {target > 0 ? 'Sửa mục tiêu' : '+ Đặt mục tiêu'}
          </button>
        </div>

        {target > 0 && <>
          <Progress value={pct} level="ok" />
          <p className="text-xs text-muted-foreground text-right">{formatPercent(pct)} mục tiêu</p>
        </>}

        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'Đã nạp',  value: totalDeposited, cls: 'text-success'     },
            { label: 'Đã rút',  value: totalWithdrawn, cls: 'text-destructive'  },
            { label: 'Số dư',   value: balance,        cls: 'text-primary'      },
          ].map(item => (
            <div key={item.label} className="bg-muted/50 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={cn('text-sm font-bold mt-0.5', item.cls)}>{formatMoney(item.value, moneyHidden)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deposits */}
      {savingsPlan?.deposits && savingsPlan.deposits.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lịch sử nạp tiền</span>
          </div>
          {[...savingsPlan.deposits].reverse().map((dep, i) => (
            <div key={dep.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border/50')}>
              <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center text-sm shrink-0">💰</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{dep.note || 'Nạp tiền tiết kiệm'}</p>
                <p className="text-xs text-muted-foreground">{formatDateVN(dep.date)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn('text-sm font-semibold text-success')}>+{formatMoney(dep.amount, moneyHidden)}</span>
                <button onClick={() => setDeleteDepositTarget(dep)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Withdrawals */}
      {savingsPlan?.withdrawals && savingsPlan.withdrawals.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lịch sử rút tiền</span>
          </div>
          {[...savingsPlan.withdrawals].reverse().map((wd, i) => (
            <div key={wd.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-border/50')}>
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center text-sm shrink-0">
                {wd.type === 'goal' ? '🎯' : '💸'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{wd.reason || (wd.type === 'goal' ? 'Chuyển vào mục tiêu' : 'Rút tiêu dùng')}</p>
                <p className="text-xs text-muted-foreground">{formatDateVN(wd.date)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn('text-sm font-semibold text-destructive')}>-{formatMoney(wd.amount, moneyHidden)}</span>
                <button onClick={() => setDeleteWithdrawTarget(wd)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deposit modal */}
      <Modal variant="center" open={depositOpen} onClose={() => setDepositOpen(false)} title="Nạp tiền tiết kiệm">
        <form onSubmit={df.handleSubmit(onDeposit)} className="px-4 pb-6 space-y-4">
          <FormField label="Số tiền (₫)" error={df.formState.errors.amount?.message} required>
            <AmountInput placeholder="0" autoFocus {...df.register('amount')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ngày" required><DatePicker value={df.watch('date')} onChange={v => df.setValue('date', v)} /></FormField>
            <FormField label="Ghi chú"><Input placeholder="Tùy chọn" {...df.register('note')} /></FormField>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={addToExpenses} onChange={e => setAddToExpenses(e.target.checked)} className="w-4 h-4 rounded accent-primary" />
            Ghi vào chi tiêu (mặc định)
          </label>
          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={savingDeposit}>Nạp tiền</Button>
        </form>
      </Modal>

      {/* Withdraw modal */}
      <Modal variant="center" open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Rút tiền tiết kiệm">
        <form onSubmit={wf.handleSubmit(onWithdraw)} className="px-4 pb-6 space-y-4">
          <FormField label="Số tiền (₫)" required>
            <AmountInput placeholder="0" autoFocus {...wf.register('amount')} />
          </FormField>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Mục đích rút</p>
            <div className="flex gap-2">
              {[{ v: 'spend', l: '💸 Tiêu dùng' }, { v: 'goal', l: '🎯 Vào mục tiêu' }].map(opt => (
                <button key={opt.v} type="button" onClick={() => wf.setValue('type', opt.v as any)}
                  className={cn('flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                    wf.watch('type') === opt.v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          {wf.watch('type') === 'goal' && activeGoals.filter(g => !g.deleted).length > 0 && (
            <FormField label="Chọn mục tiêu">
              <select className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" {...wf.register('goalId')}>
                <option value="">-- Chọn mục tiêu --</option>
                {activeGoals.filter(g => !g.deleted).map(g => (
                  <option key={g.id} value={g.id}>{g.icon} {g.name}</option>
                ))}
              </select>
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ngày" required><DatePicker value={wf.watch('date')} onChange={v => wf.setValue('date', v)} /></FormField>
            <FormField label="Lý do"><Input placeholder="Tùy chọn" {...wf.register('reason')} /></FormField>
          </div>
          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={savingWithdraw}>Rút tiền</Button>
        </form>
      </Modal>

      {/* Set target modal */}
      <Modal variant="center" open={targetOpen} onClose={() => setTargetOpen(false)} title="Đặt mục tiêu tiết kiệm">
        <form onSubmit={tf.handleSubmit(onSetTarget)} className="px-4 pb-5 space-y-4">
          <FormField label="Số tiền mục tiêu (₫)" required>
            <AmountInput placeholder="2.000.000" autoFocus {...tf.register('targetAmount')} />
          </FormField>
          <Button type="submit" className="w-full">Lưu mục tiêu</Button>
        </form>
      </Modal>

      {/* Cascade delete deposit */}
      <CascadeModal open={!!deleteDepositTarget} onClose={() => setDeleteDepositTarget(null)} onChoose={handleDeleteDeposit}
        title="Xóa lần nạp tiền?"
        description={deleteDepositTarget ? `${formatMoney(deleteDepositTarget.amount, false)} · ${formatDateVN(deleteDepositTarget.date)}` : ''}
        choices={[
          { label: 'Xóa kèm chi tiêu liên kết', description: 'Nếu có', variant: 'danger', value: 'both' },
          { label: 'Chỉ xóa lần nạp, giữ chi tiêu', variant: 'warning', value: 'deposit_only' },
        ]} />

      <ConfirmModal open={!!deleteWithdrawTarget} onClose={() => setDeleteWithdrawTarget(null)} onConfirm={handleDeleteWithdraw}
        title="Xóa lần rút tiền?" confirmLabel="Xóa" danger />
    </div>
  )
}