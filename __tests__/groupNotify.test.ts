import {
  getGroupRecipients,
  buildGroupNotifBody,
} from '../functions/src/groupNotify'
import type { GroupEventLike } from '../functions/src/groupNotify'

// fmtMoney giả định (deterministic) — tránh phụ thuộc locale của Intl khi test.
const fmt = (n: number) => `${n}d`

function ev(partial: Partial<GroupEventLike>): GroupEventLike {
  return {
    eventType: 'GROUP_ENTRY_ADDED',
    actorUid: 'A',
    participants: ['A', 'B', 'C'],
    data: {},
    ...partial,
  }
}

describe('getGroupRecipients', () => {
  test('ADDED → mọi participant trừ người tạo', () => {
    expect(getGroupRecipients(ev({ eventType: 'GROUP_ENTRY_ADDED', actorUid: 'A' })))
      .toEqual(['B', 'C'])
  })

  test('ADDED solo (chỉ mình actor) → không ai nhận', () => {
    expect(getGroupRecipients(ev({ eventType: 'GROUP_ENTRY_ADDED', actorUid: 'A', participants: ['A'] })))
      .toEqual([])
  })

  test('UPDATED + notifyFinancial=false → không báo', () => {
    expect(getGroupRecipients(ev({ eventType: 'GROUP_ENTRY_UPDATED', data: { notifyFinancial: false } })))
      .toEqual([])
  })

  test('UPDATED + notifyFinancial=true → báo participant khác', () => {
    expect(getGroupRecipients(ev({ eventType: 'GROUP_ENTRY_UPDATED', actorUid: 'B', data: { notifyFinancial: true } })))
      .toEqual(['A', 'C'])
  })

  test('UPDATED thiếu notifyFinancial (client cũ) → mặc định báo', () => {
    expect(getGroupRecipients(ev({ eventType: 'GROUP_ENTRY_UPDATED', actorUid: 'A', data: {} })))
      .toEqual(['B', 'C'])
  })

  test('STATUS_SET done, payer ≠ actor → chỉ báo payer', () => {
    expect(getGroupRecipients(ev({
      eventType: 'GROUP_ENTRY_STATUS_SET', actorUid: 'B',
      data: { status: 'done', payerUid: 'A' },
    }))).toEqual(['A'])
  })

  test('STATUS_SET done, payer = actor → không tự báo', () => {
    expect(getGroupRecipients(ev({
      eventType: 'GROUP_ENTRY_STATUS_SET', actorUid: 'A',
      data: { status: 'done', payerUid: 'A' },
    }))).toEqual([])
  })

  test('STATUS_SET skipped, payer ≠ actor → báo payer', () => {
    expect(getGroupRecipients(ev({
      eventType: 'GROUP_ENTRY_STATUS_SET', actorUid: 'B',
      data: { status: 'skipped', payerUid: 'A' },
    }))).toEqual(['A'])
  })

  test('STATUS_SET skipped, payer = actor → không tự báo', () => {
    expect(getGroupRecipients(ev({
      eventType: 'GROUP_ENTRY_STATUS_SET', actorUid: 'A',
      data: { status: 'skipped', payerUid: 'A' },
    }))).toEqual([])
  })

  test('STATUS_SET pending → không báo', () => {
    expect(getGroupRecipients(ev({
      eventType: 'GROUP_ENTRY_STATUS_SET', actorUid: 'B',
      data: { status: 'pending', payerUid: 'A' },
    }))).toEqual([])
  })

  test('STATUS_SET thiếu payerUid (client cũ) → không báo', () => {
    expect(getGroupRecipients(ev({
      eventType: 'GROUP_ENTRY_STATUS_SET', actorUid: 'B',
      data: { status: 'done' },
    }))).toEqual([])
  })

  test('DELETED → mọi participant trừ người xoá', () => {
    expect(getGroupRecipients(ev({ eventType: 'GROUP_ENTRY_DELETED', actorUid: 'B' })))
      .toEqual(['A', 'C'])
  })

  test('loại khác → không báo', () => {
    expect(getGroupRecipients(ev({ eventType: 'WHATEVER' }))).toEqual([])
  })
})

describe('buildGroupNotifBody', () => {
  const names = { groupName: 'Gia Đình', actorName: 'An' }

  test('ADDED → có động từ "thêm" + phần của người nhận', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_ADDED', data: { note: 'Đi chợ', splits: [{ uid: 'B', amount: 120 }] } }),
      'B', names, fmt,
    )
    expect(out).toEqual({ title: '👥 Gia Đình', body: 'An thêm khoản «Đi chợ» · phần của bạn 120d' })
  })

  test('UPDATED → động từ "sửa"', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_UPDATED', data: { note: 'Ăn tối', splits: [{ uid: 'C', amount: 50 }] } }),
      'C', names, fmt,
    )
    expect(out?.body).toBe('An sửa khoản «Ăn tối» · phần của bạn 50d')
  })

  test('người nhận không có trong splits → không hiện "phần của bạn"', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_ADDED', data: { note: 'Đi chợ', splits: [{ uid: 'B', amount: 120 }] } }),
      'C', names, fmt,
    )
    expect(out?.body).toBe('An thêm khoản «Đi chợ»')
  })

  test('thiếu note → fallback "Khoản chung"', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_ADDED', data: { splits: [] } }),
      'B', names, fmt,
    )
    expect(out?.body).toBe('An thêm khoản «Khoản chung»')
  })

  test('STATUS_SET done → câu báo "xử lý"', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_STATUS_SET', data: { status: 'done', note: 'Đi chợ' } }),
      'A', names, fmt,
    )
    expect(out?.body).toBe('An đã xử lý phần của họ trong «Đi chợ»')
  })

  test('STATUS_SET skipped → câu báo "bỏ qua"', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_STATUS_SET', data: { status: 'skipped', note: 'Đi chợ' } }),
      'A', names, fmt,
    )
    expect(out?.body).toBe('An đã bỏ qua phần của họ trong «Đi chợ»')
  })

  test('DELETED → câu báo xoá', () => {
    const out = buildGroupNotifBody(
      ev({ eventType: 'GROUP_ENTRY_DELETED', data: { note: 'Đi chợ' } }),
      'B', names, fmt,
    )
    expect(out?.body).toBe('An đã xoá khoản «Đi chợ»')
  })

  test('loại không hỗ trợ → null', () => {
    expect(buildGroupNotifBody(ev({ eventType: 'WHATEVER' }), 'B', names, fmt)).toBeNull()
  })
})
