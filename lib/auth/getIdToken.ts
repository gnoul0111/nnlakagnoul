'use client'

import { auth } from '@/lib/firebase/config'

/**
 * Returns the current user's Firebase ID token for server-side API calls.
 * Throws if the user is not authenticated.
 */
export async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated.')
  return user.getIdToken()
}

/**
 * Returns Authorization header object with a fresh Firebase ID token.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const token = await getIdToken()
  return { Authorization: `Bearer ${token}` }
}
