import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordGuildMemberBulk } from './discord'
import type { SessionPayload } from './session-verify'
import type { TenantDiscordConfig } from './tenant'
import { CAP, parseCapabilities } from './permissions'

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(async () => '[]'),
  getGuildMemberByBot: vi.fn(),
  identityFromMember: vi.fn(),
  resolveUserCapabilities: vi.fn(async () => 0n),
  isSuperAdmin: vi.fn(() => false),
  isTestAuthRouteEnabled: vi.fn(() => false),
  getSessionGuildId: vi.fn(async () => 'tenant-1'),
  getTenantDiscordConfig: vi.fn(),
  adminOverride: null as { discord_id: string } | null,
  adminOverrideError: null as { message: string } | null,
}))

vi.mock('react', () => ({
  cache: (fn: unknown) => fn,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/discord', () => ({
  getGuildMemberByBot: mocks.getGuildMemberByBot,
  identityFromMember: mocks.identityFromMember,
}))

vi.mock('@/lib/permissions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/permissions')>()),
  resolveUserCapabilities: mocks.resolveUserCapabilities,
}))

vi.mock('@/lib/super-admin', () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}))

vi.mock('@/lib/test-auth-session', () => ({
  isTestAuthRouteEnabled: mocks.isTestAuthRouteEnabled,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => {
    const maybeSingle = vi.fn(async () => ({
      data: mocks.adminOverride,
      error: mocks.adminOverrideError,
    }))
    const secondEq = vi.fn(() => ({ maybeSingle }))
    const firstEq = vi.fn(() => ({ eq: secondEq }))
    return {
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: firstEq })),
      })),
    }
  },
}))

import {
  resolveDiscordAuthorization,
  resolveLiveDiscordAuthorization,
} from './discord-live-authorization'

const tenant: TenantDiscordConfig = {
  id: 'tenant-1',
  discordGuildId: '77777777777777777',
  slug: 'guild',
  name: 'Guild',
  createdByDiscordId: '99999999999999999',
  memberRoleIds: ['44444444444444444'],
  adminRoleIds: [],
    eventChannelId: null,
    botInstalled: true,
    status: 'active',
  }

function member(
  overrides: Partial<DiscordGuildMemberBulk> = {},
): DiscordGuildMemberBulk {
  return {
    user: {
      id: '11111111111111111',
      username: 'discord-user',
      global_name: 'Discord User',
      avatar: null,
    },
    nick: 'Guild Nick',
    roles: ['22222222222222222'],
    ...overrides,
  }
}

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    discordId: '11111111111111111',
    username: 'signed-name',
    avatar: null,
    isMember: true,
    isAdmin: false,
    isGuest: false,
    isBombSquadCaller: false,
    isLocalGuildAccount: false,
    isAllianceCandidate: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: null,
    guildId: tenant.id,
    capabilities: '0',
    issuedAt: 1,
    ...overrides,
  }
}

describe('live Discord authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.adminOverride = null
    mocks.adminOverrideError = null
    mocks.getAppSetting.mockResolvedValue('[]')
    mocks.resolveUserCapabilities.mockResolvedValue(0n)
    mocks.identityFromMember.mockReturnValue({
      discordId: '11111111111111111',
      username: 'Guild Nick',
      avatar: null,
      isMember: true,
      isAdmin: false,
    })
    mocks.getSessionGuildId.mockResolvedValue(tenant.id)
    mocks.getTenantDiscordConfig.mockResolvedValue(tenant)
    mocks.getGuildMemberByBot.mockResolvedValue(member())
    mocks.isSuperAdmin.mockReturnValue(false)
    mocks.isTestAuthRouteEnabled.mockReturnValue(false)
  })

  it('never grants operational capabilities to local or guest sessions', async () => {
    await expect(
      resolveLiveDiscordAuthorization(
        session({ isLocalGuildAccount: true }),
      ),
    ).resolves.toBeNull()
    await expect(
      resolveLiveDiscordAuthorization(session({ isGuest: true })),
    ).resolves.toBeNull()
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.resolveUserCapabilities).not.toHaveBeenCalled()
  })

  it('fails closed when the signed-in user has left the Discord server', async () => {
    mocks.getGuildMemberByBot.mockResolvedValue(null)

    await expect(
      resolveLiveDiscordAuthorization(session({ isAdmin: true })),
    ).resolves.toBeNull()
    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith(
      tenant.discordGuildId,
      '11111111111111111',
    )
  })

  it('recomputes full-admin authority from the current Discord role list', async () => {
    mocks.resolveUserCapabilities.mockResolvedValue(CAP.GUILD_ADMIN)
    const currentMember = member({
      roles: ['22222222222222222', '33333333333333333'],
    })

    const result = await resolveDiscordAuthorization({
      tenant,
      discordId: '11111111111111111',
      member: currentMember,
      previousSession: session({ isAdmin: false }),
      issuedAt: 2,
    })

    expect(mocks.resolveUserCapabilities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        guildId: tenant.id,
        discordId: '11111111111111111',
        discordRoleIds: currentMember.roles,
        isLegacyAdmin: false,
      }),
    )
    expect(result?.session).toEqual(
      expect.objectContaining({
        isAdmin: true,
        isMember: true,
        issuedAt: 2,
        eventCreatorCategories: ['전투', 'FF', '갱킹'],
      }),
    )
  })

  it('limits an external caller to BOMB_SQUAD_CALL even if another role is misconfigured', async () => {
    mocks.identityFromMember.mockReturnValue({
      discordId: '11111111111111111',
      username: 'External Caller',
      avatar: null,
      isMember: false,
      isAdmin: false,
    })
    mocks.resolveUserCapabilities.mockResolvedValue(
      CAP.BOMB_SQUAD_CALL | CAP.SETTINGS_PERMISSIONS,
    )

    const result = await resolveDiscordAuthorization({
      tenant,
      discordId: '11111111111111111',
      member: member(),
    })

    expect(result?.session.isMember).toBe(false)
    expect(result?.session.isBombSquadCaller).toBe(true)
    expect(result?.session.isAllianceCandidate).toBe(false)
    expect(parseCapabilities(result?.session.capabilities)).toBe(
      CAP.BOMB_SQUAD_CALL,
    )
    expect(result?.session.eventCreatorCategories).toEqual([])
  })

  it('keeps the tenant owner as a bootstrap admin without consulting legacy admin role arrays', async () => {
    const ownerTenant = {
      ...tenant,
      createdByDiscordId: '11111111111111111',
      adminRoleIds: ['55555555555555555'],
    }
    mocks.resolveUserCapabilities.mockResolvedValue(CAP.MEMBERS_VIEW)

    const result = await resolveDiscordAuthorization({
      tenant: ownerTenant,
      discordId: '11111111111111111',
      member: member({ roles: [] }),
    })

    expect(mocks.resolveUserCapabilities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        discordRoleIds: [],
        isLegacyAdmin: true,
      }),
    )
    expect(result?.session.isAdmin).toBe(true)
  })
})
