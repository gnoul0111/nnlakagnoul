import { appendEvent } from './eventService'
import { addExpense, updateExpense, deleteExpense } from './expenseService'
import { EVENT_TYPES } from '@/lib/types/events'
import type { Goal, GoalDeposit } from '@/lib/types/goal'
import { newGoalId, newDepositId } from '@/lib/utils/id'
import { today } from '@/lib/utils/date'

// ─── Goal CRUD ────────────────────────────────────────────────────────────────

export interface AddGoalInput {
  name: string
  icon: string
  targetAmount: number
  deadline?: string  // YYYY-MM-DD
}

export async function addGoal(userId: string, input: AddGoalInput): Promise<string> {
  const id = newGoalId()

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.GOAL_ADDED,
    createdAt: new Date().toISOString(),
    data: {
      id,
      userId,
      name: input.name,
      icon: input.icon,
      targetAmount: input.targetAmount,
      currentAmount: 0,
      deadline: input.deadline ?? null,
      deposits: [],
      deleted: false,
      createdTimestamp: Math.floor(Date.now() / 1000),
    },
  })

  return id
}

export interface UpdateGoalInput {
  name?: string
  icon?: string
  targetAmount?: number
  deadline?: string
}

export async function updateGoal(
  userId: string,
  goalId: string,
  updates: UpdateGoalInput,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.GOAL_UPDATED,
    createdAt: new Date().toISOString(),
    data: { id: goalId, ...updates },
  })
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.GOAL_DELETED,
    createdAt: new Date().toISOString(),
    data: { id: goalId },
  })
}

// ─── Deposit management ───────────────────────────────────────────────────────

export interface AddDepositInput {
  amount: number
  date?: string
  note?: string
}

export interface AddDepositOptions {
  /**
   * Nếu true, tạo thêm linked expense với _goalId
   * Flow B: Nạp tiền Goal → Expense (section 10.2)
   */
  addToExpenses?: boolean
}

/**
 * Thêm lần nạp tiền vào goal.
 *
 * SỬ DỤNG DELTA EVENT (GOAL_DEPOSIT_ADDED) thay vì GOAL_UPDATED với full deposits array.
 * Lý do: nếu 2 tab mở cùng lúc cùng thêm deposit → replay theo timestamp sẽ merge đúng
 * thay vì lost update.
 *
 * Returns { depositId, linkedExpenseId }
 */
export async function addGoalDeposit(
  userId: string,
  currentGoal: Goal,
  input: AddDepositInput,
  options: AddDepositOptions = {},
): Promise<{ depositId: string; linkedExpenseId: string | null }> {
  const depositId = newDepositId()
  const date = input.date ?? today()

  const newDeposit: GoalDeposit = {
    id: depositId,
    amount: input.amount,
    date,
    note: input.note ?? '',
  }

  // Delta event — chỉ append deposit mới, replay engine tự tổng hợp deposits
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.GOAL_DEPOSIT_ADDED,
    createdAt: new Date().toISOString(),
    data: {
      goalId:  currentGoal.id,
      deposit: newDeposit,
    },
  })

  // Flow B: tạo linked expense nếu user tick checkbox
  let linkedExpenseId: string | null = null
  if (options.addToExpenses) {
    linkedExpenseId = await addExpense(userId, {
      amount: input.amount,
      category: 'other',
      date,
      note: `Tiết kiệm — ${currentGoal.name}`,
      _goalId: currentGoal.id,
      _depositId: depositId,
    })
  }

  return { depositId, linkedExpenseId }
}

/**
 * Sửa lần nạp tiền.
 * Nếu có linked expense → tự động update expense luôn.
 */
export async function editGoalDeposit(
  userId: string,
  currentGoal: Goal,
  depositId: string,
  updates: { amount?: number; date?: string; note?: string },
  linkedExpenseId?: string | null,
): Promise<void> {
  // Delta event — chỉ gửi field thay đổi, replay sẽ merge vào deposit cũ
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.GOAL_DEPOSIT_EDITED,
    createdAt: new Date().toISOString(),
    data: {
      goalId:    currentGoal.id,
      depositId,
      ...(updates.amount !== undefined && { amount: updates.amount }),
      ...(updates.date   !== undefined && { date:   updates.date }),
      ...(updates.note   !== undefined && { note:   updates.note }),
    },
  })

  // Tự động update linked expense nếu có (section 10.9 rule 3)
  if (linkedExpenseId && (updates.amount !== undefined || updates.date !== undefined)) {
    await updateExpense(userId, linkedExpenseId, {
      ...(updates.amount !== undefined && { amount: updates.amount }),
      ...(updates.date !== undefined && { date: updates.date }),
    })
  }
}

/**
 * Xóa lần nạp tiền.
 * Trả về thông tin cần thiết để UI hiển thị popup cascade.
 */
export interface DeleteDepositCascadeInfo {
  hasLinkedExpense: boolean    // có _depositId match → popup 2 lựa chọn
  hasLinkedWithdrawal: boolean // có goalDepositId match → popup riêng
}

export async function deleteGoalDeposit(
  userId: string,
  currentGoal: Goal,
  depositId: string,
  options: {
    deleteLinkedExpense?: boolean
    linkedExpenseId?: string | null
  } = {},
): Promise<void> {
  // Delta event — chỉ xóa deposit cụ thể, không replace cả array
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.GOAL_DEPOSIT_DELETED,
    createdAt: new Date().toISOString(),
    data: {
      goalId: currentGoal.id,
      depositId,
    },
  })

  // Cascade: xóa linked expense nếu user chọn "Xóa cả hai"
  if (options.deleteLinkedExpense && options.linkedExpenseId) {
    await deleteExpense(userId, options.linkedExpenseId)
  }
}