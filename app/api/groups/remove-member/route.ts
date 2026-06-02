import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken } from '@/lib/auth/verifyToken'
import { checkRateLimit } from '@/lib/rateLimit'
import { getAdminDb, admin } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'

// ════════════════════════════════════════════════════════════════════════════
// CHỦ NHÓM gỡ một thành viên. Qua API admin vì đổi memberUids bị rules client chặn.
// ════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  let uid: string
  try {
    uid = (await verifyIdToken(request)).uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit({ key: `${uid}:group-remove`, limit: 20, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu. Thử lại sau.' }, { status: 429 })
  }

  let body: { groupId?: unknown; memberUid?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 }) }

  const groupId   = String(body.groupId ?? '')
  const memberUid = String(body.memberUid ?? '')
  if (!groupId || !memberUid) return NextResponse.json({ error: 'Thiếu tham số.' }, { status: 400 })

  try {
    const db  = getAdminDb()
    const ref = db.collection('groups').doc(groupId)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Nhóm không tồn tại.' }, { status: 404 })

    const group = snap.data()!
    if (group.ownerUid !== uid)        return NextResponse.json({ error: 'Chỉ chủ nhóm được gỡ thành viên.' }, { status: 403 })
    if (memberUid === group.ownerUid)  return NextResponse.json({ error: 'Không thể gỡ chủ nhóm.' }, { status: 400 })

    await ref.update({
      memberUids: admin.firestore.FieldValue.arrayRemove(memberUid),
      [`members.${memberUid}`]: admin.firestore.FieldValue.delete(),
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('group-remove-member', 'Unhandled error', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Thử lại nhé.' }, { status: 500 })
  }
}
