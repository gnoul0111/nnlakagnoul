import type { Timestamp } from 'firebase/firestore'

// ─── Event Types ────────────────────────────────────────────────────────────

export const EVENT_TYPES = {
  // Expenses
  EXPENSE_ADDED:   'EXPENSE_ADDED',
  EXPENSE_UPDATED: 'EXPENSE_UPDATED',
  EXPENSE_DELETED: 'EXPENSE_DELETED',
  // Incomes
  INCOME_ADDED:   'INCOME_ADDED',
  INCOME_CREATED: 'INCOME_CREATED', // alias
  INCOME_DELETED: 'INCOME_DELETED',
  // Budget
  BUDGET_SET: 'BUDGET_SET',
  // Goals
  GOAL_ADDED:   'GOAL_ADDED',
  GOAL_CREATED: 'GOAL_CREATED', // alias
  GOAL_UPDATED: 'GOAL_UPDATED',
  GOAL_DELETED: 'GOAL_DELETED',
  // Goal deposits (delta — tránh race khi 2 tab concurrent)
  GOAL_DEPOSIT_ADDED:   'GOAL_DEPOSIT_ADDED',
  GOAL_DEPOSIT_EDITED:  'GOAL_DEPOSIT_EDITED',
  GOAL_DEPOSIT_DELETED: 'GOAL_DEPOSIT_DELETED',
  // Debts
  DEBT_CREATED: 'DEBT_CREATED',
  DEBT_UPDATED: 'DEBT_UPDATED',
  DEBT_DELETED: 'DEBT_DELETED',
  // Debt payments (delta)
  DEBT_PAYMENT_ADDED:   'DEBT_PAYMENT_ADDED',
  DEBT_PAYMENT_DELETED: 'DEBT_PAYMENT_DELETED',
  // Templates
  TEMPLATE_CREATED: 'TEMPLATE_CREATED',
  TEMPLATE_DELETED: 'TEMPLATE_DELETED',
  // Savings
  SAVINGS_TARGET_SET:         'SAVINGS_TARGET_SET',
  SAVINGS_DEPOSIT:            'SAVINGS_DEPOSIT',
  SAVINGS_DEPOSIT_DELETED:    'SAVINGS_DEPOSIT_DELETED',
  SAVINGS_ALLOCATED:          'SAVINGS_ALLOCATED',
  SAVINGS_ALLOCATION_DELETED: 'SAVINGS_ALLOCATION_DELETED',
  SAVINGS_WITHDRAWN:          'SAVINGS_WITHDRAWN',
  SAVINGS_WITHDRAWAL_DELETED: 'SAVINGS_WITHDRAWAL_DELETED',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

// ─── Event Document (Firestore) ───────────────────────────────────────────────

export interface EventDoc {
  id:        string
  userId:    string
  eventType: EventType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data:      Record<string, any>

  /**
   * Server-assigned Firestore timestamp — used for incremental sync queries.
   * NOT reliable for conflict resolution due to network-delay variance.
   */
  timestamp: Timestamp

  /**
   * FIX CONC-01/03: ISO string set on the CLIENT at the moment the user
   * performs the action, before any network call.
   *
   * This is the authoritative timestamp for Last-Write-Wins (LWW) conflict
   * resolution in replay(). It represents WHEN the user intended the change,
   * independent of network latency or Firestore write ordering.
   *
   * Rules:
   *  - Set in useAppend() BEFORE appendEvent() / enqueueEvent() calls
   *  - NEVER overwritten by the server (appendEvent preserves it)
   *  - Falls back to createdAt for backward-compat with old events that lack it
   *
   * Example without clientTimestamp (broken):
   *   Device A edits at T=10:00:01, reaches Firestore at T=10:00:01.900
   *   Device B edits at T=10:00:02, reaches Firestore at T=10:00:01.100 (faster network)
   *   Server sorts: B(1.100) < A(1.900) → A wins — but B's action was LATER!
   *
   * With clientTimestamp (correct):
   *   A.clientTimestamp="10:00:01", B.clientTimestamp="10:00:02"
   *   Sorted: A < B → B wins ✓
   */
  clientTimestamp?: string

  /**
   * ISO string — for display / human-readable audit trail.
   * May be server time (online writes) or client time (batch offline writes).
   * Do NOT use for ordering — use clientTimestamp instead.
   */
  createdAt: string
}

// Input khi tạo event mới (chưa có id, timestamp)
export type EventDocInput = Omit<EventDoc, 'id' | 'timestamp'>