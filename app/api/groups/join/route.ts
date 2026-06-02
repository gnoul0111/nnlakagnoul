import { NextRequest, NextResponse } from 'next/server'
import { verifyIdToken } from '@/lib/auth/verifyToken'
import { checkRateLimit } from '@/lib/rateLimit'
import { getAdminDb, admin } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'

// ════════════════════════════════════════════════════════════════════════════
// THAM GIA NHÓM bằng mã mời.
//
// Vì sao qua API (admin SDK) thay vì Firestore rules:
//  • Người chưa là thành viên KHÔNG đọc được group doc (rules chặn) → không thể
//    tra nhóm theo mã ở client.
//  • Cho client tự thêm mình vào memberUids = lỗ hổng (đoán mã → chen vào nhóm).
//  • Admin SDK bypass rules: tra mã an toàn server-side, thêm thành viên có kiểm soát.
// ════════════════════════════════════════════════════════════════════════════

const CODE_RE = /^[A-Z2-9]{6}$/

export async function POST(request: NextRequest) {
  let uid: string
  try {
    const decoded = await verifyIdToken(request)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Chống brute-force mã mời
  const rl = checkRateLimit({ key: `${uid}:group-join`, limit: 10, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetAfter / 1000)) } },
    )
  }

  let body: { code?: unknown; name?: unknown; email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 })
  }

  const code = String(body.code ?? '').trim().toUpperCase()
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: 'Mã mời không hợp lệ.' }, { status: 400 })
  }

  // Tên/email do client gửi (đã đăng nhập nên là hồ sơ của chính họ) — tránh
  // gọi getAdminAuth().getUser() thêm 1 vòng mạng → join nhanh hơn.
  const reqName  = String(body.name  ?? '').slice(0, 60).trim()
  const reqEmail = String(body.email ?? '').slice(0, 120).trim()

  try {
    const db = getAdminDb()
    const snap = await db.collection('groups').where('inviteCode', '==', code).limit(1).get()
    if (snap.empty) {
      return NextResponse.json({ error: 'Không tìm thấy nhóm với mã này.' }, { status: 404 })
    }

    const groupRef = snap.docs[0].ref
    const group    = snap.docs[0].data()

    // Đã là thành viên → idempotent, trả về luôn
    const memberUids: string[] = Array.isArray(group.memberUids) ? group.memberUids : []
    if (memberUids.includes(uid)) {
      return NextResponse.json({ groupId: groupRef.id, name: group.name, alreadyMember: true })
    }

    // Giới hạn quy mô nhóm (an toàn + hợp lý cho gia đình)
    if (memberUids.length >= 50) {
      return NextResponse.json({ error: 'Nhóm đã đầy.' }, { status: 409 })
    }

    // Denormalize hồ sơ từ client (rules chặn đọc users/{uid} của người khác)
    const member = {
      uid,
      name:  reqName || reqEmail.split('@')[0] || 'Thành viên',
      email: reqEmail,
      joinedAt: new Date().toISOString(),
    }

    await groupRef.update({
      memberUids: admin.firestore.FieldValue.arrayUnion(uid),
      [`members.${uid}`]: member,
    })

    return NextResponse.json({ groupId: groupRef.id, name: group.name })
  } catch (err) {
    logger.error('group-join', 'Unhandled error', err)
    return NextResponse.json({ error: 'Lỗi xử lý. Vui lòng thử lại.' }, { status: 500 })
  }
}
