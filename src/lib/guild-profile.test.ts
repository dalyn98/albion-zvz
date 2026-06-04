import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAppSetting: vi.fn(),
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

import { loadGuildProfileSettings } from './guild-profile'

describe('loadGuildProfileSettings', () => {
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
})
