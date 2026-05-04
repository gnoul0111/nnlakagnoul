import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app'
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

// FIX S-12: Khởi tạo App Check ngay sau khi init app, trước khi init services
// Điều này đảm bảo mọi request đến Auth/Firestore/FCM đều được App Check token đính kèm
initAppCheck()

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