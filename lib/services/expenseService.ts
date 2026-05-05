import { appendEvent } from './eventService'
import { EVENT_TYPES } from '@/lib/types/events'
import type { CategoryValue } from '@/lib/types/expense'
import { newExpenseId } from '@/lib/utils/id'
import { today } from '@/lib/utils/date'

// ─── Input types ──────────────────────────────────────────────────────────────

export interface AddExpenseInput {
  title?: string
  amount: number
  category: CategoryValue
  date?: string
  note?: string
  // Linked transaction fields (optional)
  _debtId?: string | null
  _paymentId?: string | null
  _goalId?: string | null
  _depositId?: string | null
  _savingsMonthKey?: string | null
  _savingsDepositId?: string | null
}

export interface UpdateExpenseInput {
  title?: string
  amount?: number
  category?: CategoryValue
  date?: string
  note?: string
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function addExpense(
  userId: string,
  input: AddExpenseInput,
): Promise<string> {
  if (!input.amount || input.amount <= 0 || input.amount > 999_000_000) {
    throw new Error('Số tiền không hợp lệ (phải từ 1 đến 999.000.000).')
  }
  const id = newExpenseId()

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.EXPENSE_ADDED,
    createdAt: new Date().toISOString(),
    data: {
      id,
      userId,
      amount:   input.amount,
      category: input.category,
      date:     input.date ?? today(),
      note:     input.note  ?? '',
      // FIX BUG-A: title was declared in AddExpenseInput but never written to
      // the event data object — silent data loss for any caller passing a title.
      title:    input.title ?? '',
      _debtId:          input._debtId          ?? null,
      _paymentId:       input._paymentId        ?? null,
      _goalId:          input._goalId           ?? null,
      _depositId:       input._depositId        ?? null,
      _savingsMonthKey: input._savingsMonthKey  ?? null,
      _savingsDepositId: input._savingsDepositId ?? null,
    },
  })

  return id
}

export async function updateExpense(
  userId: string,
  expenseId: string,
  updates: UpdateExpenseInput,
): Promise<void> {
  // Validate amount if provided
  if (updates.amount !== undefined && (updates.amount <= 0 || updates.amount > 999_000_000)) {
    throw new Error('Số tiền không hợp lệ (phải từ 1 đến 999.000.000).')
  }

  // FIX BUG-C: guard the replayedState check with a more explicit null-safe
  // pattern. When the store is uninitialized (replayedState === null), we log
  // a warning instead of silently skipping — callers relying on the service
  // layer directly should ensure the store is loaded first.
  const { replayedState } = await import('@/lib/store/eventStore').then(
    m => ({ replayedState: m.useEventStore.getState().replayedState }),
  )

  if (replayedState === null) {
    // Store not initialized — validation cannot be performed.
    // This is expected only during the very first load; warn but proceed.
    console.warn(
      '[expenseService] updateExpense called before replayedState was loaded. ' +
      'Existence check skipped for expenseId:', expenseId,
    )
  } else {
    const exists = replayedState.expenses.some(
      e => e.id === expenseId && !e.deleted,
    )
    if (!exists) {
      throw new Error('Expense không tồn tại hoặc đã bị xóa.')
    }
  }

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.EXPENSE_UPDATED,
    createdAt: new Date().toISOString(),
    data: { id: expenseId, ...updates },
  })
}

export async function deleteExpense(
  userId: string,
  expenseId: string,
): Promise<void> {
  // FIX BUG-D: add a soft existence check to avoid writing a no-op
  // EXPENSE_DELETED event for IDs that were never created.
  // Like updateExpense, this is best-effort — skipped when store uninitialized.
  const { replayedState } = await import('@/lib/store/eventStore').then(
    m => ({ replayedState: m.useEventStore.getState().replayedState }),
  )

  if (replayedState !== null) {
    const exists = replayedState.expenses.some(
      e => e.id === expenseId && !e.deleted,
    )
    if (!exists) {
      throw new Error('Expense không tồn tại hoặc đã bị xóa.')
    }
  }

  await appendEvent({
    userId,
    eventType: EVENT_TYPES.EXPENSE_DELETED,
    createdAt: new Date().toISOString(),
    data: {
      id:        expenseId,
      deletedAt: new Date().toISOString(),
    },
  })
}