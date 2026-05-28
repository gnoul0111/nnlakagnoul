import type { NextRequest } from 'next/server'
import type { DecodedIdToken } from 'firebase-admin/auth'
import { getAdminAuth } from '@/lib/firebase/admin'

/**
 * Extracts and verifies a Firebase ID token from the Authorization header.
 * Returns the decoded token (contains uid, email, etc.) or throws on failure.
 *
 * Clients must send: Authorization: Bearer <Firebase ID Token>
 */
export async function verifyIdToken(request: NextRequest): Promise<DecodedIdToken> {
  const authHeader = request.headers.get('authorization') ?? ''

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or malformed Authorization header.')
  }

  const idToken = authHeader.slice(7)
  return getAdminAuth().verifyIdToken(idToken)
}
