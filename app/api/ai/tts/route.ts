import { NextRequest, NextResponse } from 'next/server'
import { TextToSpeechClient } from '@google-cloud/text-to-speech'
import { verifyIdToken } from '@/lib/auth/verifyToken'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

export const maxDuration = 15

// Neural2 Vietnamese — tự nhiên nhất, nằm trong free tier 1M chars/tháng
const VOICE_NAME = 'vi-VN-Neural2-A'

let ttsClient: TextToSpeechClient | null = null

function getTtsClient(): TextToSpeechClient {
  if (ttsClient) return ttsClient
  const credentialsJson = process.env.FIREBASE_ADMIN_CREDENTIALS
  if (!credentialsJson) throw new Error('FIREBASE_ADMIN_CREDENTIALS missing')
  const credentials = JSON.parse(credentialsJson)
  ttsClient = new TextToSpeechClient({ credentials })
  return ttsClient
}

export async function POST(request: NextRequest) {
  let uid: string
  try {
    const decoded = await verifyIdToken(request)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rl = checkRateLimit({ key: `${uid}:tts`, limit: 15, windowMs: 60_000 })
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu.' }, { status: 429 })
  }

  let text: string
  try {
    const body = await request.json()
    text = String(body.text ?? '').trim().slice(0, 5000)
  } catch {
    return NextResponse.json({ error: 'Request không hợp lệ.' }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'Thiếu text.' }, { status: 400 })

  try {
    const client = getTtsClient()
    const [response] = await client.synthesizeSpeech({
      input: { text },
      voice: { languageCode: 'vi-VN', name: VOICE_NAME },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0,
      },
    })

    const audioBase64 = Buffer.from(response.audioContent as Uint8Array).toString('base64')
    return NextResponse.json({ audio: audioBase64, mimeType: 'audio/mpeg' })

  } catch (err) {
    logger.error('tts', 'Google TTS failed', err)
    return NextResponse.json({ error: 'Không tạo được audio.' }, { status: 500 })
  }
}
