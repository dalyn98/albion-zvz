import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: mocks.lookup,
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
    info: vi.fn(),
    warn: mocks.logWarn,
  },
}))

import {
  getTenantSessionStatus,
  isSessionIssuedAfterRevocation,
  isTenantSessionCurrent,
} from './session-revocation'
import type { SessionPayload } from './session-verify'

const session: SessionPayload = {
  discordId: 'member-1',
  username: 'Member',
  avatar: null,
  isMember: true,
  isAdmin: true,
  isGuest: false,
  isBombSquadCaller: false,
  isLocalGuildAccount: false,
  isAllianceCandidate: false,
  canCreateEvents: true,
  eventCreatorCategories: ['전투', 'FF', '갱킹'],
  eventScope: null,
  guildId: 'guild-1',
  capabilities: '',
  issuedAt: Date.parse('2026-07-12T10:05:00.001Z'),
}

describe('session revocation cutoff', () => {
  beforeEach(() => {
    mocks.lookup.mockReset()
    mocks.logError.mockReset()
    mocks.logWarn.mockReset()
  })

  it('rejects a session issued at or before either global or member cutoff', () => {
    const revocations = [
      { invalid_before: '2026-07-12T10:00:00.000Z' },
      { invalid_before: '2026-07-12T10:05:00.000Z' },
    ]

    expect(isSessionIssuedAfterRevocation(Date.parse('2026-07-12T10:05:00.000Z'), revocations)).toBe(false)
    expect(isSessionIssuedAfterRevocation(Date.parse('2026-07-12T10:05:00.001Z'), revocations)).toBe(true)
  })

  it('retries a transient lookup failure before accepting a current session', async () => {
    mocks.lookup
      .mockResolvedValueOnce({
        data: null,
        error: { code: '503', message: 'service unavailable' },
      })
      .mockResolvedValueOnce({ data: [], error: null })

    await expect(isTenantSessionCurrent(session)).resolves.toBe(true)

    expect(mocks.lookup).toHaveBeenCalledTimes(2)
    expect(mocks.logWarn).toHaveBeenCalledWith(
      '[session-revocation] transient lookup retry',
      expect.objectContaining({
        reason: 'lookup_retry',
        tenant_id: 'guild-1',
        discord_id: 'member-1',
        error_code: '503',
      }),
    )
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('fails closed and records a lookup error after retry exhaustion', async () => {
    mocks.lookup.mockResolvedValue({
      data: null,
      error: { code: '503', message: 'service unavailable' },
    })

    await expect(isTenantSessionCurrent(session)).resolves.toBe(false)

    expect(mocks.lookup).toHaveBeenCalledTimes(2)
    expect(mocks.logError).toHaveBeenCalledWith(
      '[session-revocation] lookup failed',
      expect.objectContaining({ code: '503' }),
      expect.objectContaining({
        reason: 'lookup_error',
        tenant_id: 'guild-1',
        discord_id: 'member-1',
        error_code: '503',
      }),
    )
  })

  it('distinguishes authority outages from intentional revocations', async () => {
    mocks.lookup.mockResolvedValue({
      data: null,
      error: { code: '503', message: 'service unavailable' },
    })

    await expect(getTenantSessionStatus(session)).resolves.toBe('unavailable')

    mocks.lookup.mockReset()
    mocks.lookup.mockResolvedValue({
      data: [{ invalid_before: '2026-07-12T10:05:00.001Z' }],
      error: null,
    })

    await expect(getTenantSessionStatus(session)).resolves.toBe('revoked')
  })

  it('records an intentional revocation separately from lookup failures', async () => {
    mocks.lookup.mockResolvedValue({
      data: [{ invalid_before: '2026-07-12T10:05:00.001Z' }],
      error: null,
    })

    await expect(isTenantSessionCurrent(session)).resolves.toBe(false)

    expect(mocks.logWarn).toHaveBeenCalledWith(
      '[session-revocation] session rejected',
      expect.objectContaining({
        reason: 'revoked',
        tenant_id: 'guild-1',
        discord_id: 'member-1',
        revocation_count: 1,
      }),
    )
    expect(mocks.logError).not.toHaveBeenCalled()
  })
})
