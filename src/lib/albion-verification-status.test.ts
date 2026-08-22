import { describe, expect, it } from 'vitest'
import {
  classifyAlbionVerification,
  isRecognizedAlbionIdentity,
  normalizeAlbionIdentityRelation,
  normalizeAlbionIdentityTrustStatus,
} from './albion-verification-status'

describe('Albion verification status classification', () => {
  it('classifies trusted home-guild identities as guild verified', () => {
    expect(
      classifyAlbionVerification({
        server: 'west',
        relation: 'home_guild',
        trustStatus: 'trusted',
      }),
    ).toBe('guild_verified')
  })

  it('classifies same-alliance identities as alliance verified instead of unverified', () => {
    expect(
      classifyAlbionVerification({
        server: 'west',
        relation: 'alliance',
        trustStatus: 'claimed',
      }),
    ).toBe('alliance_verified')
  })

  it('keeps disputed alliance identities in review before granting alliance status', () => {
    expect(
      classifyAlbionVerification({
        server: 'west',
        relation: 'alliance',
        trustStatus: 'disputed',
      }),
    ).toBe('needs_review')
  })

  it('keeps home-guild roster matches reviewable until trusted', () => {
    expect(
      classifyAlbionVerification({
        server: 'west',
        relation: 'home_guild',
        trustStatus: 'roster_matched',
      }),
    ).toBe('needs_review')
  })

  it('separates onboarding-pending members before relation checks', () => {
    expect(
      classifyAlbionVerification({
        server: null,
        relation: 'alliance',
        trustStatus: 'claimed',
      }),
    ).toBe('onboarding_pending')
  })

  it('keeps external and revoked identities unverified', () => {
    expect(
      classifyAlbionVerification({
        server: 'west',
        relation: 'external',
        trustStatus: 'claimed',
      }),
    ).toBe('unverified')
    expect(
      classifyAlbionVerification({
        server: 'west',
        relation: 'alliance',
        trustStatus: 'revoked',
      }),
    ).toBe('unverified')
  })

  it('classifies an explicit permanent exception as guild verified', () => {
    expect(
      classifyAlbionVerification({
        server: 'east',
        relation: 'external',
        trustStatus: 'claimed',
        resourceAccessOverride: true,
      }),
    ).toBe('guild_verified')
    expect(
      classifyAlbionVerification({
        server: 'east',
        relation: 'external',
        trustStatus: 'revoked',
        resourceAccessOverride: true,
      }),
    ).toBe('unverified')
  })

  it('recognizes guild-verified and alliance-verified identities for member lists', () => {
    expect(isRecognizedAlbionIdentity({ relation: 'home_guild', trustStatus: 'trusted' })).toBe(true)
    expect(isRecognizedAlbionIdentity({ relation: 'alliance', trustStatus: 'claimed' })).toBe(true)
    expect(isRecognizedAlbionIdentity({ relation: 'external', trustStatus: 'trusted' })).toBe(false)
  })

  it('normalizes unknown relation and trust status values safely', () => {
    expect(normalizeAlbionIdentityRelation('bad-value')).toBe('unknown')
    expect(normalizeAlbionIdentityTrustStatus('bad-value')).toBe('claimed')
  })
})
