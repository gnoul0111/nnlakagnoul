import { appendEvent } from './eventService'
import { addExpense, deleteExpense } from './expenseService'
import { addGoalDeposit, deleteGoalDeposit } from './goalService'
import { EVENT_TYPES } from '@/lib/types/events'
import type { SavingsPlan, SavingsDeposit, SavingsWithdrawal } from '@/lib/types/savings'
import type { Goal } from '@/lib/types/goal'
import { newDepositId, newWithdrawId, newAllocId } from '@/lib/utils/id'
import { today } from '@/lib/utils/date'

// ─── Savings Target ───────────────────────────────────────────────────────────

export async function setSavingsTarget(
  userId: string,
  monthKey: string,
  targetAmount: number,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_TARGET_SET,
    createdAt: new Date().toISOString(),
    data: { monthKey, targetAmount },
  })
}

// ─── Deposit ──────────────────────────────────────────────────────────────────

export interface SavingsDepositInput {
  amount: number
  date?: string
  note?: string
}

export interface SavingsDepositOptions {
  /**
   * Nếu true (default), tạo linked expense với _savingsMonthKey
   * Flow C: Nạp tiền Savings → Expense (section 10.2)
   * Expense này KHÔNG được xóa từ tab Expenses
   */
  addToExpenses?: boolean
}

export async function savingsDeposit(
  userId: string,
  monthKey: string,
  input: SavingsDepositInput,
  options: SavingsDepositOptions = { addToExpenses: true },
): Promise<{ depositId: string; linkedExpenseId: string | null }> {
  const depositId = newDepositId()
  const date = input.date ?? today()

  const deposit: SavingsDeposit = {
    id: depositId,
    amount: input.amount,
    date,
    note: input.note ?? '',
    allocations: [],
  }

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_DEPOSIT,
    createdAt: new Date().toISOString(),
    data: { monthKey, deposit },
  })

  // Flow C: tạo linked expense (default: checked)
  let linkedExpenseId: string | null = null
  if (options.addToExpenses !== false) {
    const [y, m] = monthKey.split('-')
    linkedExpenseId = await addExpense(userId, {
      amount: input.amount,
      category: 'other',
      date,
      note: input.note || `Tiết kiệm tháng ${parseInt(m)}/${y}`,
      _savingsMonthKey: monthKey,
      _savingsDepositId: depositId,
    })
  }

  return { depositId, linkedExpenseId }
}

/**
 * Xóa lần nạp tiền.
 * Nếu có linked expense → xóa luôn expense (không hỏi — expense này thuộc savings)
 */
export async function deleteSavingsDeposit(
  userId: string,
  monthKey: string,
  depositId: string,
  linkedExpenseId?: string | null,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_DEPOSIT_DELETED,
    createdAt: new Date().toISOString(),
    data: { monthKey, depositId },
  })

  // Xóa linked expense nếu có
  if (linkedExpenseId) {
    await deleteExpense(userId, linkedExpenseId)
  }
}

// ─── Allocation ───────────────────────────────────────────────────────────────

export interface AllocateInput {
  depositId: string
  goalId: string
  amount: number
  date?: string
}

export async function allocateSavings(
  userId: string,
  monthKey: string,
  input: AllocateInput,
): Promise<string> {
  const allocationId = newAllocId()

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_ALLOCATED,
    createdAt: new Date().toISOString(),
    data: {
      monthKey,
      depositId: input.depositId,
      goalId: input.goalId,
      amount: input.amount,
      date: input.date ?? today(),
      allocationId,
    },
  })

  return allocationId
}

export async function deleteAllocation(
  userId: string,
  monthKey: string,
  depositId: string,
  allocationId: string,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_ALLOCATION_DELETED,
    createdAt: new Date().toISOString(),
    data: { monthKey, depositId, allocationId },
  })
}

// ─── Withdrawal ───────────────────────────────────────────────────────────────

export interface WithdrawInput {
  amount: number
  date?: string
  reason?: string
  type: 'spend' | 'goal'
  goalId?: string | null
}

/**
 * Rút tiền từ savings.
 *
 * Luồng phức tạp nhất — Savings → Goal (section 10.3):
 * Nếu type='goal', tự động addDeposit vào goal và lưu goalDepositId.
 * Tạo liên kết 3 chiều: withdrawal ↔ goal deposit.
 */
export async function savingsWithdraw(
  userId: string,
  monthKey: string,
  input: WithdrawInput,
  currentGoal?: Goal | null,
): Promise<{ withdrawalId: string; goalDepositId: string | null }> {
  const withdrawalId = newWithdrawId()
  const date = input.date ?? today()
  let goalDepositId: string | null = null

  // Luồng Savings → Goal: auto add deposit vào goal
  if (input.type === 'goal' && input.goalId && currentGoal) {
    const result = await addGoalDeposit(
      userId,
      currentGoal,
      { amount: input.amount, date, note: `Từ tiết kiệm` },
      { addToExpenses: false }, // Savings withdrawal không tạo expense riêng
    )
    goalDepositId = result.depositId
  }

  const withdrawal: SavingsWithdrawal = {
    id: withdrawalId,
    amount: input.amount,
    date,
    reason: input.reason ?? '',
    type: input.type,
    goalId: input.goalId ?? null,
    goalDepositId,
  }

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_WITHDRAWN,
    createdAt: new Date().toISOString(),
    data: { monthKey, withdrawal },
  })

  return { withdrawalId, goalDepositId }
}

/**
 * Xóa lần rút tiền.
 * Cascade (section 10.4): nếu type='goal' và có goalDepositId → hỏi user.
 */
export async function deleteSavingsWithdrawal(
  userId: string,
  monthKey: string,
  withdrawalId: string,
  options: {
    deleteLinkedGoalDeposit?: boolean
    goalId?: string | null
    goalDepositId?: string | null
    currentGoal?: Goal | null
  } = {},
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.SAVINGS_WITHDRAWAL_DELETED,
    createdAt: new Date().toISOString(),
    data: { monthKey, withdrawalId },
  })

  // Cascade: xóa goal deposit nếu user chọn "Xóa cả hai"
  if (
    options.deleteLinkedGoalDeposit &&
    options.goalId &&
    options.goalDepositId &&
    options.currentGoal
  ) {
    await deleteGoalDeposit(userId, options.currentGoal, options.goalDepositId)
  }
}

// ─── Cascade helpers ─────────────────────────────────────────────────────────

/**
 * Tìm linked expense của 1 savings deposit
 * (dùng để xóa expense khi xóa deposit)
 */
export function findSavingsDepositExpense(
  depositId: string,
  expenses: Array<{ id: string; _savingsDepositId?: string | null; deleted?: boolean }>,
): string | null {
  return (
    expenses.find(e => !e.deleted && e._savingsDepositId === depositId)?.id ?? null
  )
}

/**
 * Fallback matching cho data cũ (trước khi có goalDepositId field):
 * tìm goal deposit bằng goalId + amount + date.
 *
 * Nếu có nhiều deposit cùng amount+date → trả null (ambiguous, không đoán bừa)
 * để caller xử lý bằng cách khác (VD: yêu cầu user chọn thủ công).
 */
export function findGoalDepositFallback(
  goalId: string,
  amount: number,
  date: string,
  goal: Goal,
): string | null {
  const matches = goal.deposits.filter(
    d => d.amount === amount && d.date === date,
  )
  if (matches.length !== 1) return null // 0 match hoặc nhiều match → không chắc chắn
  return matches[0].id
}
