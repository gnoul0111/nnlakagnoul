// ════════════════════════════════════════════════════════════════════════════
// Logic THUẦN cho thông báo nhóm (chi tiêu chung).
//
// File này KHÔNG import firebase-admin/functions → unit-test được độc lập
// (xem functions/__tests__/groupNotify.test.ts). index.ts ráp với I/O Firestore.
// ════════════════════════════════════════════════════════════════════════════

export interface GroupEventLike {
  eventType: string
  actorUid: string
  participants: string[]
  data: Record<string, unknown>
}

export interface GroupNames {
  groupName: string
  actorName: string
}

/** Định dạng tiền VND. */
export function formatVND(n: number): string {
  try {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0,
    }).format(n)
  } catch {
    return `${Math.round(n).toLocaleString('vi-VN')}₫`
  }
}

/**
 * Danh sách uid cần nhận thông báo cho 1 group event (THUẦN, không I/O).
 *
 *  • GROUP_ENTRY_ADDED   → mọi participant trừ người tạo.
 *  • GROUP_ENTRY_UPDATED → mọi participant trừ người sửa, NHƯNG bỏ qua nếu
 *    data.notifyFinancial === false (chỉ sửa note/ngày → không báo). Thiếu field
 *    (client cũ) → coi như có thay đổi → vẫn báo.
 *  • GROUP_ENTRY_STATUS_SET → CHỈ báo người trả (payerUid) khi status === 'done'
 *    và payer ≠ người bấm. Thiếu payerUid (client cũ) → không báo.
 *  • Loại khác (DELETED, ...) → không báo.
 */
export function getGroupRecipients(ev: GroupEventLike): string[] {
  const type = String(ev.eventType).toUpperCase()
  const actor = ev.actorUid
  const participants = Array.isArray(ev.participants) ? ev.participants : []
  const data = ev.data ?? {}

  if (type === 'GROUP_ENTRY_ADDED') {
    return participants.filter(uid => uid !== actor)
  }

  if (type === 'GROUP_ENTRY_UPDATED') {
    if (data.notifyFinancial === false) return []
    return participants.filter(uid => uid !== actor)
  }

  if (type === 'GROUP_ENTRY_STATUS_SET') {
    if (data.status !== 'done') return []
    const payer = data.payerUid
    if (typeof payer !== 'string' || !payer || payer === actor) return []
    return [payer]
  }

  return []
}

/**
 * Nội dung (title + body) cho 1 người nhận cụ thể (THUẦN, không I/O).
 * Trả về null nếu event không phát sinh thông báo.
 */
export function buildGroupNotifBody(
  ev: GroupEventLike,
  recipientUid: string,
  names: GroupNames,
  fmtMoney: (n: number) => string = formatVND,
): { title: string; body: string } | null {
  const type = String(ev.eventType).toUpperCase()
  const data = ev.data ?? {}
  const rawNote = typeof data.note === 'string' ? data.note.trim() : ''
  const note = rawNote || 'Khoản chung'
  const title = `👥 ${names.groupName}`

  if (type === 'GROUP_ENTRY_ADDED' || type === 'GROUP_ENTRY_UPDATED') {
    const verb = type === 'GROUP_ENTRY_ADDED' ? 'thêm' : 'sửa'
    const splits = Array.isArray(data.splits) ? (data.splits as Array<{ uid?: string; amount?: number }>) : []
    const myShare = splits.find(s => s?.uid === recipientUid)?.amount
    const shareStr = typeof myShare === 'number' && myShare > 0
      ? ` · phần của bạn ${fmtMoney(myShare)}`
      : ''
    return { title, body: `${names.actorName} ${verb} khoản «${note}»${shareStr}` }
  }

  if (type === 'GROUP_ENTRY_STATUS_SET') {
    return { title, body: `${names.actorName} đã xử lý phần của họ trong «${note}»` }
  }

  return null
}
