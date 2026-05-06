import type { EventDoc } from '@/lib/types/events'
import type { Expense }  from '@/lib/types/expense'
import type { Income }   from '@/lib/types/income'
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

// ─── Sort helper ──────────────────────────────────────────────────────────────
//
// FIX CONC-02 + CONC-03:
//
// Original: sorted only by `timestamp.toMillis()` — Firestore server timestamp
// with 1-second precision. Two problems:
//
//   Problem A (CONC-02): No tiebreaker. Events from different devices that
//   arrive within the same second have non-deterministic replay order.
//   Example: Device A updates amount at 10:00:01.400, Device B updates note
//   at 10:00:01.600. Both get server timestamp = 10:00:01. Which wins? Undefined.
//
//   Problem B (CONC-03): Wrong ordering under network delay. Device A acts at
//   T1=10:00:01, reaches Firestore at T1+900ms. Device B acts at T2=10:00:02
//   (LATER), reaches Firestore at T2+100ms = 10:00:02.1. Server sorts:
//   B(10:00:02.1) < A(10:00:01.9)... wait, A arrives later. So A wins by server
//   timestamp, but B's action was more recent. Correct LWW should give B.
//
// Fix: use `clientTimestamp` (ISO string set on client at action time) as the
// primary sort key. Fall back to `createdAt` then `timestamp.toMillis()` for
// backward-compat with old events that lack clientTimestamp.
//
// clientTimestamp has millisecond precision and represents user INTENT time,
// not network delivery time → correct LWW across devices.

function getEventMs(event: EventDoc): number {
  // clientTimestamp is the authoritative LWW key (see events.ts)
  if (event.clientTimestamp) return new Date(event.clientTimestamp).getTime()
  // Backward-compat: old events only have createdAt or server timestamp
  if (event.createdAt)       return new Date(event.createdAt).getTime()
  return event.timestamp?.toMillis?.() ?? 0
}

function sortEvents(events: EventDoc[]): EventDoc[] {
  return [...events].sort((a, b) => {
    const aMs = getEventMs(a)
    const bMs = getEventMs(b)
    if (aMs !== bMs) return aMs - bMs
    // Tiebreaker: Firestore server timestamp (sub-second if nanoseconds present)
    const aServer = a.timestamp?.toMillis?.() ?? 0
    const bServer = b.timestamp?.toMillis?.() ?? 0
    if (aServer !== bServer) return aServer - bServer
    // Final tiebreaker: lexicographic event id (deterministic, stable)
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}

// ─── Timestamp comparison helpers ────────────────────────────────────────────

/** Returns ms for an event — used for tombstone comparison */
function eventMs(event: EventDoc): number {
  return getEventMs(event)
}

/** Parse a stored ISO timestamp string to ms, 0 if missing */
function isoToMs(iso: string | undefined | null): number {
  if (!iso) return 0
  const ms = new Date(iso).getTime()
  return isNaN(ms) ? 0 : ms
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function getOrCreatePlan(
  plans: Record<string, SavingsPlan>,
  monthKey: string,
  userId: string,
): SavingsPlan {
  if (!plans[monthKey]) {
    plans[monthKey] = { monthKey, userId, targetAmount: 0, deposits: [], withdrawals: [] }
  }
  if (!Array.isArray(plans[monthKey].deposits))    plans[monthKey].deposits   = []
  if (!Array.isArray(plans[monthKey].withdrawals)) plans[monthKey].withdrawals = []
  return plans[monthKey]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeId(item: any): string | undefined {
  return item?.id ?? item?._id ?? undefined
}

// ─── Main replay function ─────────────────────────────────────────────────────

export function replay(events: EventDoc[]): ReplayedState {
  const state  = emptyState()
  const sorted = sortEvents(events)

  for (const event of sorted) {
    try {
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
          if (idx === -1) break
          if (state.expenses[idx].userId && state.expenses[idx].userId !== userId) break

          // FIX CONC-04: Tombstone guard — delete vs update conflict resolution.
          //
          // Scenario: Device A deletes expense at T1. Device B (offline) had
          // already queued an update at T2 (T2 > T1). When B comes online, its
          // update is written to Firestore. replay() processes:
          //   EXPENSE_ADDED → EXPENSE_DELETED(T1) → EXPENSE_UPDATED(T2)
          //
          // Before fix: EXPENSE_UPDATED spreads data onto deleted expense.
          // `deleted:true` is preserved (since update data doesn't set deleted),
          // BUT this is fragile and does NOT implement true LWW semantics.
          // With LWW, the update at T2 > T1 should logically WIN — meaning
          // the expense should be "resurrected" by the later update.
          //
          // Correct LWW rule:
          //   if update.clientTimestamp > delete.clientTimestamp → UPDATE WINS
          //     (later intent: user edited AFTER deleting on another device
          //      → treat as intentional override of the delete)
          //   if update.clientTimestamp < delete.clientTimestamp → DELETE WINS
          //     (user deleted AFTER editing → delete is the final intent)
          //
          // This makes conflict resolution EXPLICIT and PREDICTABLE.
          // All events are preserved in Firestore → zero data loss.
          const existing = state.expenses[idx]
          if (existing.deleted && existing._deletedClientTimestamp) {
            const deleteMs = isoToMs(existing._deletedClientTimestamp)
            const updateMs = eventMs(event)
            if (deleteMs >= updateMs) {
              // Delete is same time or newer → delete intent wins, skip update
              break
            }
            // Update is newer → update wins, undelete the expense
            state.expenses[idx] = {
              ...existing,
              ...(data as Expense),
              deleted:                   false,
              deletedAt:                 undefined,
              _deletedClientTimestamp:   undefined,
            }
            break
          }

          // Normal update (expense not deleted)
          state.expenses[idx] = { ...existing, ...(data as Expense) }
          break
        }

        case 'EXPENSE_DELETED': {
          if (!data.id) break
          const idx = state.expenses.findIndex(e => e.id === data.id)
          if (idx === -1) break
          if (state.expenses[idx].userId && state.expenses[idx].userId !== userId) break

          state.expenses[idx] = {
            ...state.expenses[idx],
            deleted:   true,
            deletedAt: (data.deletedAt as string) ?? new Date().toISOString(),
            // FIX CONC-04: store the delete's clientTimestamp for tombstone comparison
            // in future EXPENSE_UPDATED events (see guard above)
            _deletedClientTimestamp: event.clientTimestamp ?? event.createdAt ?? new Date().toISOString(),
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
          if (idx !== -1 && (!state.incomes[idx].userId || state.incomes[idx].userId === userId)) {
            state.incomes[idx] = {
              ...state.incomes[idx],
              deleted:   true,
              deletedAt: (data.deletedAt as string) ?? new Date().toISOString(),
              _deletedClientTimestamp: event.clientTimestamp ?? event.createdAt,
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
          if (idx !== -1 && (!state.goals[idx].userId || state.goals[idx].userId === userId)) {
            state.goals[idx] = {
              ...state.goals[idx],
              deleted: true,
              _deletedClientTimestamp: event.clientTimestamp ?? event.createdAt,
            }
          }
          break
        }

        // ── GOAL DEPOSIT (delta events — race-safe) ───────────────────────────

        case 'GOAL_DEPOSIT_ADDED': {
          if (!data.goalId || !data.deposit) break
          const raw = data.deposit as { id: string; amount: number; date: string; note?: string }
          if (!raw.id) break
          const dep: GoalDeposit = { id: raw.id, amount: raw.amount, date: raw.date, note: raw.note ?? '' }
          const idx = state.goals.findIndex(g => g.id === data.goalId)
          if (idx === -1) break
          const existing = state.goals[idx]
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
          if (idx === -1 || (state.goals[idx].userId && state.goals[idx].userId !== userId)) break
          const existing = state.goals[idx]
          const newDeposits = existing.deposits.map(d =>
            d.id === data.depositId
              ? {
                  ...d,
                  ...(data.amount !== undefined && { amount: data.amount as number }),
                  ...(data.date   !== undefined && { date:   data.date   as string }),
                  ...(data.note   !== undefined && { note:   data.note   as string }),
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
          if (idx === -1 || (state.goals[idx].userId && state.goals[idx].userId !== userId)) break
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
          if (idx !== -1 && (!state.debts[idx].userId || state.debts[idx].userId === userId)) {
            const existing = state.debts[idx]
            if (data.payment && typeof data.payment === 'object') {
              const p = data.payment as DebtPayment
              if (!existing.payments.some((x: DebtPayment) => x.id === p.id)) {
                state.debts[idx] = { ...existing, payments: [...existing.payments, { id: p.id, amount: p.amount, date: p.date }] }
              }
              break
            }
            if (data.paymentDelete) {
              state.debts[idx] = { ...existing, payments: existing.payments.filter((p: DebtPayment) => p.id !== data.paymentDelete) }
              break
            }
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
          if (idx !== -1 && (!state.debts[idx].userId || state.debts[idx].userId === userId)) {
            state.debts[idx] = {
              ...state.debts[idx],
              deleted: true,
              _deletedClientTimestamp: event.clientTimestamp ?? event.createdAt,
            }
          }
          break
        }

        // ── DEBT PAYMENT (delta events — race-safe) ───────────────────────────

        case 'DEBT_PAYMENT_ADDED': {
          if (!data.debtId || !data.payment) break
          const p = data.payment as DebtPayment
          if (!p.id) break
          const idx = state.debts.findIndex(d => d.id === data.debtId)
          if (idx === -1 || (state.debts[idx].userId && state.debts[idx].userId !== userId)) break
          const existing = state.debts[idx]
          if (existing.payments.some(x => x.id === p.id)) break
          state.debts[idx] = { ...existing, payments: [...existing.payments, { id: p.id, amount: p.amount, date: p.date }] }
          break
        }

        case 'DEBT_PAYMENT_DELETED': {
          if (!data.debtId || !data.paymentId) break
          const idx = state.debts.findIndex(d => d.id === data.debtId)
          if (idx === -1 || (state.debts[idx].userId && state.debts[idx].userId !== userId)) break
          state.debts[idx] = { ...state.debts[idx], payments: state.debts[idx].payments.filter(p => p.id !== data.paymentId) }
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
          if (idx !== -1 && (!state.templates[idx].userId || state.templates[idx].userId === userId)) {
            state.templates[idx] = {
              ...state.templates[idx],
              deleted: true,
              _deletedClientTimestamp: event.clientTimestamp ?? event.createdAt,
            }
          }
          break
        }

        // ── SAVINGS ────────────────────────────────────────────────────────────

        case 'SAVINGS_TARGET_SET': {
          if (!data.monthKey) break
          const plan = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)
          if (!plan.userId || plan.userId === userId) {
            plan.targetAmount = (data.targetAmount as number) ?? 0
          }
          break
        }

        case 'SAVINGS_DEPOSIT': {
          if (!data.monthKey) break
          const plan = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw: any = data.deposit ?? data
          if (!raw?.id) break
          const deposit: SavingsDeposit = {
            id:          raw.id,
            amount:      raw.amount      ?? 0,
            date:        raw.date        ?? '',
            note:        raw.note        ?? '',
            allocations: Array.isArray(raw.allocations) ? raw.allocations : [],
          }
          if (!plan.deposits.some(d => d.id === deposit.id)) plan.deposits.push(deposit)
          break
        }

        case 'SAVINGS_DEPOSIT_DELETED': {
          if (!data.monthKey) break
          const plan = state.savingsPlans[data.monthKey as string]
          if (plan && (!plan.userId || plan.userId === userId) && data.depositId) {
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
            if (!deposit.allocations.some(a => safeId(a) === data.allocationId) && data.allocationId) {
              deposit.allocations.push({
                id:     data.allocationId as string,
                goalId: data.goalId        as string,
                amount: (data.amount as number) ?? 0,
                date:   (data.date   as string) ?? '',
              } as SavingsAllocation)
            }
          }
          break
        }

        case 'SAVINGS_ALLOCATION_DELETED': {
          if (!data.monthKey) break
          const plan = state.savingsPlans[data.monthKey as string]
          if (plan && (!plan.userId || plan.userId === userId) && data.depositId) {
            const deposit = plan.deposits.find(d => d.id === data.depositId)
            if (deposit && Array.isArray(deposit.allocations)) {
              deposit.allocations = deposit.allocations.filter(a => safeId(a) !== data.allocationId)
            }
          }
          break
        }

        case 'SAVINGS_WITHDRAWN': {
          if (!data.monthKey) break
          const plan = getOrCreatePlan(state.savingsPlans, data.monthKey as string, userId)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          if (!plan.withdrawals.some(w => safeId(w) === withdrawal.id)) plan.withdrawals.push(withdrawal)
          break
        }

        case 'SAVINGS_WITHDRAWAL_DELETED': {
          if (!data.monthKey) break
          const plan = state.savingsPlans[data.monthKey as string]
          if (plan && (!plan.userId || plan.userId === userId) && data.withdrawalId) {
            plan.withdrawals = plan.withdrawals.filter(w => safeId(w) !== data.withdrawalId)
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
export function getActiveGoals(state: ReplayedState):     Goal[]     { return state.goals.filter(g => !g.deleted) }
export function getActiveDebts(state: ReplayedState):     Debt[]     { return state.debts.filter(d => !d.deleted) }
export function getActiveTemplates(state: ReplayedState): Template[] { return state.templates.filter(t => !t.deleted) }