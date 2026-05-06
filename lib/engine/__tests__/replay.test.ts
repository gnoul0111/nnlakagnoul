import { replay, getActiveExpenses, getSpendingExpenses, getActiveGoals, getActiveDebts } from '../replay'
import type { EventDoc } from '@/lib/types/events'
import type { Timestamp } from 'firebase/firestore'

// ─── Test helpers ─────────────────────────────────────────────────────────────

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

// ─── EXPENSE ──────────────────────────────────────────────────────────────────

describe('replay — Expense', () => {
  test('EXPENSE_ADDED thêm expense vào state', () => {
    const events = [
      makeEvent('EXPENSE_ADDED', {
        id: 'exp_1', userId: 'user1', amount: 50000,
        category: 'food', date: '2026-03-15', note: 'Cơm trưa',
      }),
    ]
    const state = replay(events)
    expect(state.expenses).toHaveLength(1)
    expect(state.expenses[0].id).toBe('exp_1')
    expect(state.expenses[0].amount).toBe(50000)
  })

  test('EXPENSE_ADDED dedup — không thêm duplicate', () => {
    const events = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-15', note: '' }),
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-15', note: '' }),
    ]
    const state = replay(events)
    expect(state.expenses).toHaveLength(1)
  })

  test('EXPENSE_UPDATED cập nhật đúng expense', () => {
    const events = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-15', note: '' }),
      makeEvent('EXPENSE_UPDATED', { id: 'exp_1', amount: 75000, note: 'Cơm + nước' }),
    ]
    const state = replay(events)
    expect(state.expenses[0].amount).toBe(75000)
    expect(state.expenses[0].note).toBe('Cơm + nước')
    expect(state.expenses[0].category).toBe('food') // không bị override
  })

  test('EXPENSE_DELETED soft-delete expense', () => {
    const events = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-15', note: '' }),
      makeEvent('EXPENSE_DELETED', { id: 'exp_1' }),
    ]
    const state = replay(events)
    expect(state.expenses[0].deleted).toBe(true)
    // getActiveExpenses lọc ra
    expect(getActiveExpenses(state)).toHaveLength(0)
  })

  test('getSpendingExpenses loại bỏ linked expenses', () => {
    const events = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 100000, category: 'food', date: '2026-03-10', note: '' }),
      makeEvent('EXPENSE_ADDED', { id: 'exp_2', amount: 200000, category: 'other', date: '2026-03-11', note: '', _debtId: 'debt_1' }),
      makeEvent('EXPENSE_ADDED', { id: 'exp_3', amount: 300000, category: 'other', date: '2026-03-12', note: '', _goalId: 'goal_1' }),
      makeEvent('EXPENSE_ADDED', { id: 'exp_4', amount: 400000, category: 'other', date: '2026-03-13', note: '', _savingsMonthKey: '2026-03' }),
    ]
    const state = replay(events)
    const spending = getSpendingExpenses(state, '2026-03')
    expect(spending).toHaveLength(1)
    expect(spending[0].id).toBe('exp_1')
  })

  test('events sort by timestamp — không phụ thuộc thứ tự array', () => {
    // Thêm expense ở timestamp cao hơn trước
    const e1 = makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 100, category: 'food', date: '2026-03-01', note: '' })
    const e2 = makeEvent('EXPENSE_UPDATED', { id: 'exp_1', amount: 200 })
    // Đảo ngược thứ tự
    const state = replay([e2, e1])
    expect(state.expenses[0].amount).toBe(200) // update thắng vì timestamp cao hơn
  })
})

// ─── INCOME ───────────────────────────────────────────────────────────────────

describe('replay — Income', () => {
  test('INCOME_ADDED thêm income', () => {
    const events = [
      makeEvent('INCOME_ADDED', {
        id: 'inc_1', userId: 'user1', amount: 5000000,
        source: 'Lương', date: '2026-03-01', month: '2026-03', note: '',
      }),
    ]
    const state = replay(events)
    expect(state.incomes).toHaveLength(1)
    expect(state.incomes[0].source).toBe('Lương')
  })

  test('INCOME_CREATED alias hoạt động như INCOME_ADDED', () => {
    const events = [
      makeEvent('INCOME_CREATED', {
        id: 'inc_2', userId: 'user1', amount: 1000000,
        source: 'Freelance', date: '2026-03-15', month: '2026-03', note: '',
      }),
    ]
    const state = replay(events)
    expect(state.incomes).toHaveLength(1)
  })

  test('INCOME_DELETED soft-delete income', () => {
    const events = [
      makeEvent('INCOME_ADDED', { id: 'inc_1', amount: 5000000, source: 'Lương', date: '2026-03-01', month: '2026-03', note: '' }),
      makeEvent('INCOME_DELETED', { id: 'inc_1' }),
    ]
    const state = replay(events)
    expect(state.incomes[0].deleted).toBe(true)
  })
})

// ─── GOAL ────────────────────────────────────────────────────────────────────

describe('replay — Goal', () => {
  test('GOAL_ADDED tạo goal với deposits rỗng', () => {
    const events = [
      makeEvent('GOAL_ADDED', {
        id: 'goal_1', userId: 'user1', name: 'Mua iPhone',
        icon: '📱', targetAmount: 25000000, currentAmount: 0,
        deadline: '2026-12-31', deposits: [], deleted: false,
        createdTimestamp: 1700000000,
      }),
    ]
    const state = replay(events)
    expect(state.goals).toHaveLength(1)
    expect(state.goals[0].deposits).toEqual([])
  })

  test('GOAL_UPDATED cập nhật fields nhưng giữ deposits nếu không truyền', () => {
    const events = [
      makeEvent('GOAL_ADDED', {
        id: 'goal_1', name: 'Mua iPhone', icon: '📱', targetAmount: 25000000,
        currentAmount: 0, deadline: '2026-12-31', deposits: [], deleted: false,
        createdTimestamp: 1700000000,
      }),
      makeEvent('GOAL_UPDATED', {
        id: 'goal_1',
        deposits: [{ id: 'dep_1', amount: 5000000, date: '2026-03-15', note: '' }],
        currentAmount: 5000000,
      }),
    ]
    const state = replay(events)
    expect(state.goals[0].deposits).toHaveLength(1)
    expect(state.goals[0].deposits[0].amount).toBe(5000000)
    expect(state.goals[0].currentAmount).toBe(5000000)
    expect(state.goals[0].name).toBe('Mua iPhone') // giữ field cũ
  })

  test('GOAL_DELETED soft-delete goal', () => {
    const events = [
      makeEvent('GOAL_ADDED', {
        id: 'goal_1', name: 'Test', icon: '🎯', targetAmount: 1000000,
        currentAmount: 0, deadline: '2026-12-31', deposits: [], deleted: false,
        createdTimestamp: 1700000000,
      }),
      makeEvent('GOAL_DELETED', { id: 'goal_1' }),
    ]
    const state = replay(events)
    expect(state.goals[0].deleted).toBe(true)
    expect(getActiveGoals(state)).toHaveLength(0)
  })

  test('GOAL_CREATED alias hoạt động', () => {
    const events = [
      makeEvent('GOAL_CREATED', {
        id: 'goal_2', name: 'Du lịch', icon: '✈️', targetAmount: 10000000,
        currentAmount: 0, deadline: '2026-06-01', deposits: [], deleted: false,
        createdTimestamp: 1700000000,
      }),
    ]
    const state = replay(events)
    expect(state.goals).toHaveLength(1)
  })
})

// ─── DEBT ────────────────────────────────────────────────────────────────────

describe('replay — Debt', () => {
  test('DEBT_CREATED tạo debt với payments rỗng', () => {
    const events = [
      makeEvent('DEBT_CREATED', {
        id: 'debt_1', userId: 'user1', name: 'Nguyễn Văn A',
        amount: 2000000, type: 'borrow', dueDate: '2026-06-01',
        note: '', paidAmount: 0, payments: [], deleted: false,
        createdAt: 1700000000,
      }),
    ]
    const state = replay(events)
    expect(state.debts).toHaveLength(1)
    expect(state.debts[0].payments).toEqual([])
  })

  test('DEBT_UPDATED thêm payments giữ nguyên fields khác', () => {
    const events = [
      makeEvent('DEBT_CREATED', {
        id: 'debt_1', name: 'A', amount: 2000000, type: 'borrow',
        dueDate: '2026-06-01', note: '', paidAmount: 0, payments: [], deleted: false,
        createdAt: 1700000000,
      }),
      makeEvent('DEBT_UPDATED', {
        id: 'debt_1',
        payments: [{ id: 'pay_1', amount: 500000, date: '2026-03-10' }],
        paidAmount: 500000,
      }),
    ]
    const state = replay(events)
    expect(state.debts[0].payments).toHaveLength(1)
    expect(state.debts[0].paidAmount).toBe(500000)
    expect(state.debts[0].name).toBe('A') // giữ nguyên
  })

  test('DEBT_DELETED soft-delete', () => {
    const events = [
      makeEvent('DEBT_CREATED', {
        id: 'debt_1', name: 'B', amount: 1000000, type: 'lend',
        dueDate: '2026-06-01', note: '', paidAmount: 0, payments: [], deleted: false,
        createdAt: 1700000000,
      }),
      makeEvent('DEBT_DELETED', { id: 'debt_1' }),
    ]
    const state = replay(events)
    expect(getActiveDebts(state)).toHaveLength(0)
  })
})

// ─── TEMPLATE ────────────────────────────────────────────────────────────────

describe('replay — Template', () => {
  test('TEMPLATE_CREATED thêm template', () => {
    const events = [
      makeEvent('TEMPLATE_CREATED', {
        id: 'tpl_1', userId: 'user1', title: 'Internet',
        category: 'bills', amount: 200000, note: '',
      }),
    ]
    const state = replay(events)
    expect(state.templates).toHaveLength(1)
    expect(state.templates[0].title).toBe('Internet')
  })

  test('TEMPLATE_DELETED soft-delete template', () => {
    const events = [
      makeEvent('TEMPLATE_CREATED', {
        id: 'tpl_1', title: 'Internet', category: 'bills', amount: 200000, note: '',
      }),
      makeEvent('TEMPLATE_DELETED', { id: 'tpl_1' }),
    ]
    const state = replay(events)
    expect(state.templates[0].deleted).toBe(true)
  })
})

// ─── SAVINGS ─────────────────────────────────────────────────────────────────

describe('replay — Savings', () => {
  test('SAVINGS_TARGET_SET tạo plan mới với target', () => {
    const events = [
      makeEvent('SAVINGS_TARGET_SET', { monthKey: '2026-03', targetAmount: 2000000 }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03']).toBeDefined()
    expect(state.savingsPlans['2026-03'].targetAmount).toBe(2000000)
  })

  test('SAVINGS_DEPOSIT thêm deposit vào plan', () => {
    const events = [
      makeEvent('SAVINGS_TARGET_SET', { monthKey: '2026-03', targetAmount: 2000000 }),
      makeEvent('SAVINGS_DEPOSIT', {
        monthKey: '2026-03',
        deposit: { id: 'dep_1', amount: 1000000, date: '2026-03-10', note: '', allocations: [] },
      }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03'].deposits).toHaveLength(1)
    expect(state.savingsPlans['2026-03'].deposits[0].amount).toBe(1000000)
  })

  test('SAVINGS_DEPOSIT_DELETED xóa deposit', () => {
    const events = [
      makeEvent('SAVINGS_DEPOSIT', {
        monthKey: '2026-03',
        deposit: { id: 'dep_1', amount: 1000000, date: '2026-03-10', note: '', allocations: [] },
      }),
      makeEvent('SAVINGS_DEPOSIT_DELETED', { monthKey: '2026-03', depositId: 'dep_1' }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03'].deposits).toHaveLength(0)
  })

  test('SAVINGS_DEPOSIT dedup — không thêm deposit trùng id', () => {
    const deposit = { id: 'dep_1', amount: 1000000, date: '2026-03-10', note: '', allocations: [] }
    const events = [
      makeEvent('SAVINGS_DEPOSIT', { monthKey: '2026-03', deposit }),
      makeEvent('SAVINGS_DEPOSIT', { monthKey: '2026-03', deposit }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03'].deposits).toHaveLength(1)
  })

  test('SAVINGS_WITHDRAWN thêm withdrawal', () => {
    const events = [
      makeEvent('SAVINGS_WITHDRAWN', {
        monthKey: '2026-03',
        withdrawal: {
          id: 'wd_1', amount: 200000, date: '2026-03-20',
          reason: 'Mua đồ', type: 'spend', goalId: null, goalDepositId: null,
        },
      }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03'].withdrawals).toHaveLength(1)
  })

  test('SAVINGS_WITHDRAWAL_DELETED xóa withdrawal', () => {
    const events = [
      makeEvent('SAVINGS_WITHDRAWN', {
        monthKey: '2026-03',
        withdrawal: { id: 'wd_1', amount: 200000, date: '2026-03-20', reason: '', type: 'spend' },
      }),
      makeEvent('SAVINGS_WITHDRAWAL_DELETED', { monthKey: '2026-03', withdrawalId: 'wd_1' }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03'].withdrawals).toHaveLength(0)
  })

  test('SAVINGS_ALLOCATED thêm allocation vào deposit', () => {
    const events = [
      makeEvent('SAVINGS_DEPOSIT', {
        monthKey: '2026-03',
        deposit: { id: 'dep_1', amount: 1000000, date: '2026-03-10', note: '', allocations: [] },
      }),
      makeEvent('SAVINGS_ALLOCATED', {
        monthKey: '2026-03', depositId: 'dep_1',
        goalId: 'goal_1', amount: 500000, date: '2026-03-15', allocationId: 'alloc_1',
      }),
    ]
    const state = replay(events)
    expect(state.savingsPlans['2026-03'].deposits[0].allocations).toHaveLength(1)
    expect(state.savingsPlans['2026-03'].deposits[0].allocations[0].goalId).toBe('goal_1')
  })
})

// ─── Multi-user isolation ─────────────────────────────────────────────────────

describe('replay — Multi-user', () => {
  test('events từ userId khác nhau được xử lý độc lập', () => {
    const events = [
      makeEvent('EXPENSE_ADDED', { id: 'exp_u1', amount: 100000, category: 'food', date: '2026-03-01', note: '' }, 'user1'),
      makeEvent('EXPENSE_ADDED', { id: 'exp_u2', amount: 200000, category: 'food', date: '2026-03-01', note: '' }, 'user2'),
    ]
    // Replay engine không filter theo userId — đó là việc của Firestore query
    // (query where userId == currentUser.uid)
    // Test chỉ verify cả 2 expenses đều được replay
    const state = replay(events)
    expect(state.expenses).toHaveLength(2)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('replay — Edge cases', () => {
  test('events array rỗng trả về empty state', () => {
    const state = replay([])
    expect(state.expenses).toHaveLength(0)
    expect(state.incomes).toHaveLength(0)
    expect(state.goals).toHaveLength(0)
    expect(state.debts).toHaveLength(0)
    expect(state.templates).toHaveLength(0)
    expect(Object.keys(state.savingsPlans)).toHaveLength(0)
  })

  test('unknown event type bị bỏ qua (forward compat)', () => {
    const events = [
      makeEvent('UNKNOWN_FUTURE_EVENT' as never, { id: 'x' }),
      makeEvent('EXPENSE_ADDED', { id: 'exp_1', amount: 50000, category: 'food', date: '2026-03-01', note: '' }),
    ]
    const state = replay(events)
    expect(state.expenses).toHaveLength(1)
  })

  test('update expense không tồn tại không crash', () => {
    const events = [
      makeEvent('EXPENSE_UPDATED', { id: 'nonexistent', amount: 999 }),
    ]
    expect(() => replay(events)).not.toThrow()
  })
})