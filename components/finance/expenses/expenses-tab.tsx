'use client'

import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Copy } from 'lucide-react'
import { Button }           from '@/components/ui/button'
import { ConfirmModal }     from '@/components/ui/modal'
import { DateRangePicker }  from '@/components/ui/date-picker'
import { MonthPicker }      from '@/components/dashboard/month-picker'
import { ExpenseFormModal } from './expense-form-modal'
import { useMonthData }     from '@/hooks/useAppData'
import { useCurrentMonth }  from '@/hooks/useCurrentMonth'
import { useAppend }        from '@/hooks/useAppend'
import { useToast }         from '@/hooks/useToast'
import { useSettingsStore } from '@/lib/store/settingsStore'
import { CATEGORIES, isSavingsExpense, type Expense } from '@/lib/types/expense'
import { EVENT_TYPES }      from '@/lib/types/events'
import { formatMoney }      from '@/lib/utils/currency'
import { formatDateShort, today } from '@/lib/utils/date'
import { cn }               from '@/lib/utils/cn'

const catMap = Object.fromEntries(CATEGORIES.map(c => [c.value, c]))

export function ExpensesTab() {
  const moneyHidden = false
  const { append }  = useAppend()
  const toast       = useToast()

  const { currentMonth, goToPrevMonth, goToNextMonth, goToToday, isCurrentMonth } = useCurrentMonth()
  const { monthExpenses } = useMonthData(currentMonth)

  const [formOpen,      setFormOpen]      = useState(false)
  const [editTarget,    setEditTarget]    = useState<Expense | null>(null)
  const [copyTarget,    setCopyTarget]    = useState<Expense | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<Expense | null>(null)

  // ── Date range filter ─────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const hasFilter = !!(dateFrom || dateTo)

  const clearFilter = () => { setDateFrom(''); setDateTo('') }

  // Filtered + grouped
  const { grouped, totalSpending } = useMemo(() => {
    let list = monthExpenses.filter(e => !e.deleted)
    if (dateFrom) list = list.filter(e => e.date >= dateFrom)
    if (dateTo)   list = list.filter(e => e.date <= dateTo)

    const spending = list
      .filter(e => !e._debtId && !e._goalId && !e._savingsMonthKey)
      .reduce((s, e) => s + e.amount, 0)

    const grouped = list
      .sort((a, b) => b.date.localeCompare(a.date))
      .reduce<Record<string, Expense[]>>((acc, e) => {
        if (!acc[e.date]) acc[e.date] = []
        acc[e.date].push(e)
        return acc
      }, {})

    return { grouped, totalSpending: spending }
  }, [monthExpenses, dateFrom, dateTo])

  const handleDelete = async () => {
    if (!deleteTarget) return
    if (isSavingsExpense(deleteTarget)) {
      toast.warning('Chỉ được quản lý ở tab Tiết kiệm.')
      setDeleteTarget(null)
      return
    }
    try {
      await append(EVENT_TYPES.EXPENSE_DELETED, {
        id: deleteTarget.id,
        deletedAt: new Date().toISOString(),
      })
      toast.success('Đã xóa chi tiêu.')
      setDeleteTarget(null)
    } catch (err) {
      console.error('[expenses] delete failed:', err)
      toast.error('Không xóa được. Thử lại nhé.')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <MonthPicker currentMonth={currentMonth} onPrev={goToPrevMonth}
          onNext={goToNextMonth} onToday={goToToday} isCurrentMonth={isCurrentMonth} />
        <Button size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => { setEditTarget(null); setFormOpen(true) }}>
          Thêm
        </Button>
      </div>

      {/* Date range filter */}
      <DateRangePicker
        value={{ from: dateFrom, to: dateTo }}
        onChange={v => { setDateFrom(v.from); setDateTo(v.to) }}
        headerLabel="Lọc theo khoảng ngày"
      />

      {/* Summary */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 rounded-xl">
        <span className="text-sm text-muted-foreground">
          {hasFilter ? 'Tổng trong khoảng ngày' : 'Tổng chi tiêu thực'}
        </span>
        <span className={cn('text-base font-bold text-destructive', moneyHidden && 'blur-sm')}>
          {formatMoney(totalSpending, moneyHidden)}
        </span>
      </div>

      {/* List */}
      {Object.keys(grouped).length === 0 ? (
        <EmptyState onAdd={() => setFormOpen(true)} hasFilter={hasFilter} onClear={clearFilter} />
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([date, expenses]) => (
            <div key={date} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {formatDateShort(date)}
                </span>
                <span className={cn('text-xs font-semibold text-destructive', moneyHidden && 'blur-sm')}>
                  {formatMoney(expenses.filter(e => !e._debtId && !e._goalId && !e._savingsMonthKey).reduce((s, e) => s + e.amount, 0), moneyHidden)}
                </span>
              </div>
              {expenses.map((expense, i) => {
                const cat       = catMap[expense.category] ?? catMap.other
                const isLinked  = !!(expense._debtId || expense._goalId || expense._savingsMonthKey)
                const isSavings = isSavingsExpense(expense)
                return (
                  <div key={expense.id}
                    className={cn('flex items-center gap-3 px-4 py-3',
                      i < expenses.length - 1 && 'border-b border-border/50')}>
                    <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center text-base shrink-0">
                      {cat.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {(expense as any).title || expense.note || cat.label}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">{cat.label}</span>
                        {isLinked && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-primary/10 text-primary leading-none">
                            {expense._debtId ? 'Nợ' : expense._goalId ? 'Mục tiêu' : 'Tiết kiệm'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Bỏ dấu "-" — màu đỏ đủ phân biệt chi tiêu */}
                      <span className={cn('text-sm font-semibold text-destructive mr-1', moneyHidden && 'blur-sm')}>
                        {formatMoney(expense.amount, moneyHidden)}
                      </span>
                      {!isSavings ? (
                        <>
                          <button onClick={() => { setCopyTarget(expense); setFormOpen(true) }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            aria-label="Sao chép">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setEditTarget(expense); setFormOpen(true) }}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            aria-label="Sửa">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget(expense)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                            aria-label="Xóa">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="w-[60px] shrink-0" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <ExpenseFormModal open={formOpen}
        onClose={() => { setFormOpen(false); setEditTarget(null); setCopyTarget(null) }}
        editExpense={editTarget}
        copyFrom={copyTarget} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete} title="Xóa chi tiêu?"
        message={deleteTarget
          ? `${formatMoney(deleteTarget.amount, false)} — ${deleteTarget.note || 'Không có ghi chú'}`
          : ''}
        confirmLabel="Xóa" danger />
    </div>
  )
}

function EmptyState({ onAdd, hasFilter, onClear }: {
  onAdd:     () => void
  hasFilter: boolean
  onClear:   () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <span className="text-4xl">{hasFilter ? '🔍' : '💸'}</span>
      <p className="text-sm text-muted-foreground">
        {hasFilter ? 'Không có chi tiêu trong khoảng ngày này' : 'Chưa có chi tiêu nào tháng này'}
      </p>
      {hasFilter
        ? <Button size="sm" variant="outline" onClick={onClear}>Xóa bộ lọc</Button>
        : <Button size="sm" variant="outline" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={onAdd}>
            Thêm chi tiêu đầu tiên
          </Button>
      }
    </div>
  )
}