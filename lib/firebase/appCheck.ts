/**
 * appCheck.ts — Firebase App Check setup
 *
 * FIX S-10 + S-12:
 *   S-12: Không có App Check → attacker dùng API key + project ID để gọi
 *         Firestore REST API trực tiếp, bypass app hoàn toàn.
 *   S-10: VAPID key public theo FCM spec nhưng không có App Check thì
 *         attacker subscribe push notification từ domain khác.
 *
 * App Check enforce rằng request đến Firebase phải đến từ app thật
 * (verified bởi reCAPTCHA Enterprise), không phải từ script/Postman/curl.
 *
 * SETUP CHECKLIST (làm 1 lần trong Firebase Console):
 *   1. Firebase Console → App Check → Apps → Register app → reCAPTCHA Enterprise
 *   2. Google Cloud Console → reCAPTCHA Enterprise → tạo site key
 *   3. Thêm NEXT_PUBLIC_RECAPTCHA_SITE_KEY vào .env.local
 *   4. Firebase Console → App Check → APIs → Enforce Firestore + FCM
 *      ⚠ Bật Enforce (không phải Monitor) → sau khi test kỹ với debug token
 *
 * DEBUG TOKEN (local development):
 *   - Firebase Console → App Check → Apps → chọn app → Manage debug tokens
 *   - Tạo token, set vào NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN trong .env.local
 *   - KHÔNG commit debug token vào git
 */

import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check'
// FIX circular import:
// Trước: import { app } from './config'  ← config.ts cũng import từ appCheck.ts
//        → circular dependency → app = undefined khi initAppCheck() chạy
//        → initializeAppCheck(undefined) → Firebase Auth bị block
//        → onAuthStateChanged không bao giờ fire → app kẹt "Đang tải..." mãi
// Sau:   dùng getApp() — lấy instance từ Firebase registry, không cần import trực tiếp
import { getApp } from 'firebase/app'

let appCheckInitialized = false
let appCheckInstance: AppCheck | null = null

export function initAppCheck(): void {
  // Chỉ chạy ở browser, chỉ khởi tạo 1 lần
  if (typeof window === 'undefined' || appCheckInitialized) return

  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY

  // Development: dùng debug token nếu có
  if (process.env.NODE_ENV === 'development') {
    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN
    if (debugToken) {
      // @ts-expect-error — global debug flag của Firebase App Check SDK
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
    }
  }

  if (!siteKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[AppCheck] NEXT_PUBLIC_RECAPTCHA_SITE_KEY is missing. ' +
        'Firebase requests are NOT protected. Set up App Check in Firebase Console.'
      )
    }
    return
  }

  try {
    appCheckInstance = initializeAppCheck(getApp(), {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    })
    appCheckInitialized = true
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AppCheck] Initialized with reCAPTCHA Enterprise.')
    }
  } catch (err) {
    console.error('[AppCheck] Initialization failed:', err)
  }
}

/**
 * PERF: làm nóng App Check sớm (gọi ở trang đăng nhập).
 *
 * Token reCAPTCHA Enterprise đầu tiên tốn ~1–3s vì phải load enterprise.js
 * + chạy risk assessment. Nếu chờ tới lúc request Firestore đầu tiên (sau khi
 * đăng nhập) mới fetch → user thấy "load lâu". Gọi hàm này khi trang login mount
 * để token được lấy SONG SONG trong lúc user thao tác popup OAuth (vốn mất vài
 * giây) → tới khi đăng nhập xong, token đã sẵn sàng → data load tức thì.
 */
export function warmUpAppCheck(): void {
  if (typeof window === 'undefined') return
  initAppCheck()
  if (!appCheckInstance) return
  // Fire-and-forget: ép fetch token ngay, không chờ tới request đầu tiên.
  getToken(appCheckInstance).catch(() => { /* sẽ thử lại khi có request thật */ })
}