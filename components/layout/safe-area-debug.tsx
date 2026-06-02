'use client'

import { useEffect, useState } from 'react'

// ⚠️ TẠM THỜI — chỉ để chẩn đoán dải đen safe-area trên iOS PWA.
// Đọc giá trị THẬT iOS trả về. Xong việc sẽ gỡ component này.
export function SafeAreaDebug() {
  const [info, setInfo] = useState('đo...')

  useEffect(() => {
    try {
      // Đo env(safe-area-inset-bottom) thật qua 1 phần tử ẩn
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;'
      document.body.appendChild(probe)
      const sab = getComputedStyle(probe).paddingBottom
      document.body.removeChild(probe)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const standalone = (window.navigator as any).standalone === true
        || window.matchMedia('(display-mode: standalone)').matches

      const vv = window.visualViewport ? Math.round(window.visualViewport.height) : '?'
      setInfo(`SAB=${sab} | inner=${window.innerHeight} | screen=${window.screen.height} | vv=${vv} | standalone=${standalone}`)
    } catch (e) {
      setInfo('err: ' + String(e))
    }
  }, [])

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 99999,
      background: 'red', color: '#fff', fontSize: 11, lineHeight: '16px',
      padding: '4px 6px', textAlign: 'center', fontFamily: 'monospace',
    }}>
      {info}
    </div>
  )
}
