/**
 * In-memory sliding window rate limiter.
 * Phù hợp cho Vercel serverless — mỗi instance có bộ nhớ riêng.
 * Đủ để ngăn spam từ một user duy nhất; không phải distributed rate limit.
 */

interface WindowEntry {
  count:     number
  windowEnd: number
}

const store = new Map<string, WindowEntry>()

interface RateLimitOptions {
  key:          string  // unique key per user+action (vd: "uid:scan-receipt")
  limit:        number  // số request tối đa trong window
  windowMs:     number  // kích thước window (ms)
}

interface RateLimitResult {
  allowed:    boolean
  remaining:  number
  resetAfter: number  // ms đến khi window reset
}

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now   = Date.now()
  const entry = store.get(opts.key)

  if (!entry || now > entry.windowEnd) {
    // Cửa sổ mới
    store.set(opts.key, { count: 1, windowEnd: now + opts.windowMs })
    return { allowed: true, remaining: opts.limit - 1, resetAfter: opts.windowMs }
  }

  if (entry.count >= opts.limit) {
    return { allowed: false, remaining: 0, resetAfter: entry.windowEnd - now }
  }

  entry.count++
  return { allowed: true, remaining: opts.limit - entry.count, resetAfter: entry.windowEnd - now }
}
