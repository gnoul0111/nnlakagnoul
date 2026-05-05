'use client'

import { useState } from 'react'
import { auth }     from '@/lib/firebase/config'

type LogLine = { type: 'info' | 'success' | 'warn' | 'error'; text: string }

export default function MigratePage() {
  const [secret,  setSecret]  = useState('')
  const [logs,    setLogs]    = useState<LogLine[]>([])
  const [running, setRunning] = useState(false)
  const [done,    setDone]    = useState(false)

  const log = (type: LogLine['type'], text: string) =>
    setLogs(prev => [...prev, { type, text }])

  const run = async () => {
    setRunning(true)
    setLogs([])
    setDone(false)

    const user = auth.currentUser
    if (!user) {
      log('error', '❌ Chưa đăng nhập. Hãy đăng nhập vào app rồi quay lại.')
      setRunning(false)
      return
    }
    if (!secret.trim()) {
      log('error', '❌ Nhập MIGRATE_SECRET trước.')
      setRunning(false)
      return
    }

    log('info', `👤 User: ${user.email} (${user.uid})`)
    log('info', '📡 Đang gọi API migration (server-side, bypass Firestore rules)...')

    try {
      const res = await fetch('/api/migrate-userid', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, secret: secret.trim() }),
      })

      const result = await res.json()

      if (!res.ok) {
        log('error', `❌ Lỗi: ${result.error ?? res.statusText}`)
        setRunning(false)
        return
      }

      log('info',    '')
      log('info',    `📦 Tổng events:        ${result.total}`)
      log('info',    `⏭  Đã đúng (bỏ qua): ${result.skipped}`)
      log('success', `✅ Đã patch:           ${result.patched}`)
      if (result.failed > 0) {
        log('error', `❌ Thất bại:           ${result.failed}`)
        result.errors?.forEach((e: string) => log('error', `   ${e}`))
      }
      log('info',    '')
      log('success', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      log('success', '🎉 Migration hoàn tất!')
      log('info',    '👉 Xóa app/migrate/ và app/api/migrate-userid/ rồi redeploy.')
      log('success', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      setDone(true)
    } catch (err: any) {
      log('error', `❌ Lỗi kết nối: ${err.message}`)
    }

    setRunning(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', color: '#fafafa',
      fontFamily: 'ui-monospace, monospace', padding: '40px 24px',
    }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          🔧 Migration v2 — Patch userId vào event data
        </h1>
        <p style={{ fontSize: 13, color: '#71717a', marginBottom: 24, lineHeight: 1.6 }}>
          Dùng Admin SDK server-side — không bị chặn bởi Firestore security rules.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: '#71717a', display: 'block', marginBottom: 6 }}>
            MIGRATE_SECRET (env var đã set trên Vercel)
          </label>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Nhập secret key..."
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid #27272a', background: '#18181b',
              color: '#fafafa', fontSize: 14, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <button onClick={run} disabled={running || done} style={{
          padding: '10px 24px', borderRadius: 10, border: 'none',
          background: done ? '#16a34a' : running ? '#3f3f46' : '#2563eb',
          color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: running || done ? 'not-allowed' : 'pointer', marginBottom: 24,
        }}>
          {done ? '✅ Hoàn tất' : running ? '⏳ Đang chạy...' : '▶ Chạy Migration'}
        </button>

        {logs.length > 0 && (
          <div style={{
            background: '#18181b', border: '1px solid #27272a', borderRadius: 12,
            padding: '16px 20px', fontSize: 13, lineHeight: 1.8, overflowY: 'auto', maxHeight: 480,
          }}>
            {logs.map((l, i) => (
              <div key={i} style={{
                color: l.type === 'success' ? '#4ade80' : l.type === 'error' ? '#f87171'
                     : l.type === 'warn'    ? '#facc15' : '#a1a1aa',
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