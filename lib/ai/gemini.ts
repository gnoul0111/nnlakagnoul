// Server-only module — không import file này trong client components.
// Dùng trong Next.js API routes (/app/api/**).
import { GoogleGenerativeAI } from '@google/generative-ai'

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình.')
  return new GoogleGenerativeAI(apiKey)
}

/** Model cho vision (quét hóa đơn) và text (tóm tắt tài chính) */
export function getGeminiModel(config?: { temperature?: number }) {
  return getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    ...(config ? { generationConfig: config } : {}),
  })
}
