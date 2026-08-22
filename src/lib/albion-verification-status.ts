import {
  canUseAllianceEventFeatures,
  canUseGuildResourceFeatures,
  type AlbionIdentityRelation,
  type AlbionIdentityTrustStatus,
  type ResourceGateInput,
} from '@/lib/account-albion-identity'

export type AlbionVerificationCategory =
  | 'onboarding_pending'
  | 'guild_verified'
  | 'alliance_verified'
  | 'needs_review'
  | 'unverified'

export function normalizeAlbionIdentityRelation(value: unknown): AlbionIdentityRelation {
  if (
    value === 'home_guild' ||
    value === 'alliance' ||
    value === 'external' ||
    value === 'unknown'
  ) {
    return value
  }
  return 'unknown'
}

export function normalizeAlbionIdentityTrustStatus(
  value: unknown,
): AlbionIdentityTrustStatus {
  if (
    value === 'claimed' ||
    value === 'roster_matched' ||
    value === 'trusted' ||
    value === 'disputed' ||
    value === 'revoked'
  ) {
    return value
  }
  return 'claimed'
}

export function isRecognizedAlbionIdentity(input: ResourceGateInput): boolean {
  return canUseGuildResourceFeatures(input) || canUseAllianceEventFeatures(input)
}

export function classifyAlbionVerification(input: {
  server: string | null | undefined
  relation: AlbionIdentityRelation
  trustStatus: AlbionIdentityTrustStatus
  resourceAccessOverride?: boolean
}): AlbionVerificationCategory {
  if (!input.server) return 'onboarding_pending'
  if (input.trustStatus === 'revoked') return 'unverified'
  if (input.resourceAccessOverride) return 'guild_verified'
  if (input.trustStatus === 'disputed') return 'needs_review'
  if (canUseGuildResourceFeatures(input)) return 'guild_verified'
  if (canUseAllianceEventFeatures(input)) return 'alliance_verified'
  if (input.trustStatus === 'roster_matched') return 'needs_review'
  return 'unverified'
}
