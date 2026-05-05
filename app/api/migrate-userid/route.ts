/**
 * app/api/migrate-userid/route.ts
 *
 * API Route chạy server-side với Firebase Admin → bypass Firestore security rules.
 *
 * Cách dùng:
 *   1. npm install firebase-admin
 *   2. Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   3. Paste nội dung JSON vào Vercel env var: FIREBASE_SERVICE_ACCOUNT_KEY
 *   4. Deploy → vào trang /migrate → nhấn nút
 *   5. Sau khi xong: xóa cả 2 file migrate rồi redeploy
 */

import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore }                  from 'firebase-admin/firestore'

// ─── Init Admin SDK (singleton) ───────────────────────────────────────────────

function getAdminDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var is missing')
    const serviceAccount = JSON.parse(raw)
    initializeApp({ credential: cert(serviceAccount) })
  }
  return getFirestore()
}

// ─── Event types cần patch userId vào data ────────────────────────────────────

const PATCHABLE_TYPES = new Set([
  'EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED',
  'INCOME_ADDED',  'INCOME_CREATED',  'INCOME_DELETED',
  'GOAL_ADDED',    'GOAL_CREATED',    'GOAL_UPDATED',   'GOAL_DELETED',
  'DEBT_CREATED',  'DEBT_UPDATED',    'DEBT_DELETED',
  'TEMPLATE_CREATED', 'TEMPLATE_DELETED',
  'SAVINGS_DEPOSIT',  'SAVINGS_DEPOSIT_DELETED',
])

// ─── POST /api/migrate-userid ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Chỉ chạy được khi có secret key đúng (bảo vệ endpoint)
  const { userId, secret } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let db: FirebaseFirestore.Firestore
  try {
    db = getAdminDb()
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  // Fetch toàn bộ events của user
  const snap = await db
    .collection('expense_events')
    .where('userId', '==', userId)
    .get()

  const total = snap.size
  let patched = 0
  let skipped = 0
  let failed  = 0
  const errors: string[] = []

  // Batch update — Firestore Admin cho phép 500 ops/batch
  const BATCH_SIZE = 400
  const docs = snap.docs.filter(d => {
    const data = d.data()
    return (
      PATCHABLE_TYPES.has(data.eventType) &&
      (!data.data?.userId || data.data.userId === '')
    )
  })

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = docs.slice(i, i + BATCH_SIZE)

    for (const d of chunk) {
      const ref  = db.collection('expense_events').doc(d.id)
      const old  = d.data().data ?? {}
      batch.update(ref, { 'data.userId': userId })
      patched++
    }

    try {
      await batch.commit()
    } catch (err: any) {
      // Nếu batch fail, đếm docs trong chunk là failed
      patched -= chunk.length
      failed  += chunk.length
      errors.push(`Batch ${i}–${i + chunk.length}: ${err.message}`)
    }
  }

  skipped = total - docs.length

  return NextResponse.json({ total, patched, skipped, failed, errors })
}