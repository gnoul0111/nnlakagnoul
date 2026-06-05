import { shouldVisibilitySync } from '../useVisibilitySync.logic'

const THROTTLE = 10_000

function base(overrides: Partial<Parameters<typeof shouldVisibilitySync>[0]> = {}) {
  return shouldVisibilitySync({
    now: 100_000,
    lastSyncAt: 0,
    visibilityState: 'visible',
    online: true,
    throttleMs: THROTTLE,
    ...overrides,
  })
}

describe('shouldVisibilitySync', () => {
  it('sync khi tab hiển thị, online, và đã quá throttle', () => {
    expect(base()).toBe(true)
  })

  it('KHÔNG sync khi tab đang ẩn (hidden)', () => {
    expect(base({ visibilityState: 'hidden' })).toBe(false)
  })

  it('KHÔNG sync khi offline', () => {
    expect(base({ online: false })).toBe(false)
  })

  it('KHÔNG sync khi còn trong throttle window', () => {
    // lần sync gần nhất cách đây 5s (< 10s throttle)
    expect(base({ now: 5_000, lastSyncAt: 0 })).toBe(false)
  })

  it('sync ngay ranh giới throttle (đúng bằng throttleMs)', () => {
    expect(base({ now: 10_000, lastSyncAt: 0 })).toBe(true)
  })

  it('KHÔNG sync khi ngay sát dưới ranh giới throttle', () => {
    expect(base({ now: 9_999, lastSyncAt: 0 })).toBe(false)
  })

  it('hidden + offline + trong throttle → vẫn KHÔNG sync', () => {
    expect(base({ visibilityState: 'hidden', online: false, now: 1_000, lastSyncAt: 0 })).toBe(false)
  })
})
