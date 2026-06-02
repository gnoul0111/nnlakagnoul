import { appendEvent } from './eventService'
import { addExpense, deleteExpense } from './expenseService'
import { EVENT_TYPES } from '@/lib/types/events'
import type { Debt, DebtType, DebtPayment } from '@/lib/types/debt'
import { newDebtId, newPaymentId } from '@/lib/utils/id'
import { today } from '@/lib/utils/date'

// ─── Debt CRUD ────────────────────────────────────────────────────────────────

export interface AddDebtInput {
  id?: string        // Pre-generated ID cho optimistic update (optional)
  name: string
  amount: number
  type: DebtType
  date?: string     // YYYY-MM-DD — ngày phát sinh khoản nợ/vay
  dueDate?: string  // YYYY-MM-DD
  note?: string
  // Liên kết module nhóm (khi kéo "Ghi nợ" từ khoản chung)
  _groupId?: string | null
  _groupEntryId?: string | null
}

export async function addDebt(userId: string, input: AddDebtInput): Promise<string> {
  const id = input.id ?? newDebtId()

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.DEBT_CREATED,
    createdAt: new Date().toISOString(),
    data: {
      id,
      userId,
      name: input.name,
      amount: input.amount,
      type: input.type,
      date: input.date ?? null,
      dueDate: input.dueDate ?? null,
      note: input.note ?? '',
      paidAmount: 0,
      payments: [],
      deleted: false,
      createdAt: Math.floor(Date.now() / 1000),
      _groupId:      input._groupId      ?? null,
      _groupEntryId: input._groupEntryId ?? null,
    },
  })

  return id
}

export interface UpdateDebtInput {
  name?: string
  amount?: number
  date?: string
  dueDate?: string
  note?: string
}

export async function updateDebt(
  userId: string,
  debtId: string,
  updates: UpdateDebtInput,
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.DEBT_UPDATED,
    createdAt: new Date().toISOString(),
    data: { id: debtId, ...updates },
  })
}

/**
 * Xóa toàn bộ debt.
 * Cascade: nếu có linked expenses → UI sẽ hỏi trước, truyền kết quả vào options.
 * (Section 10.4 — Xóa toàn bộ debt)
 */
export async function deleteDebt(
  userId: string,
  debtId: string,
  options: {
    deleteLinkedExpenses?: boolean
    linkedExpenseIds?: string[]
  } = {},
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.DEBT_DELETED,
    createdAt: new Date().toISOString(),
    data: { id: debtId },
  })

  if (options.deleteLinkedExpenses && options.linkedExpenseIds?.length) {
    await Promise.all(
      options.linkedExpenseIds.map(expId => deleteExpense(userId, expId)),
    )
  }
}

// ─── Payment management ───────────────────────────────────────────────────────

export interface AddPaymentInput {
  paymentId?: string  // Pre-generated ID cho optimistic update (optional)
  amount: number
  date?: string
}

export interface AddPaymentOptions {
  /**
   * Nếu true, tạo linked expense với _debtId
   * Flow A: Trả nợ → Expense (section 10.2)
   */
  addToExpenses?: boolean
}

/**
 * Thêm lần trả nợ.
 *
 * DELTA EVENT (DEBT_PAYMENT_ADDED) — race-safe. Replay tự tổng hợp payments array.
 */
export async function addDebtPayment(
  userId: string,
  currentDebt: Debt,
  input: AddPaymentInput,
  options: AddPaymentOptions = {},
): Promise<{ paymentId: string; linkedExpenseId: string | null }> {
  const paymentId = input.paymentId ?? newPaymentId()
  const date = input.date ?? today()

  const newPayment: DebtPayment = {
    id: paymentId,
    amount: input.amount,
    date,
  }

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.DEBT_PAYMENT_ADDED,
    createdAt: new Date().toISOString(),
    data: {
      debtId:  currentDebt.id,
      payment: newPayment,
    },
  })

  // Flow A: tạo linked expense nếu user tick checkbox
  let linkedExpenseId: string | null = null
  if (options.addToExpenses) {
    linkedExpenseId = await addExpense(userId, {
      amount: input.amount,
      category: 'other',
      date,
      note: `Trả nợ — ${currentDebt.name}`,
      _debtId: currentDebt.id,
      _paymentId: paymentId,
    })
  }

  return { paymentId, linkedExpenseId }
}

/**
 * Xóa lần trả nợ (delta event — race-safe).
 * Cascade: popup 3 lựa chọn nếu có linked expense (section 10.4)
 */
export async function deleteDebtPayment(
  userId: string,
  currentDebt: Debt,
  paymentId: string,
  options: {
    deleteLinkedExpense?: boolean
    linkedExpenseId?: string | null
  } = {},
): Promise<void> {
  await appendEvent({
    userId,
    eventType: EVENT_TYPES.DEBT_PAYMENT_DELETED,
    createdAt: new Date().toISOString(),
    data: {
      debtId: currentDebt.id,
      paymentId,
    },
  })

  if (options.deleteLinkedExpense && options.linkedExpenseId) {
    await deleteExpense(userId, options.linkedExpenseId)
  }
}

// ─── Cascade helpers — dùng ở UI để xác định popup cần hiện ─────────────────

/**
 * Tìm tất cả linked expense IDs của 1 debt (dùng để hiện popup cascade)
 */
export function findLinkedExpenseIds(
  debtId: string,
  expenses: Array<{ id: string; _debtId?: string | null; deleted?: boolean }>,
): string[] {
  return expenses
    .filter(e => !e.deleted && e._debtId === debtId)
    .map(e => e.id)
}

/**
 * Tìm linked expense ID của 1 payment cụ thể
 */
export function findPaymentLinkedExpense(
  paymentId: string,
  expenses: Array<{ id: string; _paymentId?: string | null; deleted?: boolean }>,
): string | null {
  return (
    expenses.find(e => !e.deleted && e._paymentId === paymentId)?.id ?? null
  )
}