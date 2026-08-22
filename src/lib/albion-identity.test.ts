import { describe, expect, it } from 'vitest'
import type { AlbionServer } from './albion-gameinfo'
import type { AccountAlbionIdentityView } from './account-albion-identity'
import {
  resolveAlbionEventAccessGate,
  resolveAlbionOnboardingGate,
  type MemberAlbionIdentity,
} from './albion-identity'

const DISCORD_ID = 'discord-1'

function legacyIdentity(overrides: Partial<MemberAlbionIdentity> = {}): MemberAlbionIdentity {
  return {
    discordId: DISCORD_ID,
    server: null,
    playerId: null,
    nickname: null,
    guildId: null,
    verifiedAt: null,
    ...overrides,
  }
}

function accountIdentity(
  overrides: Partial<AccountAlbionIdentityView> = {},
): AccountAlbionIdentityView {
  return {
    profileId: 'profile-1',
    server: 'west' as AlbionServer,
    playerId: 'player-1',
    nickname: 'AlbionPlayer',
    currentGuildId: 'home-guild',
    currentGuildName: 'Home Guild',
    currentAllianceId: null,
    currentAllianceName: null,
    relation: 'home_guild',
    trustStatus: 'trusted',
    statusReason: 'legacy_trusted',
    verifiedAt: '2026-05-01T00:00:00.000Z',
    trustedAt: '2026-05-02T00:00:00.000Z',
    lastSyncedAt: null,
    lastManualSyncAt: null,
    resourceAccessOverride: false,
    resourceAccessOverrideGrantedAt: null,
    ...overrides,
  }
}

describe('resolveAlbionOnboardingGate', () => {
  it('treats trusted account identity as complete even when legacy guild_avatars fields are empty', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity(),
    })

    expect(state.hasStartedOnboarding).toBe(true)
    expect(state.siteAccessVerified).toBe(true)
    expect(state.resourceTrusted).toBe(true)
    expect(state.identity).toMatchObject({
      discordId: DISCORD_ID,
      server: 'west',
      playerId: 'player-1',
      nickname: 'AlbionPlayer',
      guildId: 'home-guild',
      verifiedAt: '2026-05-02T00:00:00.000Z',
    })
  })

  it('does not reopen first-run onboarding for a review-pending account identity', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        trustStatus: 'roster_matched',
        statusReason: 'roster_match',
        trustedAt: null,
      }),
    })

    expect(state.hasStartedOnboarding).toBe(true)
    expect(state.siteAccessVerified).toBe(false)
    expect(state.resourceTrusted).toBe(false)
    expect(state.identity?.verifiedAt).toBeNull()
  })

  it('marks same-alliance identities as event-allowed without resource trust', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        relation: 'alliance',
        trustStatus: 'claimed',
        currentGuildId: 'ally-guild',
        currentGuildName: 'Ally Guild',
        currentAllianceId: 'home-alliance',
        currentAllianceName: 'Home Alliance',
        verifiedAt: null,
        trustedAt: null,
      }),
    })

    expect(state.hasStartedOnboarding).toBe(true)
    expect(state.siteAccessVerified).toBe(false)
    expect(state.resourceTrusted).toBe(false)
    expect(state.allianceEventAllowed).toBe(true)
  })

  it('treats a matching permanent exception as verified without rewriting external relation', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        relation: 'external',
        trustStatus: 'claimed',
        currentGuildId: 'external-guild',
        currentGuildName: 'External Guild',
        verifiedAt: null,
        trustedAt: null,
        resourceAccessOverride: true,
        resourceAccessOverrideGrantedAt: '2026-05-04T00:00:00.000Z',
      }),
    })

    expect(state.siteAccessVerified).toBe(true)
    expect(state.resourceTrusted).toBe(true)
    expect(state.identity).toMatchObject({
      guildId: 'external-guild',
      verifiedAt: '2026-05-04T00:00:00.000Z',
    })
  })

  it('keeps legacy verified members past the site gate even if the account link needs review', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity({
        server: 'west' as AlbionServer,
        playerId: 'player-1',
        nickname: 'AlbionPlayer',
        guildId: 'home-guild',
        verifiedAt: '2026-04-01T00:00:00.000Z',
      }),
      accountIdentity: accountIdentity({
        relation: 'unknown',
        trustStatus: 'claimed',
        statusReason: 'legacy_unverified',
        trustedAt: null,
      }),
    })

    expect(state.hasStartedOnboarding).toBe(true)
    expect(state.siteAccessVerified).toBe(true)
    expect(state.resourceTrusted).toBe(false)
  })

  it('prefers a trusted account identity over stale legacy fields', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity({
        server: 'east' as AlbionServer,
        playerId: 'legacy-player',
        nickname: 'OldPlayer',
        guildId: 'legacy-guild',
        verifiedAt: '2026-04-01T00:00:00.000Z',
      }),
      accountIdentity: accountIdentity({
        nickname: 'CurrentPlayer',
        trustedAt: '2026-05-03T00:00:00.000Z',
      }),
    })

    expect(state.siteAccessVerified).toBe(true)
    expect(state.resourceTrusted).toBe(true)
    expect(state.identity).toMatchObject({
      nickname: 'CurrentPlayer',
      verifiedAt: '2026-05-03T00:00:00.000Z',
    })
  })

  it('keeps admin-reset revoked account identities eligible for onboarding again', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        trustStatus: 'revoked',
        statusReason: 'admin_reset',
        verifiedAt: null,
        trustedAt: null,
      }),
    })

    expect(state.hasStartedOnboarding).toBe(false)
    expect(state.siteAccessVerified).toBe(false)
    expect(state.resourceTrusted).toBe(false)
    expect(state.identity).toBeNull()
  })

  it('falls back to legacy verified identity when account identity is unavailable', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity({
        server: 'east' as AlbionServer,
        playerId: 'legacy-player',
        nickname: 'LegacyPlayer',
        guildId: 'legacy-guild',
        verifiedAt: '2026-04-01T00:00:00.000Z',
      }),
      accountIdentity: null,
    })

    expect(state.hasStartedOnboarding).toBe(true)
    expect(state.siteAccessVerified).toBe(true)
    expect(state.resourceTrusted).toBe(true)
    expect(state.identity?.nickname).toBe('LegacyPlayer')
  })

  it('does not treat a player id cached by killboard sync as completed first-run onboarding', () => {
    const state = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity({
        playerId: 'cached-player-id',
      }),
      accountIdentity: null,
    })

    expect(state.hasStartedOnboarding).toBe(false)
    expect(state.siteAccessVerified).toBe(false)
    expect(state.resourceTrusted).toBe(false)
    expect(state.identity).toBeNull()
  })
})

describe('resolveAlbionEventAccessGate', () => {
  it('requires onboarding for a reset member on public event pages even when unverified access is allowed', () => {
    const onboardingGate = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        trustStatus: 'revoked',
        statusReason: 'admin_reset',
        verifiedAt: null,
        trustedAt: null,
      }),
    })

    expect(
      resolveAlbionEventAccessGate({
        onboardingGate,
        allowUnverifiedMemberAccess: true,
        isMember: true,
        isAdmin: false,
      }),
    ).toMatchObject({
      memberEventAccessAllowed: false,
      memberOnboardingRequired: true,
      memberEventVerificationRequired: false,
    })
  })

  it('requires verification for an unverified member when unverified site access is disabled', () => {
    const onboardingGate = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        trustStatus: 'roster_matched',
        statusReason: 'roster_match',
        trustedAt: null,
      }),
    })

    expect(
      resolveAlbionEventAccessGate({
        onboardingGate,
        allowUnverifiedMemberAccess: false,
        isMember: true,
        isAdmin: false,
      }),
    ).toMatchObject({
      memberEventAccessAllowed: false,
      memberEventVerificationRequired: true,
    })
  })

  it('lets verified alliance candidates proceed as alliance event participants', () => {
    const onboardingGate = resolveAlbionOnboardingGate({
      discordId: DISCORD_ID,
      legacyIdentity: legacyIdentity(),
      accountIdentity: accountIdentity({
        relation: 'alliance',
        trustStatus: 'claimed',
        currentGuildId: 'ally-guild',
        currentAllianceId: 'home-alliance',
        verifiedAt: null,
        trustedAt: null,
      }),
    })

    expect(
      resolveAlbionEventAccessGate({
        onboardingGate,
        allowUnverifiedMemberAccess: false,
        isMember: false,
        isAdmin: false,
      }),
    ).toMatchObject({
      memberEventAccessAllowed: true,
      memberEventVerificationRequired: false,
      allianceEventAllowed: true,
    })
  })
})
