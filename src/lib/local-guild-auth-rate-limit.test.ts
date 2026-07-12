import { describe, expect, it } from 'vitest'
import {
  localGuildAuthAccountKey,
  localGuildAuthFingerprint,
} from './local-guild-auth-rate-limit'

describe('local guild auth rate limit helpers', () => {
  it('normalizes account keys without preserving the original casing', () => {
    expect(localGuildAuthAccountKey('west', '  not used here  ')).toBe('west:  not used here  ')
    expect(localGuildAuthAccountKey('west', 'ＭｏｎｋＫｕ')).toBe('west:monkku')
  })

  it('stores a salted hash instead of the raw client IP', () => {
    const previous = process.env.COOKIE_SECRET
    process.env.COOKIE_SECRET = 'test-cookie-secret'
    const headers = new Headers({ 'x-vercel-forwarded-for': '203.0.113.42' })

    const fingerprint = localGuildAuthFingerprint(headers)

    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(fingerprint).not.toContain('203.0.113.42')
    process.env.COOKIE_SECRET = previous
  })
})
