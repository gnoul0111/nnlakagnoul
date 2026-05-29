import { initializeApp, getApps, getApp, setLogLevel, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging'
import { getFunctions, type Functions } from 'firebase/functions'

// FIX S-12: Import App Check initialization
// App Check phải init TRƯỚC khi bất kỳ Firebase service nào được gọi.
// initAppCheck() check typeof window bên trong → an toàn khi import ở server.
import { initAppCheck } from './appCheck'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Singleton — tránh init nhiều lần khi Next.js hot reload
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

// Tắt Firebase info/debug logs trên production.
// "[AppCheck] Initialized with reCAPTCHA Enterprise" là info log — không cần thiết cho user.
// 'error' chỉ giữ lại lỗi thực sự, bỏ info/warn/debug.
if (process.env.NODE_ENV === 'production') {
  setLogLevel('error')
}

// PERF: Defer initAppCheck() ra khỏi critical render path.
// App shell render ngay; reCAPTCHA khởi tạo ngầm khi browser rảnh.
if (typeof window !== 'undefined') {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => initAppCheck(), { timeout: 3000 })
  } else {
    setTimeout(initAppCheck, 0)
  }
}

const auth: Auth = getAuth(app)
const db: Firestore = getFirestore(app)
const functions: Functions = getFunctions(app, 'asia-southeast1')

let messaging: Messaging | null = null

async function getMessagingInstance(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null
  if (messaging) return messaging
  const supported = await isSupported()
  if (!supported) return null
  messaging = getMessaging(app)
  return messaging
}

export { app, auth, db, functions, getMessagingInstance }