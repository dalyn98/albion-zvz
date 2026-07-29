import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDiscordCommandActor, type DiscordCommandTenant } from './discord-command-auth'
import type { DiscordInteractionPayload } from './discord-interactions'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  resolveUserCapabilities: vi.fn(async () => 0n),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

vi.mock('@/lib/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  resolveUserCapabilities: mocks.resolveUserCapabilities,
}))

const tenant: DiscordCommandTenant = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'guild',
  name: 'Guild',
  createdByDiscordId: '999999999999999999',
  adminRoleIds: ['777777777777777777'],
}

function queryResult(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data, error }))
  const secondEq = vi.fn(() => ({ maybeSingle }))
  const firstEq = vi.fn(() => ({ eq: secondEq }))
  return { select: vi.fn(() => ({ eq: firstEq })) }
}

function payload(overrides: Partial<DiscordInteractionPayload> = {}): DiscordInteractionPayload {
  return {
    id: '555555555555555555',
    type: 2,
    guild_id: '666666666666666666',
    member: {
      user: { id: '888888888888888888', username: 'member' },
      roles: [],
    },
    ...overrides,
  }
}

describe('Discord command actor boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects malformed Discord identifiers before any database lookup', async () => {
    const result = await resolveDiscordCommandActor({
      tenant,
      payload: payload({ guild_id: 'not-a-snowflake' }),
      requireMember: true,
    })

    expect(result).toEqual({ ok: false, error: 'not_in_guild' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('resolves an active member only inside the current tenant', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'guild_avatars') {
        return queryResult({ username: 'Albion Member', withdrawn_at: null })
      }
      if (table === 'tenant_admin_overrides') return queryResult(null)
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.resolveUserCapabilities.mockResolvedValueOnce(5n)

    const result = await resolveDiscordCommandActor({
      tenant,
      payload: payload(),
      requireMember: true,
    })

    expect(result).toEqual({
      ok: true,
      actor: expect.objectContaining({
        guildId: tenant.id,
        discordGuildId: '666666666666666666',
        discordId: '888888888888888888',
        username: 'Albion Member',
        isMember: true,
        isAdmin: false,
        capabilities: 5n,
      }),
    })
    expect(mocks.resolveUserCapabilities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ guildId: tenant.id, discordId: '888888888888888888' }),
    )
  })

  it('blocks withdrawn non-admin members', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'guild_avatars') {
        return queryResult({ username: 'Former Member', withdrawn_at: '2026-01-01T00:00:00Z' })
      }
      if (table === 'tenant_admin_overrides') return queryResult(null)
      throw new Error(`unexpected table: ${table}`)
    })

    const result = await resolveDiscordCommandActor({
      tenant,
      payload: payload(),
      requireMember: true,
    })

    expect(result).toEqual({ ok: false, error: 'not_member' })
    expect(mocks.resolveUserCapabilities).not.toHaveBeenCalled()
  })

  it('does not let an explicit tenant admin bypass a required active membership', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'guild_avatars') return queryResult(null)
      if (table === 'tenant_admin_overrides') {
        return queryResult({ discord_id: '888888888888888888' })
      }
      throw new Error(`unexpected table: ${table}`)
    })

    const result = await resolveDiscordCommandActor({
      tenant,
      payload: payload(),
      requireMember: true,
    })

    expect(result).toEqual({ ok: false, error: 'not_member' })
    expect(mocks.resolveUserCapabilities).not.toHaveBeenCalled()
  })

  it('allows an explicit tenant admin when an admin command opts out of membership', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'guild_avatars') return queryResult(null)
      if (table === 'tenant_admin_overrides') {
        return queryResult({ discord_id: '888888888888888888' })
      }
      throw new Error(`unexpected table: ${table}`)
    })

    const result = await resolveDiscordCommandActor({
      tenant,
      payload: payload(),
      requireMember: false,
    })

    expect(result).toEqual({
      ok: true,
      actor: expect.objectContaining({ isMember: false, isAdmin: true }),
    })
    expect(mocks.resolveUserCapabilities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isLegacyAdmin: true }),
    )
  })
})
