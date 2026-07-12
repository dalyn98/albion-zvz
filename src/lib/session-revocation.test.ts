import { describe, expect, it } from 'vitest'
import { isSessionIssuedAfterRevocation } from './session-revocation'

describe('session revocation cutoff', () => {
  it('rejects a session issued at or before either global or member cutoff', () => {
    const revocations = [
      { invalid_before: '2026-07-12T10:00:00.000Z' },
      { invalid_before: '2026-07-12T10:05:00.000Z' },
    ]

    expect(isSessionIssuedAfterRevocation(Date.parse('2026-07-12T10:05:00.000Z'), revocations)).toBe(false)
    expect(isSessionIssuedAfterRevocation(Date.parse('2026-07-12T10:05:00.001Z'), revocations)).toBe(true)
  })
})
