import type { EventDoc } from '@/lib/types/events'
import type { Expense } from '@/lib/types/expense'
import type { Income } from '@/lib/types/income'
import type { Goal, GoalDeposit } from '@/lib/types/goal'
import type { Debt, DebtPayment } from '@/lib/types/debt'
import type { Template } from '@/lib/types/template'
import type { SavingsPlan, SavingsDeposit, SavingsWithdrawal, SavingsAllocation } from '@/lib/types/savings'

// ─── Replayed State ───────────────────────────────────────────────────────────

export interface ReplayedState {
  expenses:     Expense[]
  incomes:      Income[]
  goals:        Goal[]
  debts:        Debt[]
  templates:    Template[]
  savingsPlans: Record<string, SavingsPlan>
}

function emptyState(): ReplayedState {
  return { expenses: [], incomes: [], goals: [], debts: [], templates: [], savingsPlans: {} }
}

function sortEvents(events: EventDoc[]): EventDoc[] {
  return [...events].sort((a, b) => {
    const aMs = a.timestamp?.toMillis?.() ?? 0
    const bMs = b.timestamp?.toMillis?.() ?? 0
    return aMs - bMs
  })
}

function getOrCreatePlan(
  plans: Record<string, SavingsPlan>,
  monthKey: string,
  userId: string,
): SavingsPlan {
  if (!plans[monthKey]) {
    plans[monthKey] = { monthKey, userId, targetAmount: 0, deposits: [], withdrawals: [] }
  }
  // Đảm bảo arrays tồn tại dù data cũ thiếu field
  if (!Array.isArray(plans[monthKey].deposits))   plans[monthKey].deposits   = []
  if (!Array.isArray(plans[monthKey].withdrawals)) plans[monthKey].withdrawals = []
  return plans[monthKey]
}

// Safe array helpers — tránh crash khi item từ data cũ thiếu field id
function safeId(item: any): string | undefined {
  return item?.id ?? item?._id ?? undefined
}

// ─── Main replay function ─────────────────────────────────────────────────────

export function replay(events: EventDoc[]): ReplayedState {
  const state  = emptyState()
  const sorted = sortEvents(events)

  for (const event of sorted) {
    try {
      // NORMALIZE: data cũ lưu lowercase, app mới dùng UPPERCASE
      const eventType = (event.eventType as string).toUpperCase()
      const data      = event.data ?? {}
      const userId    = event.userId ?? ''

      switch (eventType) {

        // ── EXPENSE ────────────────────────────────────────────────────────────

        case 'EXPENSE_ADDED': {
          if (!data.id) break
          const exists = state.expenses.some(e => e.id === data.id)
          if (!exists) state.expenses.push(data as Expense)
          break
        }

        case 'EXPENSE_UPDATED': {
          if (!data.id) break
          const idx = state.expenses.findIndex(e => e.id === data.id)
          // FIX: chỉ apply nếu event.userId khớp với expense.userId
          // Ngăn event bị tamper trong localStorage affect expense của user khác
          if (idx !== -1 && (!state.expenses[idx].userId || state.expenses[idx].userId === userId)) {
            state.expenses[idx] = { ...state.expenses[idx], ...(data as Expense) }
          }
          break
        }

        case 'EXPENSE_DELETED': {
          if (!data.id) break
          const idx = state.expenses.findIndex(e => e.id === data.id)
          // FIX: chỉ apply nếu event.userId khớp với expense.userId
          if (idx !== -1 && (!state.expenses[idx].userId || state.expenses[idx].userId === userId)) {
            state.expenses[idx] = {
              ...state.expenses[idx],
              deleted:   true,
              deletedAt: (data.deletedAt as string) ?? new Date().toISOString(),
            }
          }
          break
        }

        // ── INCOME ─────────────────────────────────────────────────────────────

        case 'INCOME_ADDED':
        case 'INCOME_CREATED': {
          if (!data.id) break
          const exists = state.incomes.some(i => i.id === data.id)
          if (!exists) state.incomes.push(data as Income)
          break
        }

        case 'INCOME_DELETED': {
          if (!data.id) break
          const idx = state.incomes.findIndex(i => i.id === data.id)
          // FIX: ownership check
          if (idx !== -1 && (!state.incomes[idx].userId || state.incomes[idx].userId === userId)) {
            state.incomes[idx] = {
              ...state.incomes[idx],
              deleted:   true,
              deletedAt: (data.deletedAt as string) ?? new Date().toISOString(),
            }
          }
          break
        }

        // ── GOAL ───────────────────────────────────────────────────────────────

        case 'GOAL_ADDED':
        case 'GOAL_CREATED': {
          if (!data.id) break
          const exists = state.goals.some(g => g.id === data.id)
          if (!exists) {
            state.goals.push({
              ...(data as Goal),
              // Fallback: old app có thể lưu "title" thay vì "name"
              name:     data.name || data.title || '',
              deposits: Array.isArray(data.deposits) ? data.deposits : [],
              deleted:  false,
            })
          }
          break
        }

        case 'GOAL_UPDATED': {
          if (!data.id) break
          const idx = state.goals.findIndex(g => g.id === data.id)
          // FIX: ownership check
          if (idx !== -1 && (!state.goals[idx].userId || state.goals[idx].userId === userId)) {
            const existing = state.goals[idx]
            const deposits = data.deposits !== undefined
              ? (data.deposits as Goal['deposits'])
              : existing.deposits
            state.goals[idx] = { ...existing, ...(data as Partial<Goal>), deposits }
          }
          break
        }

        case 'GOAL_DELETED': {
          if (!data.id) break
          const idx = state.goals.findIndex(g => g.id === data.id)
          // FIX: ownership check
          if (idx !== -1 && (!state.goals[idx].userId || state.goals[idx].userId === userId)) {
            state.goals[idx].deleted = true
          }
          break
        }

        // ── GOAL DEPOSIT (delta events — race-safe) ──────────────────────────
        //
        // Thay vì GOAL_UPDATED thay cả array deposits (lost update khi 2 tab
        // concurrent), delta events chỉ thêm/xóa 1 deposit → replay có thể
        // merge đúng thứ tự timestamp.

        case 'GOAL_DEPOSIT_ADDED': {
          if (!data.goalId || !data.deposit) break
          const raw = data.deposit as { id: string; amount: number; date: string; note?: string }
          if (!raw.id) break
          const dep: GoalDeposit = {
            id:     raw.id,
            amount: raw.amount,
            date:   raw.date,
            note:   raw.note ?? '',
          }
          const idx = state.goals.findIndex(g => g.id === data.goalId)
          if (idx === -1) break
          const existing = state.goals[idx]
          // Dedup: nếu deposit id đã tồn tại → skip (idempotent)
          if (existing.deposits.some(d => d.id === dep.id)) break
          const newDeposits = [...existing.deposits, dep]
          state.goals[idx] = {
            ...existing,
            deposits: newDeposits,
            currentAmount: newDeposits.reduce((s, d) => s + d.amount, 0),
          }
          break
        }

        case 'GOAL_DEPOSIT_EDITED': {
          if (!data.goalId || !data.depositId) break
          const idx = state.goals.findIndex(g => g.id === data.goalId)
          // FIX: ownership check
          if (idx === -1 || state.goals[idx].userId !== userId) break
          const existing = state.goals[idx]
          const newDeposits = existing.deposits.map(d =>
            d.id === data.depositId
              ? {
                  ...d,
                  ...(data.amount !== undefined && { amount: data.amount as number }),
                  ...(data.date !== undefined   && { date:   data.date   as string }),
                  ...(data.note !== undefined   && { note:   data.note   as string }),
                }
              : d,
          )
          state.goals[idx] = {
            ...existing,
            deposits: newDeposits,
            currentAmount: newDeposits.reduce((s, d) => s + d.amount, 0),
          }
          break
        }

        case 'GOAL_DEPOSIT_DELETED': {
          if (!data.goalId || !data.depositId) break
          const idx = state.goals.findIndex(g => g.id === data.goalId)
          // FIX: ownership check
          if (idx === -1 || state.goals[idx].userId !== userId) break
          const existing = state.goals[idx]
          const newDeposits = existing.deposits.filter(d => d.id !== data.depositId)
          state.goals[idx] = {
            ...existing,
            deposits: newDeposits,
            currentAmount: newDeposits.reduce((s, d) => s + d.amount, 0),
          }
          break
        }

        // ── DEBT ───────────────────────────────────────────────────────────────

        case 'DEBT_CREATED': {
          if (!data.id) break
          const exists = state.debts.some(d => d.id === data.id)
          if (!exists) {
            state.debts.push({
              ...(data as Debt),
              payments: Array.isArray(data.payments) ? data.payments : [],
              deleted:  false,
            })
          }
          break
        }

        case 'DEBT_UPDATED': {
          if (!data.id) break
          const idx = state.debts.findIndex(d => d.id === data.id)
          // FIX: ownership check
          if (idx !== -1 && (!state.debts[idx].userId || state.debts[idx].userId === userId)) {
            const existing = state.debts[idx]

            // App cũ: data.payment = thêm 1 payment đơn { id, amount, date }
            if (data.payment && typeof data.payment === 'object') {
              const p = data.payment as DebtPayment
              const alreadyExists = existing.payments.some((x: DebtPayment) => x.id === p.id)
              if (!alreadyExists) {
                state.debts[idx] = {
                  ...existing,
                  payments: [...existing.payments, { id: p.id, amount: p.amount, date: p.date }],
                }
              }
              break
            }

            // App cũ: data.paymentDelete = xóa payment theo id
            if (data.paymentDelete) {
              state.debts[idx] = {
                ...existing,
                payments: existing.payments.filter((p: DebtPayment) => p.id !== data.paymentDelete),
              }
              break
            }

            // App mới: data.payments = full array thay thế
            state.debts[idx] = {
              ...existing,
              ...(data as Partial<Debt>),
              payments: Array.isArray(data.payments) ? data.payments : existing.payments,
            }
          }
          break
        }

        case 'DEBT_DELETED': {
          if (!data.id) break
          const idx = state.debts.findIndex(d => d.id === data.id)
          // FIX: ownership check
          if (idx !== -1 && (!state.debts[idx].userId || state.debts[idx].userId === userId)) {
            state.debts[idx].deleted = true
          }
          break
        }

        // ── DEBT PAYMENT (delta events — race-safe) ──────────────────────────

        case 'DEBT_PAYMENT_ADDED': {
          if (!data.debtId || !data.payment) break
          const p = data.payment as DebtPayment
          if (!p.id) break
          const idx = state.debts.findIndex(d => d.id === data.debtId)
          // FIX: ownership check
          if (idx === -1 || state.debts[idx].userId !== userId) break
          const existing = state.debts[idx]
          if (existing.payments.some(x => x.id === p.id)) break // dedup
          state.debts[idx] = {
            ...existing,
            payments: [...existing.payments, { id: p.id, amount: p.amount, date: p.date }],
          }
          break
        }

        case 'DEBT_PAYMENT_DELETED': {
          if (!data.debtId || !data.paymentId) break
          const idx = state.debts.findIndex(d => d.id === data.debtId)
          // FIX: ownership check
          if (idx === -1 || state.debts[idx].userId !== userId) break
          const existing = state.debts[idx]
          state.debts[idx] = {
            ...existing,
            payments: existing.payments.filter(p => p.id !== data.paymentId),
          }
          break
        }

        // ── TEMPLATE ───────────────────────────────────────────────────────────

        case 'TEMPLATE_CREATED': {
          if (!data.id) break
          const exists = state.templates.some(t => t.id === data.id)
          if (!exists) state.templates.push(data as Template)
          break
        }

        case 'TEMPLATE_DELETED': {
          if (!data.id) break
          const idx = state.templates.findIndex(t => t.id === data.id)
          // FIX: ownership check
          if (idx !== -1 && (!state.templates[idx].userId || state.templates[idx].userId === userId)) {
            state.templates[idx].deleted = true
          }
          break
        }

        // ── SAVINGS ────────────────────────────────────────────────────────────

        case 'SAVINGS_TARGET_SET': {
          if (!data.monthKey) break
          const plan = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)
          // FIX: chỉ update nếu plan thuộc về cùng userId
          if (plan.userId === userId) {
            plan.targetAmount = (data.targetAmount as number) ?? 0
          }
          break
        }

        case 'SAVINGS_DEPOSIT': {
          if (!data.monthKey) break
          const plan = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)

          // Data cũ có thể lưu flat (data.id, data.amount...) hoặc nested (data.deposit.id...)
          const raw: any = data.deposit ?? data
          if (!raw?.id) break

          const deposit: SavingsDeposit = {
            id:          raw.id,
            amount:      raw.amount ?? 0,
            date:        raw.date   ?? '',
            note:        raw.note   ?? '',
            allocations: Array.isArray(raw.allocations) ? raw.allocations : [],
          }

          const exists = plan.deposits.some(d => d.id === deposit.id)
          if (!exists) plan.deposits.push(deposit)
          break
        }

        case 'SAVINGS_DEPOSIT_DELETED': {
          if (!data.monthKey) break
          const plan = state.savingsPlans[data.monthKey as string]
          // FIX: ownership check
          if (plan && plan.userId === userId && data.depositId) {
            plan.deposits = plan.deposits.filter(d => safeId(d) !== data.depositId)
          }
          break
        }

        case 'SAVINGS_ALLOCATED': {
          if (!data.monthKey || !data.depositId) break
          const plan    = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)
          const deposit = plan.deposits.find(d => d.id === data.depositId)
          if (deposit) {
            if (!Array.isArray(deposit.allocations)) deposit.allocations = []
            const exists = deposit.allocations.some(a => safeId(a) === data.allocationId)
            if (!exists && data.allocationId) {
              deposit.allocations.push({
                id:     data.allocationId as string,
                goalId: data.goalId as string,
                amount: (data.amount as number) ?? 0,
                date:   (data.date as string)   ?? '',
              } as SavingsAllocation)
            }
          }
          break
        }

        case 'SAVINGS_ALLOCATION_DELETED': {
          if (!data.monthKey) break
          const plan = state.savingsPlans[data.monthKey as string]
          // FIX: ownership check
          if (plan && plan.userId === userId && data.depositId) {
            const deposit = plan.deposits.find(d => d.id === data.depositId)
            if (deposit && Array.isArray(deposit.allocations)) {
              deposit.allocations = deposit.allocations.filter(
                a => safeId(a) !== data.allocationId,
              )
            }
          }
          break
        }

        case 'SAVINGS_WITHDRAWN': {
          if (!data.monthKey) break
          const plan = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)

          // Data cũ có thể flat hoặc nested trong data.withdrawal
          const raw: any = data.withdrawal ?? data
          if (!raw?.id) break

          const withdrawal: SavingsWithdrawal = {
            id:     raw.id,
            amount: raw.amount ?? 0,
            date:   raw.date   ?? '',
            reason: raw.reason ?? '',
            type:   raw.type   ?? 'spend',
            goalId: raw.goalId ?? null,
          }

          const exists = plan.withdrawals.some(w => safeId(w) === withdrawal.id)
          if (!exists) plan.withdrawals.push(withdrawal)
          break
        }

        case 'SAVINGS_WITHDRAWAL_DELETED': {
          if (!data.monthKey) break
          const plan = state.savingsPlans[data.monthKey as string]
          // FIX: ownership check
          if (plan && plan.userId === userId && data.withdrawalId) {
            plan.withdrawals = plan.withdrawals.filter(
              w => safeId(w) !== data.withdrawalId,
            )
          }
          break
        }

        default:
          if (process.env.NODE_ENV === 'development') {
            console.debug('[replay] unknown eventType:', eventType)
          }
          break
      }
    } catch (err) {
      // Bảo vệ toàn bộ replay: 1 event lỗi không làm crash cả app
      // Log để debug nhưng tiếp tục xử lý events còn lại
      if (process.env.NODE_ENV === 'development') {
        console.warn('[replay] error processing event:', event.eventType, event.id, err)
      }
    }
  }

  return state
}

// ─── Selector helpers ─────────────────────────────────────────────────────────

export function getActiveExpenses(state: ReplayedState): Expense[] {
  return state.expenses.filter(e => !e.deleted)
}

export function getExpensesByMonth(state: ReplayedState, monthKey: string): Expense[] {
  return getActiveExpenses(state).filter(e => e.date?.startsWith(monthKey))
}

export function getSpendingExpenses(state: ReplayedState, monthKey: string): Expense[] {
  return getExpensesByMonth(state, monthKey).filter(
    e => !e._debtId && !e._goalId && !e._savingsMonthKey,
  )
}

export function getIncomesByMonth(state: ReplayedState, monthKey: string): Income[] {
  return state.incomes.filter(i => !i.deleted && i.month === monthKey)
}

export function getActiveGoals(state: ReplayedState): Goal[] {
  return state.goals.filter(g => !g.deleted)
}

export function getActiveDebts(state: ReplayedState): Debt[] {
  return state.debts.filter(d => !d.deleted)
}

export function getActiveTemplates(state: ReplayedState): Template[] {
  return state.templates.filter(t => !t.deleted)
}