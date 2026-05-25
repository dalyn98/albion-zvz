import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CAP } from './permissions'

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}))

import {
  sessionHas,
  sessionHasAll,
  sessionHasAny,
  signSession,
  verifySession,
  type SessionPayload,
} from './session'

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
  isLocalGuildAccount: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'tenant-1',
  capabilities: '0',
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
    // Flip last char of the payload portion (before the dot).
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
    const legacyPayload = {
      discordId: 'legacy',
      username: 'old',
      avatar: null,
      isMember: true,
      isAdmin: false,
      isGuest: false,
      isLocalGuildAccount: false,
      canCreateEvents: false,
      eventCreatorCategories: [],
      eventScope: null,
      issuedAt: Date.now(),
    }
    const cookie = await signSession(legacyPayload as unknown as SessionPayload)
    const verified = await verifySession(cookie)
    expect(verified?.guildId).toBeNull()
  })
})

describe('session capability helpers', () => {
  it('treats admin sessions as having every capability even with legacy empty bits', () => {
    const admin = basePayload({ isAdmin: true, capabilities: '' })

    expect(sessionHas(admin, CAP.SIPHON_MANAGE)).toBe(true)
    expect(sessionHasAny(admin, [CAP.CHEST_LOG_PASTE, CAP.AUDIT_VIEW])).toBe(true)
    expect(sessionHasAll(admin, [CAP.SETTINGS_PERMISSIONS, CAP.EVENT_MANAGE])).toBe(true)
  })

  it('keeps non-admin sessions limited to their explicit capability bits', () => {
    const officer = basePayload({ capabilities: CAP.SIPHON_MANAGE.toString() })

    expect(sessionHas(officer, CAP.SIPHON_MANAGE)).toBe(true)
    expect(sessionHas(officer, CAP.AUDIT_VIEW)).toBe(false)
    expect(sessionHasAny(officer, [CAP.CHEST_LOG_PASTE, CAP.AUDIT_VIEW])).toBe(false)
    expect(sessionHasAll(officer, [CAP.SIPHON_MANAGE, CAP.AUDIT_VIEW])).toBe(false)
  })

  it('returns false for missing sessions', () => {
    expect(sessionHas(null, CAP.SIPHON_MANAGE)).toBe(false)
    expect(sessionHasAny(null, [CAP.SIPHON_MANAGE])).toBe(false)
    expect(sessionHasAll(null, [CAP.SIPHON_MANAGE])).toBe(false)
  })
})
