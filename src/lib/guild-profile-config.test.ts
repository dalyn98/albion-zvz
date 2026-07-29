import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GUILD_PROFILE,
  publicGuildProfileExposureCacheKey,
  resolvePublicDiscordJoinUrl,
  resolvePublicGuildProfileExposure,
} from './guild-profile-config'

describe('public guild profile exposure policy', () => {
  it('keeps identifying and internal-economy sections private by default', () => {
    const exposure = resolvePublicGuildProfileExposure(
      DEFAULT_GUILD_PROFILE,
      true,
    )

    expect(exposure.members).toBe(true)
    expect(exposure.recentBattle).toBe(true)
    expect(exposure.adminTeam).toBe(false)
    expect(exposure.topContributors).toBe(false)
    expect(exposure.leaderboard).toBe(false)
    expect(exposure.regearStats).toBe(false)
  })

  it('requires both the parent section and sensitive child opt-in', () => {
    const exposure = resolvePublicGuildProfileExposure(
      {
        ...DEFAULT_GUILD_PROFILE,
        showLeaderboard: true,
        showRegearStats: true,
        showActivity: false,
        showStats: false,
      },
      true,
    )

    expect(exposure.topContributors).toBe(false)
    expect(exposure.leaderboard).toBe(false)
    expect(exposure.regearStats).toBe(false)
    expect(exposure.weeklyStats).toBe(false)
  })

  it('changes the shared cache key when a private section is exposed', () => {
    const privateExposure = resolvePublicGuildProfileExposure(
      DEFAULT_GUILD_PROFILE,
      false,
    )
    const publicAdminExposure = resolvePublicGuildProfileExposure(
      { ...DEFAULT_GUILD_PROFILE, showAdminTeam: true },
      false,
    )

    expect(publicGuildProfileExposureCacheKey(privateExposure)).not.toBe(
      publicGuildProfileExposureCacheKey(publicAdminExposure),
    )
  })
})

describe('public Discord join CTA policy', () => {
  const readySettings = {
    ...DEFAULT_GUILD_PROFILE,
    enabled: true,
    recruitmentStatus: 'open' as const,
    discordInviteUrl: 'https://discord.gg/example',
    discordInviteVerified: true,
  }

  it('shows only a verified invite while recruitment is open', () => {
    expect(resolvePublicDiscordJoinUrl(readySettings)).toBe(
      'https://discord.gg/example',
    )
  })

  it('keeps recruitment independent from profile publication', () => {
    expect(
      resolvePublicDiscordJoinUrl({ ...readySettings, enabled: false }),
    ).toBe('')
    expect(
      resolvePublicDiscordJoinUrl({
        ...readySettings,
        recruitmentStatus: 'closed',
      }),
    ).toBe('')
    expect(
      resolvePublicDiscordJoinUrl({
        ...readySettings,
        discordInviteVerified: false,
      }),
    ).toBe('')
  })
})
