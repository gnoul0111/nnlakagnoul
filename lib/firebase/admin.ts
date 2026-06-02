import * as admin from 'firebase-admin'

function createAdminApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.app()

  const credentialsJson = process.env.FIREBASE_ADMIN_CREDENTIALS
  if (!credentialsJson) {
    throw new Error(
      '[FirebaseAdmin] FIREBASE_ADMIN_CREDENTIALS env var is missing. ' +
      'Set it to the JSON content of your service account key file.'
    )
  }

  let serviceAccount: admin.ServiceAccount
  try {
    serviceAccount = JSON.parse(credentialsJson)
  } catch {
    throw new Error('[FirebaseAdmin] FIREBASE_ADMIN_CREDENTIALS is not valid JSON.')
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId:  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  })
}

export function getAdminApp(): admin.app.App {
  return createAdminApp()
}

export function getAdminAuth(): admin.auth.Auth {
  return admin.auth(getAdminApp())
}

export function getAdminDb(): admin.firestore.Firestore {
  return admin.firestore(getAdminApp())
}

export { admin }
