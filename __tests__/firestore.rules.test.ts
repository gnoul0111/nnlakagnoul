/**
 * Firestore Security Rules — automated test suite
 *
 * Chạy với Firebase Emulator:
 *   firebase emulators:exec "npx jest __tests__/firestore.rules.test.ts" --only firestore
 *
 * Hoặc start emulator trước rồi chạy test:
 *   firebase emulators:start --only firestore
 *   npx jest __tests__/firestore.rules.test.ts
 */

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore'

const PROJECT_ID = 'test-expense-app'
const RULES_PATH = resolve(__dirname, '../firestore.rules')

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules:    readFileSync(RULES_PATH, 'utf8'),
      host:     '127.0.0.1',
      port:     8080,
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

afterEach(async () => {
  await testEnv.clearFirestore()
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function asUser(uid: string) {
  return testEnv.authenticatedContext(uid).firestore()
}

function asAnon() {
  return testEnv.unauthenticatedContext().firestore()
}

async function seedExpense(uid: string, docId: string) {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'expenses', docId), {
      userId: uid,
      amount: 100000,
      title:  'Test expense',
    })
  })
}

async function seedEvent(uid: string, docId: string) {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'expense_events', docId), {
      userId:    uid,
      eventType: 'EXPENSE_ADDED',
      createdAt: '2025-01-01T00:00:00Z',
      data:      { amount: 100000, title: 'Test' },
    })
  })
}

// ─── Test: Unauthenticated ────────────────────────────────────────────────────

describe('Unauthenticated user', () => {
  it('cannot read any expense', async () => {
    await seedExpense('userA', 'exp1')
    const db = asAnon()
    await assertFails(getDoc(doc(db, 'expenses', 'exp1')))
  })

  it('cannot write any expense', async () => {
    const db = asAnon()
    await assertFails(setDoc(doc(db, 'expenses', 'exp1'), {
      userId: 'userA', amount: 100, title: 'hack',
    }))
  })

  it('cannot read user settings', async () => {
    const db = asAnon()
    await assertFails(getDoc(doc(db, 'user_settings', 'userA')))
  })
})

// ─── Test: expenses collection ────────────────────────────────────────────────

describe('expenses collection', () => {
  it('user can read own expense', async () => {
    await seedExpense('userA', 'exp1')
    const db = asUser('userA')
    await assertSucceeds(getDoc(doc(db, 'expenses', 'exp1')))
  })

  it('user CANNOT read another user expense', async () => {
    await seedExpense('userB', 'exp1')
    const db = asUser('userA')
    await assertFails(getDoc(doc(db, 'expenses', 'exp1')))
  })

  it('user can create own expense', async () => {
    const db = asUser('userA')
    await assertSucceeds(setDoc(doc(db, 'expenses', 'exp-new'), {
      userId: 'userA', amount: 50000, title: 'Coffee',
    }))
  })

  it('user CANNOT create expense with another userId', async () => {
    const db = asUser('userA')
    await assertFails(setDoc(doc(db, 'expenses', 'exp-new'), {
      userId: 'userB', amount: 50000, title: 'Hack',
    }))
  })

  it('user can update own expense but CANNOT change userId', async () => {
    await seedExpense('userA', 'exp1')
    const db = asUser('userA')
    // Allowed: update other fields
    await assertSucceeds(updateDoc(doc(db, 'expenses', 'exp1'), { title: 'Updated' }))
    // Denied: change userId
    await assertFails(updateDoc(doc(db, 'expenses', 'exp1'), { userId: 'userB' }))
  })

  it('user CANNOT update another user expense', async () => {
    await seedExpense('userB', 'exp1')
    const db = asUser('userA')
    await assertFails(updateDoc(doc(db, 'expenses', 'exp1'), { title: 'Hack' }))
  })

  it('user can delete own expense', async () => {
    await seedExpense('userA', 'exp1')
    const db = asUser('userA')
    await assertSucceeds(deleteDoc(doc(db, 'expenses', 'exp1')))
  })

  it('user CANNOT delete another user expense', async () => {
    await seedExpense('userB', 'exp1')
    const db = asUser('userA')
    await assertFails(deleteDoc(doc(db, 'expenses', 'exp1')))
  })

  it('user can list OWN expenses with userId filter', async () => {
    await seedExpense('userA', 'exp1')
    const db  = asUser('userA')
    const q   = query(collection(db, 'expenses'), where('userId', '==', 'userA'))
    await assertSucceeds(getDocs(q))
  })

  it('user CANNOT list expenses without userId filter (IDOR prevention)', async () => {
    const db = asUser('userA')
    // Query không có filter — phải bị từ chối
    await assertFails(getDocs(collection(db, 'expenses')))
  })

  it('user CANNOT list expenses filtered by another userId', async () => {
    const db = asUser('userA')
    const q  = query(collection(db, 'expenses'), where('userId', '==', 'userB'))
    await assertFails(getDocs(q))
  })
})

// ─── Test: expense_events collection ─────────────────────────────────────────

describe('expense_events collection', () => {
  it('user can create valid event', async () => {
    const db = asUser('userA')
    await assertSucceeds(setDoc(doc(db, 'expense_events', 'evt1'), {
      userId:    'userA',
      eventType: 'EXPENSE_ADDED',
      createdAt: '2025-01-01T00:00:00Z',
      data:      { amount: 100000, title: 'Coffee' },
    }))
  })

  it('CANNOT create event with invalid eventType', async () => {
    const db = asUser('userA')
    await assertFails(setDoc(doc(db, 'expense_events', 'evt2'), {
      userId:    'userA',
      eventType: 'INJECT_ARBITRARY_DATA',
      createdAt: '2025-01-01T00:00:00Z',
      data:      {},
    }))
  })

  it('CANNOT create event with negative amount', async () => {
    const db = asUser('userA')
    await assertFails(setDoc(doc(db, 'expense_events', 'evt3'), {
      userId:    'userA',
      eventType: 'EXPENSE_ADDED',
      createdAt: '2025-01-01T00:00:00Z',
      data:      { amount: -1000 },
    }))
  })

  it('CANNOT create event with amount exceeding 1 billion', async () => {
    const db = asUser('userA')
    await assertFails(setDoc(doc(db, 'expense_events', 'evt4'), {
      userId:    'userA',
      eventType: 'EXPENSE_ADDED',
      createdAt: '2025-01-01T00:00:00Z',
      data:      { amount: 2_000_000_000 },
    }))
  })

  it('events are IMMUTABLE — cannot update', async () => {
    await seedEvent('userA', 'evt1')
    const db = asUser('userA')
    await assertFails(updateDoc(doc(db, 'expense_events', 'evt1'), { eventType: 'MODIFIED' }))
  })

  it('events are IMMUTABLE — cannot delete', async () => {
    await seedEvent('userA', 'evt1')
    const db = asUser('userA')
    await assertFails(deleteDoc(doc(db, 'expense_events', 'evt1')))
  })

  it('user CANNOT read event of another user', async () => {
    await seedEvent('userB', 'evt1')
    const db = asUser('userA')
    await assertFails(getDoc(doc(db, 'expense_events', 'evt1')))
  })
})

// ─── Test: budgets collection ─────────────────────────────────────────────────

describe('budgets collection', () => {
  it('user can read own budget (docId starts with uid)', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'budgets', 'userA_2025-01'), { amount: 5000000 })
    })
    const db = asUser('userA')
    await assertSucceeds(getDoc(doc(db, 'budgets', 'userA_2025-01')))
  })

  it('user CANNOT read another user budget', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'budgets', 'userB_2025-01'), { amount: 5000000 })
    })
    const db = asUser('userA')
    await assertFails(getDoc(doc(db, 'budgets', 'userB_2025-01')))
  })
})

// ─── Test: user_settings ─────────────────────────────────────────────────────

describe('user_settings collection', () => {
  it('user can read/write own settings', async () => {
    const db = asUser('userA')
    await assertSucceeds(setDoc(doc(db, 'user_settings', 'userA'), { theme: 'dark' }))
    await assertSucceeds(getDoc(doc(db, 'user_settings', 'userA')))
  })

  it('user CANNOT read another user settings', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'user_settings', 'userB'), { theme: 'dark' })
    })
    const db = asUser('userA')
    await assertFails(getDoc(doc(db, 'user_settings', 'userB')))
  })

  it('user CANNOT write alert_log (Cloud Function only)', async () => {
    const db = asUser('userA')
    await assertFails(setDoc(doc(db, 'user_settings', 'userA', 'alert_log', 'alert1'), {
      message: 'hack',
    }))
  })
})
