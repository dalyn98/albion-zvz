import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

import { loadGuildProfileSettings } from './guild-profile'

describe('loadGuildProfileSettings', () => {
  beforeEach(() => {
    mocks.getAppSetting.mockReset()
    mocks.getTenantDiscordConfig.mockReset()
    mocks.getTenantDiscordConfig.mockResolvedValue({
      discordGuildId: 'discord-guild-1',
      botInstalled: true,
    })
  })

  it('normalizes safe Discord invite URLs for rendering', async () => {
    mocks.getAppSetting.mockImplementation(async (key: string, fallback: string) =>
      key === 'guild_profile_discord_invite_url'
        ? 'https://discord.com/invite/demo-guild?utm=copy'
        : fallback,
    )

    const settings = await loadGuildProfileSettings('guild-1')

    expect(settings.discordInviteUrl).toBe('https://discord.gg/demo-guild')
  })

  it('hides invalid stored Discord invite URLs instead of rendering them', async () => {
    mocks.getAppSetting.mockImplementation(async (key: string, fallback: string) =>
      key === 'guild_profile_discord_invite_url'
        ? 'https://discord.gg.evil.test/demo-guild'
        : fallback,
    )

    const settings = await loadGuildProfileSettings('guild-1')

    expect(settings.discordInviteUrl).toBe('')
  })

  it('keeps sensitive sections private when settings rows are missing', async () => {
    mocks.getAppSetting.mockImplementation(async (_key: string, fallback: string) => fallback)

    const settings = await loadGuildProfileSettings('guild-1')

    expect(settings.showAdminTeam).toBe(false)
    expect(settings.showLeaderboard).toBe(false)
    expect(settings.showRegearStats).toBe(false)
  })

  it('trusts an invite only when its verified guild marker matches the bot tenant', async () => {
    mocks.getAppSetting.mockImplementation(async (key: string, fallback: string) => {
      if (key === 'guild_profile_discord_invite_url') {
        return 'https://discord.gg/demo-guild'
      }
      if (key === 'guild_profile_discord_invite_guild_id') {
        return 'discord-guild-1'
      }
      return fallback
    })

    await expect(loadGuildProfileSettings('guild-1')).resolves.toMatchObject({
      discordInviteVerified: true,
    })

    mocks.getTenantDiscordConfig.mockResolvedValue({
      discordGuildId: 'different-guild',
      botInstalled: true,
    })
    await expect(loadGuildProfileSettings('guild-1')).resolves.toMatchObject({
      discordInviteVerified: false,
    })
  })
})
