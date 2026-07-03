import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  changeGuildMemberNickname: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/discord', () => ({
  changeGuildMemberNickname: mocks.changeGuildMemberNickname,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/log', () => ({
  log: {
    warn: mocks.warn,
  },
}))

import { syncDiscordGuildNickname } from './discord-nickname-sync'

describe('syncDiscordGuildNickname', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTenantDiscordConfig.mockResolvedValue({
      discordGuildId: 'discord-guild-1',
    })
  })

  it('changes the Discord guild nickname through the tenant Discord guild', async () => {
    await expect(
      syncDiscordGuildNickname({
        guildId: 'tenant-1',
        discordId: 'member-1',
        nickname: '  AlbionName  ',
        source: 'member_onboarding',
      }),
    ).resolves.toEqual({ status: 'synced' })

    expect(mocks.changeGuildMemberNickname).toHaveBeenCalledWith(
      'discord-guild-1',
      'member-1',
      'AlbionName',
    )
  })

  it('skips when the tenant Discord config is missing', async () => {
    mocks.getTenantDiscordConfig.mockResolvedValue(null)

    await expect(
      syncDiscordGuildNickname({
        guildId: 'tenant-1',
        discordId: 'member-1',
        nickname: 'AlbionName',
        source: 'member_onboarding',
      }),
    ).resolves.toEqual({ status: 'skipped', reason: 'missing_tenant_config' })

    expect(mocks.changeGuildMemberNickname).not.toHaveBeenCalled()
  })

  it('returns a failed result and logs when Discord rejects the nickname change', async () => {
    mocks.changeGuildMemberNickname.mockRejectedValue(new Error('Discord nickname change failed (403)'))

    await expect(
      syncDiscordGuildNickname({
        guildId: 'tenant-1',
        discordId: 'member-1',
        nickname: 'AlbionName',
        source: 'admin_approve',
      }),
    ).resolves.toEqual({
      status: 'failed',
      error: 'Discord nickname change failed (403)',
    })

    expect(mocks.warn).toHaveBeenCalledWith(
      '[discord-nickname-sync] failed',
      expect.objectContaining({
        source: 'admin_approve',
        tenant_id: 'tenant-1',
        discord_id: 'member-1',
      }),
    )
  })
})
