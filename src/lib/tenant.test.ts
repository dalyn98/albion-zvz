import { describe, it, expect, vi, beforeEach } from 'vitest'

const isSuperAdminMock = vi.fn<(discordId: string | null | undefined) => boolean>(() => false)
const getImpersonationFromCookiesMock = vi.fn<() => Promise<{ tenantId: string } | null>>(
  async () => null,
)

vi.mock('@/lib/super-admin', () => ({
  isSuperAdmin: (id: string | null | undefined) => isSuperAdminMock(id),
}))

vi.mock('@/lib/super-admin-impersonation', () => ({
  getImpersonationFromCookies: () => getImpersonationFromCookiesMock(),
}))

interface TenantRow {
  id?: string
}
let nextMaybeSingle: { data: TenantRow | null } = { data: null }
const eqCalls: Array<{ column: string; value: unknown }> = []

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          eqCalls.push({ column, value })
          return {
            maybeSingle: async () => nextMaybeSingle,
          }
        },
      }),
    }),
  }),
}))

import { getSessionGuildId, getTenantIdByDiscordGuildId } from './tenant'
import type { SessionPayload } from './session'

const baseSession = (guildId: string | null = null, discordId = 'user-123'): SessionPayload => ({
  discordId,
  username: 'tester',
  avatar: null,
  isAdmin: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  isBombSquadCaller: false,
  isAllianceCandidate: false,
  guildId,
} as unknown as SessionPayload)

describe('getTenantIdByDiscordGuildId', () => {
  beforeEach(() => {
    eqCalls.length = 0
    nextMaybeSingle = { data: null }
  })

  it('returns tenant id by discord_guild_id', async () => {
    nextMaybeSingle = { data: { id: 'tenant-abc' } }
    const result = await getTenantIdByDiscordGuildId('999')
    expect(result).toBe('tenant-abc')
    expect(eqCalls).toEqual([{ column: 'discord_guild_id', value: '999' }])
  })

  it('returns null when no tenant matches', async () => {
    nextMaybeSingle = { data: null }
    const result = await getTenantIdByDiscordGuildId('unknown')
    expect(result).toBe(null)
  })
})

describe('getSessionGuildId fallback chain', () => {
  beforeEach(() => {
    eqCalls.length = 0
    isSuperAdminMock.mockReset().mockReturnValue(false)
    getImpersonationFromCookiesMock.mockReset().mockResolvedValue(null)
    nextMaybeSingle = { data: null }
  })

  it('returns session.guildId when present and user is not impersonating', async () => {
    const session = baseSession('tenant-from-session')
    const result = await getSessionGuildId(session)
    expect(result).toBe('tenant-from-session')
  })

  it('uses impersonation tenant when superAdmin AND cookie set', async () => {
    isSuperAdminMock.mockReturnValue(true)
    getImpersonationFromCookiesMock.mockResolvedValue({ tenantId: 'tenant-imp' })
    const session = baseSession('tenant-from-session', 'super-1')
    const result = await getSessionGuildId(session)
    expect(result).toBe('tenant-imp')
  })

  it('ignores impersonation cookie when NOT superAdmin', async () => {
    isSuperAdminMock.mockReturnValue(false)
    getImpersonationFromCookiesMock.mockResolvedValue({ tenantId: 'tenant-imp' })
    const session = baseSession('tenant-from-session', 'rando')
    const result = await getSessionGuildId(session)
    expect(result).toBe('tenant-from-session')
  })

  it('falls back to primary tenant lookup when session has no guildId', async () => {
    process.env.DISCORD_GUILD_ID = '12345'
    nextMaybeSingle = { data: { id: 'primary-tenant' } }
    const session = baseSession(null)
    const result = await getSessionGuildId(session)
    expect(result).toBe('primary-tenant')
  })
})
