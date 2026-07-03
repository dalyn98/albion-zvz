import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getTranslations: vi.fn(),
  requireCapability: vi.fn(),
  resolveEffectiveSiteUsername: vi.fn(),
  revalidatePath: vi.fn(),
  syncDiscordGuildNickname: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/auth', () => ({
  requireCapability: mocks.requireCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  sessionHas: vi.fn(() => false),
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/site-nickname-override', () => ({
  resolveEffectiveSiteUsername: mocks.resolveEffectiveSiteUsername,
}))

vi.mock('@/lib/discord-nickname-sync', () => ({
  syncDiscordGuildNickname: mocks.syncDiscordGuildNickname,
}))

import { approveMemberAlbionIdentity } from './stats-admin'

function resolvedChain<T>(result: T) {
  const chain = {
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

function createReviewDb() {
  const accountUpdates: Record<string, unknown>[] = []
  const avatarUpdates: Record<string, unknown>[] = []
  const auditRows: Record<string, unknown>[] = []
  const link = {
    data: {
      profile_id: 'profile-1',
      relation: 'home_guild',
      verified_at: null,
      albion_player_name: 'AlbionName',
    },
    error: null,
  }

  const db = {
    from: vi.fn((table: string) => {
      if (table === 'account_albion_tenant_links') {
        return {
          select: vi.fn(() => resolvedChain(link)),
          update: vi.fn((patch: Record<string, unknown>) => {
            accountUpdates.push(patch)
            return resolvedChain({ error: null })
          }),
        }
      }
      if (table === 'guild_avatars') {
        return {
          update: vi.fn((patch: Record<string, unknown>) => {
            avatarUpdates.push(patch)
            return resolvedChain({ error: null })
          }),
        }
      }
      if (table === 'account_albion_identity_audit') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            auditRows.push(row)
            return Promise.resolve({ error: null })
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }

  return { db, accountUpdates, avatarUpdates, auditRows }
}

describe('approveMemberAlbionIdentity', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    vi.clearAllMocks()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.resolveEffectiveSiteUsername.mockResolvedValue('AlbionName')
    mocks.syncDiscordGuildNickname.mockResolvedValue({ status: 'synced' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('syncs site and Discord nicknames when an admin approves a home-guild identity', async () => {
    const { db, accountUpdates, avatarUpdates, auditRows } = createReviewDb()
    mocks.requireCapability.mockResolvedValue(db)

    await expect(approveMemberAlbionIdentity('member-1')).resolves.toEqual({
      ok: true,
      discordNicknameSyncFailed: false,
    })

    expect(accountUpdates[0]).toMatchObject({
      trust_status: 'trusted',
      status_reason: 'admin_approved',
      verified_at: '2026-01-01T00:00:00.000Z',
      trusted_at: '2026-01-01T00:00:00.000Z',
    })
    expect(avatarUpdates[0]).toEqual({
      albion_verified_at: '2026-01-01T00:00:00.000Z',
      username: 'AlbionName',
    })
    expect(mocks.syncDiscordGuildNickname).toHaveBeenCalledWith({
      guildId: 'tenant-1',
      discordId: 'member-1',
      nickname: 'AlbionName',
      source: 'admin_approve',
    })
    expect(auditRows[0]).toMatchObject({
      guild_id: 'tenant-1',
      discord_id: 'member-1',
      actor_discord_id: 'admin-1',
      action: 'admin_approve',
    })
  })
})
