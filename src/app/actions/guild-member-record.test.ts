import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  requireLiveSession: vi.fn(),
  requireCapability: vi.fn(),
  getSessionGuildId: vi.fn(),
  getGuildMemberDirectoryEntry: vi.fn(),
  syncDiscordGuildNickname: vi.fn(),
  publicActionError: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))
vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))
vi.mock('@/lib/auth', () => ({
  requireLiveSession: mocks.requireLiveSession,
  requireCapability: mocks.requireCapability,
}))
vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))
vi.mock('@/lib/guild-member-directory', () => ({
  getGuildMemberDirectoryEntry: mocks.getGuildMemberDirectoryEntry,
}))
vi.mock('@/lib/discord-nickname-sync', () => ({
  syncDiscordGuildNickname: mocks.syncDiscordGuildNickname,
}))
vi.mock('@/lib/public-action-error', () => ({
  publicActionError: mocks.publicActionError,
}))

import {
  applyGuildMemberNameToDiscord,
  saveGuildMemberDisplayName,
} from './guild-member-record'

const memberId = '11111111-1111-4111-8111-111111111111'
const discordId = '711111111111111111'

describe('guild member display name actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.requireLiveSession.mockResolvedValue({
      discordId: '799999999999999999',
    })
    mocks.requireCapability.mockResolvedValue({ rpc: mocks.rpc })
    mocks.getSessionGuildId.mockResolvedValue(
      '22222222-2222-4222-8222-222222222222',
    )
    mocks.getGuildMemberDirectoryEntry.mockResolvedValue({
      guildMemberId: memberId,
      discordId,
      displayName: 'Member Name',
    })
    mocks.rpc.mockResolvedValue({ error: null })
    mocks.publicActionError.mockResolvedValue('actionFailed')
    mocks.syncDiscordGuildNickname.mockResolvedValue({ status: 'synced' })
  })

  it('normalizes and writes a guild-scoped override through the audited RPC', async () => {
    await expect(
      saveGuildMemberDisplayName({
        guildMemberId: memberId,
        discordId,
        displayName: '  Ｍember Name  ',
      }),
    ).resolves.toEqual({ ok: true })

    expect(mocks.rpc).toHaveBeenCalledWith(
      'set_guild_member_display_name',
      {
        p_guild_id: '22222222-2222-4222-8222-222222222222',
        p_guild_member_id: memberId,
        p_display_name: 'Member Name',
        p_actor_discord_id: '799999999999999999',
      },
    )
  })

  it('allows clearing the override without changing external identities', async () => {
    await saveGuildMemberDisplayName({
      guildMemberId: memberId,
      discordId,
      displayName: '   ',
    })

    expect(mocks.rpc).toHaveBeenCalledWith(
      'set_guild_member_display_name',
      expect.objectContaining({ p_display_name: null }),
    )
    expect(mocks.syncDiscordGuildNickname).not.toHaveBeenCalled()
  })

  it('does not write when the stable UUID does not match the tenant contact', async () => {
    mocks.getGuildMemberDirectoryEntry.mockResolvedValue({
      guildMemberId: '33333333-3333-4333-8333-333333333333',
    })

    await expect(
      saveGuildMemberDisplayName({
        guildMemberId: memberId,
        discordId,
        displayName: 'Member Name',
      }),
    ).resolves.toEqual({ error: 'displayNameMemberNotFound' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('changes Discord only through the explicit operator action', async () => {
    await expect(
      applyGuildMemberNameToDiscord({ guildMemberId: memberId, discordId }),
    ).resolves.toEqual({ ok: true })

    expect(mocks.syncDiscordGuildNickname).toHaveBeenCalledWith({
      guildId: '22222222-2222-4222-8222-222222222222',
      discordId,
      nickname: 'Member Name',
      source: 'admin_manual',
    })
  })
})
