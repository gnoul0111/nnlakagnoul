// Server-only module — không import file này trong client components.
// Dùng trong Next.js API routes (/app/api/**).
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { Schema } from '@google/generative-ai'

export { SchemaType }
export type { Schema }

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY chưa được cấu hình.')
  return new GoogleGenerativeAI(apiKey)
}

export function getGeminiModel(config?: {
  temperature?: number
  responseSchema?: Schema   // bật JSON mode + enforce output structure
  disableThinking?: boolean // tắt thinking — giảm latency cho tác vụ extraction
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generationConfig: Record<string, any> = {}

  if (config?.temperature !== undefined) generationConfig.temperature = config.temperature
  if (config?.responseSchema) {
    generationConfig.responseMimeType = 'application/json'
    generationConfig.responseSchema   = config.responseSchema
  }
  if (config?.disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 }
  }

  return getClient().getGenerativeModel({
    model: 'gemini-2.5-flash',
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  })
}
