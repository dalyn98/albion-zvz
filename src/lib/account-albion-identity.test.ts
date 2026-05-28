import { describe, expect, it } from 'vitest'
import {
  canUseAllianceEventFeatures,
  canUseManualRegearFeature,
  canUseGuildResourceFeatures,
  resolveAlbionIdentityRelation,
  resolveInitialTenantTrust,
} from './account-albion-identity'

describe('account Albion identity trust model', () => {
  it('trusts a home-guild roster match when the Discord account has a trusted member role', () => {
    const relation = resolveAlbionIdentityRelation({
      homeGuildId: 'home-guild',
      homeAllianceId: 'home-alliance',
      playerGuildId: 'home-guild',
      playerAllianceId: 'home-alliance',
      hasPlayerId: true,
    })

    const trust = resolveInitialTenantTrust({
      relation,
      hasPlayerId: true,
      hasDuplicateClaim: false,
      legacyTrusted: false,
      hasTrustedDiscordMemberRole: true,
    })

    expect(relation).toBe('home_guild')
    expect(trust).toBe('trusted')
    expect(canUseGuildResourceFeatures({ relation, trustStatus: trust })).toBe(true)
  })

  it('keeps a home-guild roster match reviewable when the Discord member role is missing', () => {
    const trust = resolveInitialTenantTrust({
      relation: 'home_guild',
      hasPlayerId: true,
      hasDuplicateClaim: false,
      legacyTrusted: false,
      hasTrustedDiscordMemberRole: false,
    })

    expect(trust).toBe('roster_matched')
    expect(canUseGuildResourceFeatures({ relation: 'home_guild', trustStatus: trust })).toBe(false)
  })

  it('keeps legacy verified home-guild members trusted so existing data is not locked', () => {
    const trust = resolveInitialTenantTrust({
      relation: 'home_guild',
      hasPlayerId: true,
      hasDuplicateClaim: false,
      legacyTrusted: true,
      hasTrustedDiscordMemberRole: false,
    })

    expect(trust).toBe('trusted')
    expect(canUseGuildResourceFeatures({ relation: 'home_guild', trustStatus: trust })).toBe(true)
  })

  it('keeps admin-approved home-guild members trusted across later refreshes', () => {
    const trust = resolveInitialTenantTrust({
      relation: 'home_guild',
      hasPlayerId: true,
      hasDuplicateClaim: false,
      legacyTrusted: false,
      adminApprovedTrusted: true,
      hasTrustedDiscordMemberRole: false,
    })

    expect(trust).toBe('trusted')
    expect(canUseGuildResourceFeatures({ relation: 'home_guild', trustStatus: trust })).toBe(true)
  })

  it('never allows alliance guests to use guild resource features without home-guild relation', () => {
    const relation = resolveAlbionIdentityRelation({
      homeGuildId: 'home-guild',
      homeAllianceId: 'home-alliance',
      playerGuildId: 'ally-guild',
      playerAllianceId: 'home-alliance',
      hasPlayerId: true,
    })
    const trust = resolveInitialTenantTrust({
      relation,
      hasPlayerId: true,
      hasDuplicateClaim: false,
      legacyTrusted: false,
      hasTrustedDiscordMemberRole: true,
    })

    expect(relation).toBe('alliance')
    expect(trust).toBe('claimed')
    expect(canUseGuildResourceFeatures({ relation, trustStatus: trust })).toBe(false)
    expect(canUseAllianceEventFeatures({ relation, trustStatus: trust })).toBe(true)
    expect(
      canUseManualRegearFeature({
        relation,
        trustStatus: trust,
        allianceRegearEnabled: true,
      }),
    ).toBe(true)
    expect(
      canUseManualRegearFeature({
        relation,
        trustStatus: trust,
        allianceRegearEnabled: false,
      }),
    ).toBe(false)
  })

  it('flags duplicate character claims as disputed before resource access', () => {
    const trust = resolveInitialTenantTrust({
      relation: 'home_guild',
      hasPlayerId: true,
      hasDuplicateClaim: true,
      legacyTrusted: false,
      hasTrustedDiscordMemberRole: true,
    })

    expect(trust).toBe('disputed')
    expect(canUseGuildResourceFeatures({ relation: 'home_guild', trustStatus: trust })).toBe(false)
    expect(canUseAllianceEventFeatures({ relation: 'alliance', trustStatus: trust })).toBe(false)
    expect(
      canUseManualRegearFeature({
        relation: 'alliance',
        trustStatus: trust,
        allianceRegearEnabled: true,
      }),
    ).toBe(false)
  })

  it('allows trusted home-guild members to use manual regear regardless of the alliance switch', () => {
    expect(
      canUseManualRegearFeature({
        relation: 'home_guild',
        trustStatus: 'trusted',
        allianceRegearEnabled: false,
      }),
    ).toBe(true)
  })

  it('does not allow external identities to use manual regear through the alliance switch', () => {
    expect(
      canUseManualRegearFeature({
        relation: 'external',
        trustStatus: 'claimed',
        allianceRegearEnabled: true,
      }),
    ).toBe(false)
  })

  it('keeps manual nickname entries as claimed only', () => {
    const relation = resolveAlbionIdentityRelation({
      homeGuildId: 'home-guild',
      homeAllianceId: null,
      playerGuildId: null,
      playerAllianceId: null,
      hasPlayerId: false,
    })

    expect(relation).toBe('unknown')
    expect(
      resolveInitialTenantTrust({
        relation,
        hasPlayerId: false,
        hasDuplicateClaim: false,
        legacyTrusted: false,
        hasTrustedDiscordMemberRole: true,
      }),
    ).toBe('claimed')
  })
})
