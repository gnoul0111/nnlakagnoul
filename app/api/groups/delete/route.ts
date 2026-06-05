import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken } from '@/lib/auth/verifyToken'
import { checkRateLimit } from '@/lib/rateLimit'
import { getAdminDb } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'

// ════════════════════════════════════════════════════════════════════════════
// CHỦ NHÓM xoá nhóm: xoá doc nhóm + CASCADE xoá toàn bộ group_events của nhóm.
// Qua API admin vì group_events immutable (rules client cấm delete).
// ════════════════════════════════════════════════════════════════════════════

const BATCH = 400

export async function POST(request: NextRequest) {
  let uid: string
  try {
    uid = (await verifyIdToken(request)).uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit({ key: `${uid}:group-delete`, limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu. Thử lại sau.' }, { status: 429 })
  }

  let body: { groupId?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 }) }

  const groupId = String(body.groupId ?? '')
  if (!groupId) return NextResponse.json({ error: 'Thiếu groupId.' }, { status: 400 })

  try {
    const db  = getAdminDb()
    const ref = db.collection('groups').doc(groupId)
    const snap = await ref.get()
    if (!snap.exists) return NextResponse.json({ error: 'Nhóm không tồn tại.' }, { status: 404 })
    if (snap.data()!.ownerUid !== uid) {
      return NextResponse.json({ error: 'Chỉ chủ nhóm được xoá nhóm.' }, { status: 403 })
    }

    // Lưu member list trước khi xoá để unlink expense/debt sau đó.
    const memberUids: string[] = Array.isArray(snap.data()!.memberUids)
      ? snap.data()!.memberUids as string[]
      : []

    // Cascade: xoá hết group_events theo từng batch
    const col = db.collection('group_events').where('groupId', '==', groupId)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const evSnap = await col.limit(BATCH).get()
      if (evSnap.empty) break
      const batch = db.batch()
      evSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      if (evSnap.size < BATCH) break
    }

    await ref.delete()

    // Unlink expense + debt của từng thành viên khỏi nhóm đã xoá.
    // Nếu không làm, các bút toán cá nhân có _groupEntryId sẽ bị khoá vĩnh viễn:
    // tab Chi tiêu block xoá (icon 🔒), tab Nhóm không còn nhóm để "Hoàn tác".
    await Promise.allSettled(memberUids.map(async memberUid => {
      const eventsSnap = await db.collection('expense_events')
        .where('userId', '==', memberUid)
        .get()

      const toUnlink = eventsSnap.docs.filter(
        d => d.data()?.data?._groupId === groupId,
      )
      if (toUnlink.length === 0) return

      const unlinkBatch = db.batch()
      toUnlink.forEach(d => {
        unlinkBatch.update(d.ref, {
          'data._groupId':      null,
          'data._groupEntryId': null,
        })
      })
      await unlinkBatch.commit()
    }))

    return NextResponse.json({ ok: true })
  } catch (err) {
    logger.error('group-delete', 'Unhandled error', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Thử lại nhé.' }, { status: 500 })
  }
}
