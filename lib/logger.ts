/**
 * Structured server-side logger.
 * Production: chỉ log message + error code — không bao giờ log full error object
 * (stack trace, file paths, env vars có thể chứa sensitive data).
 * Development: log đầy đủ để debug.
 */

const IS_PROD = process.env.NODE_ENV === 'production'

export const logger = {
  error(context: string, message: string, err?: unknown): void {
    if (IS_PROD) {
      const code = err instanceof Error ? err.name : typeof err === 'string' ? err : 'UNKNOWN'
      console.error(JSON.stringify({ level: 'error', context, message, code }))
    } else {
      console.error(`[${context}] ${message}`, err)
    }
  },
  warn(context: string, message: string): void {
    if (IS_PROD) {
      console.warn(JSON.stringify({ level: 'warn', context, message }))
    } else {
      console.warn(`[${context}] ${message}`)
    }
  },
  info(context: string, message: string): void {
    if (!IS_PROD) {
      console.log(`[${context}] ${message}`)
    }
  },
}
