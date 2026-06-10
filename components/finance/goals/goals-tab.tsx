'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Pencil, Trash2, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormField, Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { AmountInput } from '@/components/ui/amount-input'
import { Modal, ConfirmModal } from '@/components/ui/modal'
import { Progress } from '@/components/ui/progress'
import { useAppData } from '@/hooks/useAppData'
import { useAuthStore } from '@/lib/store/authStore'
import { useSettingsStore, selectMoneyHidden } from '@/lib/store/settingsStore'
import { useAppend } from '@/hooks/useAppend'
import { useSync } from '@/hooks/useSync'
import { useToast } from '@/hooks/useToast'
import { addGoal, updateGoal, deleteGoal, addGoalDeposit, deleteGoalDeposit } from '@/lib/services/goalService'
import { deleteExpense } from '@/lib/services/expenseService'
import { newGoalId, newDepositId } from '@/lib/utils/id'
import { computeGoalBalance, computeGoalProgress, daysUntilDeadline } from '@/lib/types/goal'
import { CascadeModal } from '@/components/ui/cascade-modal'
import { formatMoney, parseAmount, formatPercent } from '@/lib/utils/currency'
import { today, formatDateVN } from '@/lib/utils/date'
import type { Goal, GoalDeposit } from '@/lib/types/goal'
import { cn } from '@/lib/utils/cn'

const goalSchema = z.object({
  name:         z.string().min(1, 'Nhập tên mục tiêu.'),
  icon:         z.string().min(1, 'Chọn icon.'),
  targetAmount: z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền mục tiêu.'),
  deadline:     z.string().optional(),
})
type GoalFormValues = z.infer<typeof goalSchema>

const depositSchema = z.object({
  amount: z.string().refine(v => parseAmount(v) > 0, 'Nhập số tiền.'),
  date:   z.string().min(1, 'Chọn ngày.'),
  note:   z.string().optional(),
})
type DepositFormValues = z.infer<typeof depositSchema>

const GOAL_ICONS = ['🎯', '🏠', '🚗', '✈️', '📱', '💻', '🎓', '💍', '🏖️', '💰', '🎮', '📚']

export function GoalsTab() {
  const user        = useAuthStore(s => s.user)
  const moneyHidden = useSettingsStore(selectMoneyHidden)
  const { appendOptimistic } = useAppend()
  const sync        = useSync()
  const toast       = useToast()
  const { goals, expenses } = useAppData()

  const [goalForm, setGoalForm]     = useState<{ open: boolean; edit?: Goal }>({ open: false })
  const [depositFor, setDepositFor] = useState<Goal | null>(null)
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null)
  const [deleteDepositTarget, setDeleteDepositTarget] = useState<{ goal: Goal; deposit: GoalDeposit } | null>(null)
  const [savingGoal, setSavingGoal] = useState(false)
  const [savingDeposit, setSavingDeposit] = useState(false)
  const [addToExpenses, setAddToExpenses] = useState(true)

  const activeGoals = goals.filter(g => !g.deleted)

  // ─── Goal form ────────────────────────────────────────────────────────────
  const gf = useForm<GoalFormValues>({ resolver: zodResolver(goalSchema), defaultValues: { icon: '🎯' } })
  const df = useForm<DepositFormValues>({ resolver: zodResolver(depositSchema), defaultValues: { date: today() } })

  const openGoalEdit = (goal?: Goal) => {
    if (goal) gf.reset({ name: goal.name, icon: goal.icon, targetAmount: String(goal.targetAmount), deadline: goal.deadline ?? undefined })
    else gf.reset({ icon: '🎯', deadline: '' })
    setGoalForm({ open: true, edit: goal })
  }

  const onGoalSubmit = async (values: GoalFormValues) => {
    if (!user) return
    setSavingGoal(true)
    const target = parseAmount(values.targetAmount)

    // FIX PERF-03: Optimistic update — UI cập nhật ngay, không chờ Firestore
    let rollback: (() => void) | null = null
    if (goalForm.edit) {
      // Update: chỉ cần delta
      rollback = appendOptimistic('GOAL_UPDATED', {
        id:           goalForm.edit.id,
        name:         values.name,
        icon:         values.icon,
        targetAmount: target,
        deadline:     values.deadline ?? null,
      }).rollback
    } else {
      // Add: pre-generate ID để service dùng cùng ID → pruneReplacedOptimistic match đúng
      const goalId = newGoalId()
      ;(values as GoalFormValues & { _optimisticId?: string })._optimisticId = goalId
      rollback = appendOptimistic('GOAL_ADDED', {
        id:               goalId,
        userId:           user.uid,
        name:             values.name,
        icon:             values.icon,
        targetAmount:     target,
        currentAmount:    0,
        deadline:         values.deadline ?? null,
        deposits:         [],
        deleted:          false,
        createdTimestamp: Math.floor(Date.now() / 1000),
      }).rollback
      // Gắn ID vào values để dùng trong service call bên dưới
      ;(values as GoalFormValues & { _goalId?: string })._goalId = goalId
    }

    // Đóng modal ngay — user thấy kết quả tức thì
    setGoalForm({ open: false })

    try {
      if (goalForm.edit) {
        await updateGoal(user.uid, goalForm.edit.id, { name: values.name, icon: values.icon, targetAmount: target, deadline: values.deadline })
      } else {
        const preId = (values as GoalFormValues & { _goalId?: string })._goalId
        await addGoal(user.uid, { id: preId, name: values.name, icon: values.icon, targetAmount: target, deadline: values.deadline })
      }
      await sync()
      toast.success(goalForm.edit ? 'Đã cập nhật mục tiêu!' : 'Đã tạo mục tiêu!')
    } catch (err) {
      rollback?.()  // Hoàn tác optimistic nếu write thất bại
      console.error('[goals] submit failed:', err)
      toast.error('Không lưu được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSavingGoal(false)
    }
  }

  const onDepositSubmit = async (values: DepositFormValues) => {
    if (!user || !depositFor) return
    setSavingDeposit(true)
    const amount    = parseAmount(values.amount)
    const depositId = newDepositId()

    // FIX PERF-03: Optimistic update ngay — modal đóng ngay lập tức
    const { rollback } = appendOptimistic('GOAL_DEPOSIT_ADDED', {
      goalId:  depositFor.id,
      deposit: { id: depositId, amount, date: values.date, note: values.note ?? '' },
    })

    setDepositFor(null)

    try {
      await addGoalDeposit(
        user.uid,
        depositFor,
        { depositId, amount, date: values.date, note: values.note },
        { addToExpenses },
      )
      await sync()
      toast.success('Đã nạp tiền vào mục tiêu!')
    } catch (err) {
      rollback()
      console.error('[goals] deposit failed:', err)
      toast.error('Không nạp được. Kiểm tra kết nối rồi thử lại.')
    } finally {
      setSavingDeposit(false)
    }
  }

  const handleDeleteDeposit = async (choice: string) => {
    if (!user || !deleteDepositTarget) return
    try {
      const { goal, deposit } = deleteDepositTarget
      const linkedExp = expenses.find(e => !e.deleted && e._depositId === deposit.id)
      await deleteGoalDeposit(user.uid, goal, deposit.id, {
        deleteLinkedExpense: choice === 'both',
        linkedExpenseId: linkedExp?.id,
      })
      await sync()
      setDeleteDepositTarget(null)
      toast.success('Đã xóa lần nạp tiền.')
    } catch (err) {
      console.error('[goals] deleteDeposit failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  const handleDeleteGoal = async (choice: string) => {
    if (!user || !deleteGoalTarget) return
    try {
      const linkedExpIds = expenses.filter(e => !e.deleted && e._goalId === deleteGoalTarget.id).map(e => e.id)
      await deleteGoal(user.uid, deleteGoalTarget.id)
      if (choice === 'all' && linkedExpIds.length > 0) {
        await Promise.all(linkedExpIds.map(id => deleteExpense(user.uid, id)))
      }
      await sync()
      setDeleteGoalTarget(null)
      toast.success('Đã xóa mục tiêu.')
    } catch (err) {
      console.error('[goals] deleteGoal failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {activeGoals.length} mục tiêu
        </h2>
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => openGoalEdit()}>Thêm</Button>
      </div>

      {activeGoals.length === 0 ? (
        <div className="flex flex-col items-center py-12 gap-3">
          <span className="text-4xl">🎯</span>
          <p className="text-sm text-muted-foreground">Chưa có mục tiêu nào</p>
          <Button size="sm" variant="outline" onClick={() => openGoalEdit()}>Tạo mục tiêu đầu tiên</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {activeGoals.map(goal => {
            const balance  = computeGoalBalance(goal)
            const progress = computeGoalProgress(goal)
            const pct      = Math.round(progress * 100)
            const daysLeft = goal.deadline ? daysUntilDeadline(goal, today()) : null
            return (
              <div key={goal.id} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-2xl">{goal.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{goal.name || goal.id}</p>
                      {daysLeft !== null && (
                        <p className={cn('text-xs', daysLeft < 0 ? 'text-destructive' : daysLeft <= 30 ? 'text-warning' : 'text-muted-foreground')}>
                          {daysLeft < 0 ? `Quá hạn ${Math.abs(daysLeft)} ngày` : daysLeft === 0 ? 'Đến hạn hôm nay' : `Còn ${daysLeft} ngày`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openGoalEdit(goal)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteGoalTarget(goal)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {/* Progress */}
                <div className="px-4 pb-3 space-y-2">
                  <Progress value={pct} level="ok" />
                  <div className="flex justify-between text-sm">
                    <span className={cn('font-semibold text-foreground')}>{formatMoney(balance, moneyHidden)}</span>
                    <span className="text-muted-foreground">
                      {formatPercent(pct)} / <span>{formatMoney(goal.targetAmount, moneyHidden)}</span>
                    </span>
                  </div>
                </div>
                {/* Deposit history */}
                {goal.deposits.length > 0 && (
                  <div className="border-t border-border/50">
                    {goal.deposits.slice(-3).map((dep, i) => (
                      <div key={dep.id} className={cn('flex items-center justify-between px-4 py-2 text-xs', i > 0 && 'border-t border-border/30')}>
                        <span className="text-muted-foreground">{formatDateVN(dep.date)}{dep.note ? ` · ${dep.note}` : ''}</span>
                        <div className="flex items-center gap-1">
                          <span className={cn('font-medium text-foreground')}>{formatMoney(dep.amount, moneyHidden)}</span>
                          <button onClick={() => setDeleteDepositTarget({ goal, deposit: dep })}
                            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Nạp tiền button */}
                <div className="border-t border-border px-4 py-2">
                  <button onClick={() => { setDepositFor(goal); df.reset({ date: today() }); setAddToExpenses(true) }}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline underline-offset-2">
                    <PlusCircle className="w-4 h-4" /> Nạp tiền
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Goal form modal */}
      <Modal variant="center" open={goalForm.open} onClose={() => setGoalForm({ open: false })} title={goalForm.edit ? 'Sửa mục tiêu' : 'Tạo mục tiêu'}>
        <form onSubmit={gf.handleSubmit(onGoalSubmit)} className="px-4 pb-6 space-y-4">
          <FormField label="Tên mục tiêu" error={gf.formState.errors.name?.message} required>
            <Input placeholder="Mua iPhone, Đi du lịch..." autoFocus {...gf.register('name')} />
          </FormField>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Icon</p>
            <div className="flex flex-wrap gap-2">
              {GOAL_ICONS.map(icon => (
                <button key={icon} type="button" onClick={() => gf.setValue('icon', icon)}
                  className={cn('w-10 h-10 text-xl rounded-xl border transition-colors',
                    gf.watch('icon') === icon ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Số tiền mục tiêu (₫)" error={gf.formState.errors.targetAmount?.message} required>
              <AmountInput placeholder="10.000.000" {...gf.register('targetAmount')} />
            </FormField>
            <FormField label="Deadline" error={gf.formState.errors.deadline?.message}>
              <DatePicker value={gf.watch('deadline') ?? ''} onChange={v => gf.setValue('deadline', v)} />
            </FormField>
          </div>
          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={savingGoal}>
            {goalForm.edit ? 'Lưu thay đổi' : 'Tạo mục tiêu'}
          </Button>
        </form>
      </Modal>

      {/* Deposit modal */}
      <Modal variant="center" open={!!depositFor} onClose={() => setDepositFor(null)} title={`Nạp tiền — ${depositFor?.name}`}>
        <form onSubmit={df.handleSubmit(onDepositSubmit)} className="px-4 pb-6 space-y-4">
          <FormField label="Số tiền (₫)" error={df.formState.errors.amount?.message} required>
            <AmountInput placeholder="0" autoFocus {...df.register('amount')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Ngày" error={df.formState.errors.date?.message} required>
              <DatePicker value={df.watch('date')} onChange={v => df.setValue('date', v)} />
            </FormField>
            <FormField label="Ghi chú">
              <Input placeholder="Tùy chọn" {...df.register('note')} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={addToExpenses} onChange={e => setAddToExpenses(e.target.checked)}
              className="w-4 h-4 rounded border-border accent-primary" />
            Ghi vào chi tiêu
          </label>
          <Button type="submit" variant="gradient" className="w-full" size="lg" loading={savingDeposit}>Nạp tiền</Button>
        </form>
      </Modal>

      {/* Delete deposit cascade */}
      <CascadeModal
        open={!!deleteDepositTarget}
        onClose={() => setDeleteDepositTarget(null)}
        onChoose={handleDeleteDeposit}
        title="Xóa lần nạp tiền?"
        description={deleteDepositTarget ? `${formatMoney(deleteDepositTarget.deposit.amount, false)} ngày ${formatDateVN(deleteDepositTarget.deposit.date)}` : ''}
        choices={[
          { label: 'Xóa cả hai (lần nạp + chi tiêu liên kết)', variant: 'danger', value: 'both' },
          { label: 'Chỉ xóa lần nạp, giữ chi tiêu', variant: 'warning', value: 'deposit_only' },
        ]}
      />

      {/* Delete goal cascade */}
      <CascadeModal
        open={!!deleteGoalTarget}
        onClose={() => setDeleteGoalTarget(null)}
        onChoose={handleDeleteGoal}
        title={`Xóa mục tiêu "${deleteGoalTarget?.name}"?`}
        description="Mục tiêu này có thể có chi tiêu liên kết."
        choices={[
          { label: 'Xóa tất cả liên quan (mục tiêu + chi tiêu)', variant: 'danger', value: 'all' },
          { label: 'Chỉ xóa mục tiêu, giữ chi tiêu', variant: 'warning', value: 'goal_only' },
        ]}
      />
    </div>
  )
}