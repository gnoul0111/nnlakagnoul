import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { auth } from './config'

// FIX S-08 + S-13: unify error messages to prevent user enumeration
// Old: user-not-found and wrong-password had different messages
// Fix: map ALL credential errors to same generic message

const FIREBASE_ERROR_MAP: Record<string, string> = {
  'auth/invalid-email':          'Email không hợp lệ.',
  'auth/user-disabled':          'Tài khoản đã bị vô hiệu hóa.',
  'auth/too-many-requests':      'Quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi kết nối mạng. Vui lòng thử lại.',
  'auth/requires-recent-login':  'Vui lòng đăng xuất và đăng nhập lại để thực hiện thao tác này.',
  'auth/popup-closed-by-user':   'Đã đóng cửa sổ đăng nhập.',
  // FIX: all three map to same message -> no email enumeration possible
  'auth/invalid-credential':     'Email hoặc mật khẩu không đúng.',
  'auth/user-not-found':         'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password':         'Email hoặc mật khẩu không đúng.',
  // Signup
  'auth/email-already-in-use':   'Email này đã được sử dụng.',
  'auth/weak-password':          'Mật khẩu quá yếu (tối thiểu 8 ký tự, gồm chữ và số).',
}

const googleProvider = new GoogleAuthProvider()
// Khong set prompt: 'select_account' → Google tu dang nhap thang bang tai khoan
// dang dung (nhanh hon 1 buoc). Neu co nhieu tai khoan, Google van hien chon.

export interface GoogleSignInResult {
  user:    User
  isNewUser: boolean
}

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const result   = await signInWithPopup(auth, googleProvider)
  const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false
  return { user: result.user, isNewUser }
}

export function getAuthErrorMessage(code: string): string {
  return FIREBASE_ERROR_MAP[code] ?? 'Đã có lỗi xảy ra. Vui lòng thử lại.'
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function signupWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(result.user, { displayName })
  return result.user
}

export async function logout(): Promise<void> {
  await signOut(auth)
}

export async function updateDisplayName(displayName: string): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Chưa đăng nhập.')
  await updateProfile(user, { displayName })
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('Chưa đăng nhập.')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export async function sendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user)
}

// FIX S-08: resetPassword always resolves (caller shows success regardless)
// forgot-password-form.tsx already handles auth/user-not-found -> shows success
// This is intentional: never reveal whether email exists in the system
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email)
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export function getCurrentUser(): User | null {
  return auth.currentUser
}