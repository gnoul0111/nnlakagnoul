/**
 * Integration Tests: Offline Queue + Sync Logic
 *
 * These run with Jest (no browser needed).
 * Tests the queue state machine and event processing logic that
 * the E2E offline-sync.spec.ts exercises in a real browser.
 */
// ─── Mock Firebase + eventService (transitive deps of offlineQueue) ──────────

jest.mock('@/lib/firebase/config', () => ({ auth: {}, db: {}, functions: {} }))
jest.mock('@/lib/firebase/firestore', () => ({
  collection: jest.fn(),
  db: {},
  COLLECTIONS: { EXPENSE_EVENTS: 'expense_events' },
}))
jest.mock('@/lib/services/eventService', () => ({
  appendEventsBatch: jest.fn().mockResolvedValue(undefined),
}))


// ─── Mock window / localStorage ──────────────────────────────────────────────



const _store: Record<string, string> = {}

const localStorageMock = {
  getItem:    (k: string) => _store[k] ?? null,
  setItem:    (k: string, v: string) => { _store[k] = v },
  removeItem: (k: string) => { delete _store[k] },
  clear:      () => { Object.keys(_store).forEach(k => delete _store[k]) },
}

Object.defineProperty(global, 'window', {
  value: {
    localStorage: localStorageMock,
    dispatchEvent: jest.fn(),
    addEventListener: jest.fn(),
  },
  writable: true,
})
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true })

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  enqueueEvent,
  getPendingCount,
  clearQueue,
} from '../../offline/offlineQueue'

type QueuedEvent = {
  id: string
  input: { userId: string; eventType: string; data: Record<string, unknown>; createdAt: string }
  queuedAt: string
}

const QUEUE_KEY = 'offline-event-queue'

function readRawQueue(): QueuedEvent[] {
  const raw = localStorageMock.getItem(QUEUE_KEY)
  return raw ? JSON.parse(raw) : []
}

function makeInput(overrides: Partial<QueuedEvent['input']> = {}): QueuedEvent['input'] {
  return {
    userId: 'user_test',
    eventType: 'EXPENSE_ADDED',
    data: { id: `exp_${Date.now()}`, amount: 100_000 },
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorageMock.clear()
})

describe('enqueueEvent', () => {
  test('adds an event to the queue', () => {
    expect(getPendingCount()).toBe(0)
    enqueueEvent(makeInput())
    expect(getPendingCount()).toBe(1)
  })

  test('preserves input.createdAt when provided', () => {
    const ts = '2026-03-01T10:00:00.000Z'
    enqueueEvent(makeInput({ createdAt: ts }))
    const [event] = readRawQueue()
    expect(event.input.createdAt).toBe(ts)
  })

  test('sets createdAt when not provided', () => {
    const before = new Date().toISOString()
    enqueueEvent({ userId: 'u1', eventType: 'EXPENSE_ADDED', data: { id: 'x' } } as QueuedEvent['input'])
    const after = new Date().toISOString()
    const [event] = readRawQueue()
    expect(event.input.createdAt >= before).toBe(true)
    expect(event.input.createdAt <= after).toBe(true)
  })

  test('preserves event ordering (FIFO)', () => {
    const ts1 = '2026-03-01T10:00:00.000Z'
    const ts2 = '2026-03-01T10:00:01.000Z'
    const ts3 = '2026-03-01T10:00:02.000Z'
    enqueueEvent(makeInput({ createdAt: ts1, data: { id: 'a' } }))
    enqueueEvent(makeInput({ createdAt: ts2, data: { id: 'b' } }))
    enqueueEvent(makeInput({ createdAt: ts3, data: { id: 'c' } }))

    const queue = readRawQueue()
    expect(queue[0].input.data.id).toBe('a')
    expect(queue[1].input.data.id).toBe('b')
    expect(queue[2].input.data.id).toBe('c')
  })

  test('SYNC-01: createdAt timestamps are strictly increasing', async () => {
    // Simulate rapid fire of 5 events — each must have a distinct timestamp
    for (let i = 0; i < 5; i++) {
      enqueueEvent(makeInput({ data: { id: `e${i}` } }))
      await new Promise(r => setTimeout(r, 5))  // 5ms spacing
    }
    const queue = readRawQueue()
    const times = queue.map(q => new Date(q.input.createdAt).getTime())
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
  })

  test('drops oldest event when queue reaches MAX_QUEUE_SIZE (500)', () => {
    // Fill queue to 500
    for (let i = 0; i < 500; i++) {
      enqueueEvent(makeInput({ data: { id: `e${i}` } }))
    }
    expect(getPendingCount()).toBe(500)

    // Add one more — oldest should be dropped
    enqueueEvent(makeInput({ data: { id: 'e_new' } }))
    expect(getPendingCount()).toBe(500)

    const queue = readRawQueue()
    // First event should be e1 (e0 was dropped), last should be e_new
    expect(queue[0].input.data.id).toBe('e1')
    expect(queue[499].input.data.id).toBe('e_new')
  })

  test('corrupt localStorage data resets queue gracefully', () => {
    localStorageMock.setItem(QUEUE_KEY, 'NOT_VALID_JSON{{{')
    expect(() => enqueueEvent(makeInput())).not.toThrow()
    expect(getPendingCount()).toBe(1)
  })

  test('non-array data in localStorage resets queue', () => {
    localStorageMock.setItem(QUEUE_KEY, JSON.stringify({ notAnArray: true }))
    enqueueEvent(makeInput())
    expect(getPendingCount()).toBe(1)
  })
})

describe('getPendingCount', () => {
  test('returns 0 when queue empty', () => {
    expect(getPendingCount()).toBe(0)
  })

  test('returns correct count after multiple enqueues', () => {
    enqueueEvent(makeInput())
    enqueueEvent(makeInput())
    enqueueEvent(makeInput())
    expect(getPendingCount()).toBe(3)
  })
})

describe('clearQueue', () => {
  test('empties the queue', () => {
    enqueueEvent(makeInput())
    enqueueEvent(makeInput())
    expect(getPendingCount()).toBe(2)
    clearQueue()
    expect(getPendingCount()).toBe(0)
  })

  test('no-op when queue already empty', () => {
    expect(() => clearQueue()).not.toThrow()
    expect(getPendingCount()).toBe(0)
  })
})

// ─── Stale event pruning logic (unit test of the filter condition) ────────────

describe('stale event detection', () => {
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000  // 7 days

  function isStale(queuedAt: string): boolean {
    return Date.now() - new Date(queuedAt).getTime() > MAX_AGE_MS
  }

  test('event from 8 days ago is stale', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(isStale(eightDaysAgo)).toBe(true)
  })

  test('event from 6 days ago is not stale', () => {
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
    expect(isStale(sixDaysAgo)).toBe(false)
  })

  test('event from now is not stale', () => {
    expect(isStale(new Date().toISOString())).toBe(false)
  })

  test('event from exactly 7 days ago is borderline (≤ is not stale)', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 1000).toISOString()
    expect(isStale(sevenDaysAgo)).toBe(false)
  })
})

// ─── Event ID uniqueness ──────────────────────────────────────────────────────

describe('queue ID uniqueness', () => {
  test('100 rapid enqueues all have unique IDs', () => {
    for (let i = 0; i < 100; i++) {
      enqueueEvent(makeInput({ data: { id: `e${i}` } }))
    }
    const queue = readRawQueue()
    const ids = queue.map(q => q.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(100)
  })
})
