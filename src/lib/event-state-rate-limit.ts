import 'server-only'

import { createHash } from 'node:crypto'

export const EVENT_STATE_RATE_LIMIT_WINDOW_MS = 60_000
export const EVENT_STATE_RATE_LIMIT_MAX_REQUESTS = 30
export const EVENT_STATE_RATE_LIMIT_GLOBAL_MAX_REQUESTS = 120
const EVENT_STATE_RATE_LIMIT_MAX_BUCKETS = 10_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface HeaderReader {
  get(name: string): string | null
}

export interface EventStateRateLimitBucket {
  count: number
  resetAt: number
}

interface EventStateRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

interface EventStateRateLimitKeyInput {
  eventId: string
  requestHeaders: HeaderReader
}

// Warm-instance fallback only. Keep a Vercel WAF rule in front of this route
// for the distributed production boundary across regions and instances.
const eventStateRateLimitBuckets = new Map<string, EventStateRateLimitBucket>()

export function parseEventStateId(value: string): string | null {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null
}

function requestIp(headers: HeaderReader): string {
  const forwarded = headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for') ?? ''
  return forwarded.split(',')[0]?.trim() || 'unknown'
}

export function eventStateRateLimitKeys(input: EventStateRateLimitKeyInput): {
  event: string
  global: string
} {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET is not set')
  const requesterHash = createHash('sha256')
    .update(`${secret}:event-state:ip:${requestIp(input.requestHeaders)}`)
    .digest('hex')
  return {
    event: `event:${input.eventId}:${requesterHash}`,
    global: `global:${requesterHash}`,
  }
}

function evictExpiredOrOldestBucket(
  store: Map<string, EventStateRateLimitBucket>,
  now: number,
): void {
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key)
  }
  if (store.size < EVENT_STATE_RATE_LIMIT_MAX_BUCKETS) return
  const oldestKey = store.keys().next().value
  if (typeof oldestKey === 'string') store.delete(oldestKey)
}

export function consumeEventStateRateLimit(
  store: Map<string, EventStateRateLimitBucket>,
  input: { key: string; maxRequests?: number; now?: number },
): EventStateRateLimitResult {
  const now = input.now ?? Date.now()
  const maxRequests = input.maxRequests ?? EVENT_STATE_RATE_LIMIT_MAX_REQUESTS
  const existing = store.get(input.key)
  if (!existing || existing.resetAt <= now) {
    if (!existing && store.size >= EVENT_STATE_RATE_LIMIT_MAX_BUCKETS) {
      evictExpiredOrOldestBucket(store, now)
    }
    store.set(input.key, {
      count: 1,
      resetAt: now + EVENT_STATE_RATE_LIMIT_WINDOW_MS,
    })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
    }
  }

  store.set(input.key, { ...existing, count: existing.count + 1 })
  return { allowed: true, retryAfterSeconds: 0 }
}

export function checkEventStateRateLimit(
  input: EventStateRateLimitKeyInput,
): EventStateRateLimitResult {
  const keys = eventStateRateLimitKeys(input)
  const globalResult = consumeEventStateRateLimit(eventStateRateLimitBuckets, {
    key: keys.global,
    maxRequests: EVENT_STATE_RATE_LIMIT_GLOBAL_MAX_REQUESTS,
  })
  if (!globalResult.allowed) return globalResult
  return consumeEventStateRateLimit(eventStateRateLimitBuckets, { key: keys.event })
}
