/**
 * Tests cho applyEvent() — incremental state update.
 *
 * Chiến lược: với mỗi loại event, kiểm tra rằng:
 *   applyEvent(currentState, newEvent) ≡ replay([...existingEvents, newEvent])
 *
 * Đây là invariant quan trọng nhất: incremental phải cho kết quả
 * giống hệt full replay trên cùng tập events.
 */

import { replay, applyEvent, emptyState, type ReplayedState } from '../replay'
import type { EventDoc } from '@/lib/types/events'
import type { Timestamp } from 'firebase/firestore'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTimestamp(ms: number): Timestamp {
  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
    seconds: Math.floor(ms / 1000),
    nanoseconds: 0,
  } as unknown as Timestamp
}

let seq = 0
function makeEvent(
  eventType: string,
  data: Record<string, unknown>,
  userId = 'user1',
): EventDoc {
  seq++
  return {
    id: `evt_${seq}`,
    userId,
    eventType: eventType as EventDoc['eventType'],
    data,
    timestamp: makeTimestamp(seq * 1000),
    createdAt: new Date(seq * 1000).toISOString(),
    clientTimestamp: new Date(seq * 1000).toISOString(),
  }
}

beforeEach(() => { seq = 0 })

/**
 * Helper: simulate appendLocalEvent incremental behavior.
 * Clone state (như eventStore làm), rồi applyEvent.
 */
function incrementalApply(base: ReplayedState, event: EventDoc): ReplayedState {
  const state: ReplayedState = {
    expenses:     [...base.expenses],
    incomes:      [...base.incomes],
    goals:        [...base.goals],
    debts:        [...base.debts],
    templates:    [...base.templates],
    savingsPlans: structuredClone(base.savingsPlans),
  }
  applyEvent(state, event)
  return state
}

// ─── Invariant: incremental === full replay ───────────────────────────────────

describe('applyEvent — incremental ≡ full replay', () => {

  // Expense
  test('EXPENSE_ADDED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-01', note: '' }),
    ]
    const newEvent = makeEvent('EXPENSE_ADDED', { id: 'exp_2', amount: 30000, category: 'transport', date: '2026-03-02', note: '' })

    const baseState    = replay(existingEvents)
    const incremental  = incrementalApply(baseState, newEvent)
    const fullReplay   = replay([...existingEvents, newEvent])

    expect(incremental.expenses).toHaveLength(fullReplay.expenses.length)
    expect(incremental.expenses.map(e => e.id).sort())
      .toEqual(fullReplay.expenses.map(e => e.id).sort())
  })

  test('EXPENSE_UPDATED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-01', note: '' }),
    ]
    const newEvent = makeEvent('EXPENSE_UPDATED', { id: 'exp_1', amount: 75000, note: 'Updated' })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.expenses[0].amount).toBe(fullReplay.expenses[0].amount)
    expect(incremental.expenses[0].note).toBe(fullReplay.expenses[0].note)
    expect(incremental.expenses[0].category).toBe(fullReplay.expenses[0].category)
  })

  test('EXPENSE_DELETED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-01', note: '' }),
    ]
    const newEvent = makeEvent('EXPENSE_DELETED', { id: 'exp_1', deletedAt: new Date().toISOString() })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.expenses[0].deleted).toBe(fullReplay.expenses[0].deleted)
    expect(incremental.expenses[0].deletedAt).toBe(fullReplay.expenses[0].deletedAt)
  })

  // Goal deposit (delta events — phức tạp nhất)
  test('GOAL_DEPOSIT_ADDED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('GOAL_ADDED', {
        id: 'goal_1', name: 'Mua iPhone', icon: '📱',
        targetAmount: 25000000, currentAmount: 0, deadline: '2026-12-31',
        deposits: [], deleted: false, createdTimestamp: 1700000000,
      }),
    ]
    const newEvent = makeEvent('GOAL_DEPOSIT_ADDED', {
      goalId: 'goal_1',
      deposit: { id: 'dep_1', amount: 5000000, date: '2026-03-15', note: '' },
    })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.goals[0].deposits).toHaveLength(fullReplay.goals[0].deposits.length)
    expect(incremental.goals[0].currentAmount).toBe(fullReplay.goals[0].currentAmount)
  })

  test('GOAL_DEPOSIT_DELETED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('GOAL_ADDED', {
        id: 'goal_1', name: 'Test', icon: '🎯', targetAmount: 10000000,
        currentAmount: 0, deadline: '2026-12-31', deposits: [], deleted: false,
        createdTimestamp: 1700000000,
      }),
      makeEvent('GOAL_DEPOSIT_ADDED', {
        goalId: 'goal_1',
        deposit: { id: 'dep_1', amount: 5000000, date: '2026-03-15', note: '' },
      }),
    ]
    const newEvent = makeEvent('GOAL_DEPOSIT_DELETED', { goalId: 'goal_1', depositId: 'dep_1' })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.goals[0].deposits).toHaveLength(fullReplay.goals[0].deposits.length)
    expect(incremental.goals[0].currentAmount).toBe(fullReplay.goals[0].currentAmount)
  })

  // Debt payment
  test('DEBT_PAYMENT_ADDED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('DEBT_CREATED', {
        id: 'debt_1', name: 'A', amount: 2000000, type: 'borrow',
        dueDate: '2026-06-01', note: '', paidAmount: 0, payments: [],
        deleted: false, createdAt: 1700000000,
      }),
    ]
    const newEvent = makeEvent('DEBT_PAYMENT_ADDED', {
      debtId: 'debt_1',
      payment: { id: 'pay_1', amount: 500000, date: '2026-03-10' },
    })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.debts[0].payments).toHaveLength(fullReplay.debts[0].payments.length)
  })

  // Savings deposit
  test('SAVINGS_DEPOSIT incremental = full replay', () => {
    const existingEvents = [
      makeEvent('SAVINGS_TARGET_SET', { monthKey: '2026-03', targetAmount: 2000000 }),
    ]
    const newEvent = makeEvent('SAVINGS_DEPOSIT', {
      monthKey: '2026-03',
      deposit: { id: 'dep_1', amount: 1000000, date: '2026-03-10', note: '', allocations: [] },
    })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.savingsPlans['2026-03'].deposits)
      .toHaveLength(fullReplay.savingsPlans['2026-03'].deposits.length)
  })

  // Savings trong tháng mới (chưa có plan)
  test('SAVINGS_DEPOSIT tháng mới — incremental tạo plan mới đúng', () => {
    const baseState = replay([]) // empty state — chưa có plan nào
    const newEvent = makeEvent('SAVINGS_DEPOSIT', {
      monthKey: '2026-05',
      deposit: { id: 'dep_1', amount: 500000, date: '2026-05-01', note: '', allocations: [] },
    })

    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([newEvent])

    expect(incremental.savingsPlans['2026-05']).toBeDefined()
    expect(incremental.savingsPlans['2026-05'].deposits[0].id)
      .toBe(fullReplay.savingsPlans['2026-05'].deposits[0].id)
  })

  // Income
  test('INCOME_ADDED incremental = full replay', () => {
    const existingEvents = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-01', note: '' }),
    ]
    const newEvent = makeEvent('INCOME_ADDED', {
      id: 'inc_1', amount: 5000000, source: 'Lương',
      date: '2026-03-01', month: '2026-03', note: '',
    })

    const baseState   = replay(existingEvents)
    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([...existingEvents, newEvent])

    expect(incremental.incomes).toHaveLength(fullReplay.incomes.length)
    // expenses không bị ảnh hưởng
    expect(incremental.expenses).toHaveLength(fullReplay.expenses.length)
  })

  // Template
  test('TEMPLATE_CREATED incremental = full replay', () => {
    const baseState = replay([])
    const newEvent  = makeEvent('TEMPLATE_CREATED', {
      id: 'tpl_1', title: 'Cafe', category: 'food', amount: 40000, note: '',
    })

    const incremental = incrementalApply(baseState, newEvent)
    const fullReplay  = replay([newEvent])

    expect(incremental.templates).toHaveLength(fullReplay.templates.length)
    expect(incremental.templates[0].id).toBe(fullReplay.templates[0].id)
  })
})

// ─── Isolation: applyEvent không mutate state gốc ────────────────────────────

describe('applyEvent — immutability', () => {
  test('incrementalApply không mutate base state', () => {
    const existingEvents = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-01', note: '' }),
    ]
    const baseState = replay(existingEvents)
    const originalExpenseCount = baseState.expenses.length

    const newEvent = makeEvent('EXPENSE_ADDED', { id: 'exp_2', amount: 30000, category: 'food', date: '2026-03-02', note: '' })
    incrementalApply(baseState, newEvent)

    // base state không bị thay đổi
    expect(baseState.expenses).toHaveLength(originalExpenseCount)
  })

  test('incrementalApply savings không mutate savingsPlans gốc', () => {
    const existingEvents = [
      makeEvent('SAVINGS_TARGET_SET', { monthKey: '2026-03', targetAmount: 2000000 }),
      makeEvent('SAVINGS_DEPOSIT', {
        monthKey: '2026-03',
        deposit: { id: 'dep_1', amount: 1000000, date: '2026-03-10', note: '', allocations: [] },
      }),
    ]
    const baseState = replay(existingEvents)
    const originalDepositCount = baseState.savingsPlans['2026-03'].deposits.length

    const newEvent = makeEvent('SAVINGS_DEPOSIT', {
      monthKey: '2026-03',
      deposit: { id: 'dep_2', amount: 500000, date: '2026-03-15', note: '', allocations: [] },
    })
    incrementalApply(baseState, newEvent)

    // base state.savingsPlans không bị mutate
    expect(baseState.savingsPlans['2026-03'].deposits).toHaveLength(originalDepositCount)
  })
})

// ─── emptyState export ───────────────────────────────────────────────────────

describe('emptyState', () => {
  test('trả về state rỗng với đúng shape', () => {
    const s = emptyState()
    expect(s.expenses).toEqual([])
    expect(s.incomes).toEqual([])
    expect(s.goals).toEqual([])
    expect(s.debts).toEqual([])
    expect(s.templates).toEqual([])
    expect(s.savingsPlans).toEqual({})
  })

  test('mỗi lần gọi trả về object mới (không share reference)', () => {
    const s1 = emptyState()
    const s2 = emptyState()
    s1.expenses.push({ id: 'x' } as never)
    expect(s2.expenses).toHaveLength(0)
  })
})