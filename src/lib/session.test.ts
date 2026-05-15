import { describe, it, expect, beforeAll } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))

import { vi } from 'vitest'
import { signSession, verifySession, type SessionPayload } from './session'

beforeAll(() => {
  process.env.COOKIE_SECRET = 'test-secret-do-not-use-in-prod'
})

const basePayload = (overrides: Partial<SessionPayload> = {}): SessionPayload => ({
  discordId: 'user-1',
  username: 'tester',
  avatar: null,
  isMember: true,
  isAdmin: false,
  isGuest: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'tenant-1',
  issuedAt: Date.now(),
  ...overrides,
})

describe('session sign/verify round trip', () => {
  it('verifies a freshly-signed session and recovers all fields', async () => {
    const original = basePayload({ guildId: 'tenant-XYZ', isAdmin: true, canCreateEvents: true })
    const cookie = await signSession(original)
    const verified = await verifySession(cookie)
    expect(verified).not.toBeNull()
    expect(verified?.guildId).toBe('tenant-XYZ')
    expect(verified?.isAdmin).toBe(true)
    expect(verified?.canCreateEvents).toBe(true)
  })

  it('rejects a tampered payload (signature mismatch)', async () => {
    const original = basePayload()
    const cookie = await signSession(original)
    // Flip last char of the payload portion (before the dot)
    const [payloadB64, sig] = cookie.split('.')
    const lastChar = payloadB64.slice(-1)
    const tamperedChar = lastChar === 'A' ? 'B' : 'A'
    const tampered = payloadB64.slice(0, -1) + tamperedChar + '.' + sig
    const result = await verifySession(tampered)
    expect(result).toBeNull()
  })

  it('rejects a swapped signature', async () => {
    const a = await signSession(basePayload({ discordId: 'A' }))
    const b = await signSession(basePayload({ discordId: 'B' }))
    const [aPayload] = a.split('.')
    const [, bSig] = b.split('.')
    const swapped = `${aPayload}.${bSig}`
    expect(await verifySession(swapped)).toBeNull()
  })

  it('rejects sessions older than the max age', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const cookie = await signSession(basePayload({ issuedAt: eightDaysAgo }))
    const result = await verifySession(cookie)
    expect(result).toBeNull()
  })

  it('returns null for empty or malformed cookies', async () => {
    expect(await verifySession('')).toBeNull()
    expect(await verifySession(undefined)).toBeNull()
    expect(await verifySession('not-a-jwt')).toBeNull()
    expect(await verifySession('a.b.c')).toBeNull()
  })

  it('preserves guildId for tenant isolation', async () => {
    const cookie = await signSession(basePayload({ guildId: 'tenant-A' }))
    const verified = await verifySession(cookie)
    expect(verified?.guildId).toBe('tenant-A')
  })

  it('legacy cookie without guildId returns null guildId (fallback handled by caller)', async () => {
    // Manually create a session without the guildId field to simulate a pre-tenant cookie.
    const legacyPayload = {
      discordId: 'legacy',
      username: 'old',
      avatar: null,
      isMember: true,
      isAdmin: false,
      isGuest: false,
      canCreateEvents: false,
      eventCreatorCategories: [],
      eventScope: null,
      issuedAt: Date.now(),
    }
    // Sign without guildId — use the raw signing path.
    const cookie = await signSession(legacyPayload as unknown as SessionPayload)
    const verified = await verifySession(cookie)
    expect(verified?.guildId).toBeNull()
  })
})
