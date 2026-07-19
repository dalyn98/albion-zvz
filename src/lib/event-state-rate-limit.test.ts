import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_STATE_RATE_LIMIT_MAX_REQUESTS,
  EVENT_STATE_RATE_LIMIT_GLOBAL_MAX_REQUESTS,
  EVENT_STATE_RATE_LIMIT_WINDOW_MS,
  consumeEventStateRateLimit,
  eventStateRateLimitKeys,
  type EventStateRateLimitBucket,
} from './event-state-rate-limit'

describe('event state rate limit', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('hashes the requester identity and scopes it to one event', () => {
    vi.stubEnv('COOKIE_SECRET', 'event-state-rate-limit-test-secret')
    const headers = new Headers({ 'x-vercel-forwarded-for': '203.0.113.42' })
    const keys = eventStateRateLimitKeys({
      eventId: 'event-1',
      requestHeaders: headers,
    })

    expect(keys.event).toMatch(/^event:event-1:[a-f0-9]{64}$/)
    expect(keys.global).toMatch(/^global:[a-f0-9]{64}$/)
    expect(`${keys.event}:${keys.global}`).not.toContain('203.0.113.42')
    expect(EVENT_STATE_RATE_LIMIT_GLOBAL_MAX_REQUESTS).toBeGreaterThan(
      EVENT_STATE_RATE_LIMIT_MAX_REQUESTS,
    )
  })

  it('blocks a burst and allows the next fixed window', () => {
    const store = new Map<string, EventStateRateLimitBucket>()
    const input = { key: 'event-1:subject', now: 1_000 }

    for (let index = 0; index < EVENT_STATE_RATE_LIMIT_MAX_REQUESTS; index += 1) {
      expect(consumeEventStateRateLimit(store, input).allowed).toBe(true)
    }
    const blocked = consumeEventStateRateLimit(store, input)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)

    expect(consumeEventStateRateLimit(store, {
      ...input,
      now: input.now + EVENT_STATE_RATE_LIMIT_WINDOW_MS,
    }).allowed).toBe(true)
  })
})
