import { describe, expect, it } from 'vitest'
import {
  SESSION_REFRESH_COOLDOWN_MS,
  SESSION_REFRESH_INTERVAL_MS,
  shouldRefreshSessionOnActivity,
} from './session-refresh-policy'

describe('session refresh policy', () => {
  it('refreshes an active signed-in session before the seven-day absolute expiry', () => {
    const issuedAt = 1_000

    expect(shouldRefreshSessionOnActivity({
      issuedAt,
      lastAttemptAt: 0,
      now: issuedAt + SESSION_REFRESH_INTERVAL_MS - 1,
    })).toBe(false)
    expect(shouldRefreshSessionOnActivity({
      issuedAt,
      lastAttemptAt: 0,
      now: issuedAt + SESSION_REFRESH_INTERVAL_MS,
    })).toBe(true)
  })

  it('throttles repeated activity after a refresh attempt', () => {
    const now = SESSION_REFRESH_INTERVAL_MS + 1_000

    expect(shouldRefreshSessionOnActivity({
      issuedAt: 0,
      lastAttemptAt: now - SESSION_REFRESH_COOLDOWN_MS + 1,
      now,
    })).toBe(false)
    expect(shouldRefreshSessionOnActivity({
      issuedAt: 0,
      lastAttemptAt: now - SESSION_REFRESH_COOLDOWN_MS,
      now,
    })).toBe(true)
  })

  it('never refreshes malformed or future issued timestamps', () => {
    expect(shouldRefreshSessionOnActivity({ issuedAt: 0, lastAttemptAt: 0, now: 10_000 })).toBe(false)
    expect(shouldRefreshSessionOnActivity({
      issuedAt: 20_000,
      lastAttemptAt: 0,
      now: 10_000,
    })).toBe(false)
  })
})
