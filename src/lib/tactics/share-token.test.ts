import { describe, expect, it } from 'vitest'
import {
  createTacticShareToken,
  defaultTacticShareExpiresAt,
  hashTacticShareToken,
  isTacticShareLinkUsable,
  isValidTacticShareToken,
} from './share-token'

describe('tactic share tokens', () => {
  it('creates URL-safe tokens and stores only deterministic hashes', () => {
    const token = createTacticShareToken()
    const hash = hashTacticShareToken(token)

    expect(isValidTacticShareToken(token)).toBe(true)
    expect(hash).not.toBe(token)
    expect(hash).toBe(hashTacticShareToken(token))
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects malformed tokens before querying the database', () => {
    expect(isValidTacticShareToken('')).toBe(false)
    expect(isValidTacticShareToken('../not-safe')).toBe(false)
    expect(isValidTacticShareToken('short')).toBe(false)
  })

  it('issues finite seven-day links and rejects expired or revoked links', () => {
    const now = new Date('2026-08-01T00:00:00.000Z')
    expect(defaultTacticShareExpiresAt(now).toISOString()).toBe(
      '2026-08-08T00:00:00.000Z',
    )
    expect(
      isTacticShareLinkUsable(
        { expiresAt: '2026-08-02T00:00:00.000Z', revokedAt: null },
        now,
      ),
    ).toBe(true)
    expect(
      isTacticShareLinkUsable(
        { expiresAt: '2026-08-01T00:00:00.000Z', revokedAt: null },
        now,
      ),
    ).toBe(false)
    expect(
      isTacticShareLinkUsable(
        {
          expiresAt: '2026-08-02T00:00:00.000Z',
          revokedAt: '2026-08-01T00:00:00.000Z',
        },
        now,
      ),
    ).toBe(false)
  })
})
