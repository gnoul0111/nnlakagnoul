'use client'

/**
 * MIGRATION PAGE — chạy 1 lần để patch userId vào event data
 *
 * Cách dùng:
 *   1. Đặt file này vào: app/migrate/page.tsx
 *   2. Deploy lên Vercel (hoặc chạy local: npm run dev)
 *   3. Đăng nhập vào app bình thường
 *   4. Vào: https://expense-app-five-peach.vercel.app/migrate
 *   5. Nhấn "Chạy Migration" → đợi xong
 *   6. Sau khi thấy "✅ Hoàn tất" → XÓA file này → redeploy
 *
 * Script này làm gì:
 *   - Fetch toàn bộ events của user hiện tại từ Firestore
 *   - Tìm event nào có data.userId bị thiếu hoặc rỗng
 *   - Patch lại data.userId = user.uid bằng Firestore updateDoc
 *   - Không đụng vào event nào đã có userId đúng
 */

import { useState } from 'react'
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'

type LogLine = { type: 'info' | 'success' | 'warn' | 'error'; text: string }

export default function MigratePage() {
  const [logs, setLogs]     = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone]     = useState(false)

  const log = (type: LogLine['type'], text: string) =>
    setLogs(prev => [...prev, { type, text }])

  const run = async () => {
    setRunning(true)
    setLogs([])
    setDone(false)

    // 1. Kiểm tra đã đăng nhập chưa
    const user = auth.currentUser
    if (!user) {
      log('error', '❌ Chưa đăng nhập. Hãy đăng nhập vào app rồi quay lại trang này.')
      setRunning(false)
      return
    }
    log('info', `👤 User: ${user.email} (${user.uid})`)

    // 2. Fetch toàn bộ events của user
    log('info', '📡 Đang fetch events từ Firestore...')
    let allDocs: any[] = []
    try {
      const q = query(
        collection(db, 'expense_events'),
        where('userId', '==', user.uid),
      )
      const snap = await getDocs(q)
      allDocs = snap.docs
      log('info', `📦 Tổng số events: ${allDocs.length}`)
    } catch (err: any) {
      log('error', `❌ Không fetch được: ${err.message}`)
      setRunning(false)
      return
    }

    // 3. Tìm events cần patch: data.userId bị thiếu hoặc rỗng
    const PATCHABLE_TYPES = [
      'EXPENSE_ADDED', 'EXPENSE_UPDATED', 'EXPENSE_DELETED',
      'INCOME_ADDED',  'INCOME_CREATED',  'INCOME_DELETED',
      'GOAL_ADDED',    'GOAL_CREATED',    'GOAL_UPDATED',   'GOAL_DELETED',
      'DEBT_CREATED',  'DEBT_UPDATED',    'DEBT_DELETED',
      'TEMPLATE_CREATED', 'TEMPLATE_DELETED',
      'SAVINGS_DEPOSIT',  'SAVINGS_DEPOSIT_DELETED',
    ]

    const toPatch = allDocs.filter(d => {
      const data = d.data()
      return (
        PATCHABLE_TYPES.includes(data.eventType) &&
        (!data.data?.userId || data.data.userId === '')
      )
    })

    if (toPatch.length === 0) {
      log('success', '✅ Không có event nào cần patch. Data đã sạch!')
      setDone(true)
      setRunning(false)
      return
    }

    log('warn', `🔧 Cần patch: ${toPatch.length} events`)

    // 4. Patch từng batch 20 docs (tránh quá tải)
    let patched = 0
    let failed  = 0
    const BATCH = 20

    for (let i = 0; i < toPatch.length; i += BATCH) {
      const chunk = toPatch.slice(i, i + BATCH)
      await Promise.all(
        chunk.map(async (d) => {
          try {
            const oldData = d.data().data ?? {}
            await updateDoc(doc(db, 'expense_events', d.id), {
              'data.userId': user.uid,
            })
            patched++
          } catch (err: any) {
            failed++
            log('error', `  ❌ Fail doc ${d.id}: ${err.message}`)
          }
        })
      )
      log('info', `  ✔ ${Math.min(i + BATCH, toPatch.length)} / ${toPatch.length} done...`)
    }

    // 5. Summary
    log('success', ``)
    log('success', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    log('success', `✅ Migration hoàn tất!`)
    log('success', `   Đã patch: ${patched} events`)
    if (failed > 0) log('error', `   Thất bại: ${failed} events — xem chi tiết ở trên`)
    log('success', `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    log('info', `👉 Bây giờ hãy XÓA file app/migrate/page.tsx rồi redeploy.`)

    setDone(true)
    setRunning(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#fafafa',
      fontFamily: 'ui-monospace, monospace',
      padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          🔧 Migration — Patch userId vào event data
        </h1>
        <p style={{ fontSize: 13, color: '#71717a', marginBottom: 24, lineHeight: 1.6 }}>
          Script này tìm các expense/income event bị thiếu <code>data.userId</code> và patch lại.
          Sau khi chạy xong, xóa file <code>app/migrate/page.tsx</code> rồi redeploy.
        </p>

        <button
          onClick={run}
          disabled={running || done}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: 'none',
            background: done ? '#16a34a' : running ? '#3f3f46' : '#2563eb',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: running || done ? 'not-allowed' : 'pointer',
            marginBottom: 24,
            transition: 'background 0.2s',
          }}
        >
          {done ? '✅ Hoàn tất' : running ? '⏳ Đang chạy...' : '▶ Chạy Migration'}
        </button>

        {/* Log output */}
        {logs.length > 0 && (
          <div style={{
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: 12,
            padding: '16px 20px',
            fontSize: 13,
            lineHeight: 1.8,
            overflowY: 'auto',
            maxHeight: 480,
          }}>
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.type === 'success' ? '#4ade80'
                     : l.type === 'error'   ? '#f87171'
                     : l.type === 'warn'    ? '#facc15'
                     : '#a1a1aa',
              }}>
                {l.text || <br />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}