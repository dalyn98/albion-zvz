import type {
  AlbionIdentityTrustStatus,
} from '@/lib/account-albion-identity'
import type { AlbionServer } from '@/lib/albion-gameinfo'

export interface DuplicateClaimReviewMember {
  discordId: string
  server: AlbionServer | null
  playerId: string | null
  trustStatus: AlbionIdentityTrustStatus
  statusReason: string | null
}

export interface TenantDuplicateClaimLink {
  discordId: string
  username: string | null
  server: AlbionServer | null
  playerId: string | null
  trustStatus: AlbionIdentityTrustStatus
  revokedAt: string | null
}

export interface DuplicateClaimSource {
  discordId: string
  username: string | null
}

const TRUST_PRIORITY: Record<AlbionIdentityTrustStatus, number> = {
  trusted: 0,
  roster_matched: 1,
  claimed: 2,
  disputed: 3,
  revoked: 4,
}

function isDuplicateClaimReview(member: DuplicateClaimReviewMember): boolean {
  return (
    member.trustStatus === 'disputed' &&
    member.statusReason === 'duplicate_claim' &&
    member.server !== null &&
    member.playerId !== null
  )
}

function isActiveDuplicateSource(link: TenantDuplicateClaimLink): boolean {
  return link.revokedAt === null && link.trustStatus !== 'revoked' && link.trustStatus !== 'disputed'
}

export function buildTenantDuplicateAlbionClaimMap(input: {
  reviewMembers: readonly DuplicateClaimReviewMember[]
  tenantLinks: readonly TenantDuplicateClaimLink[]
}): Map<string, DuplicateClaimSource> {
  const result = new Map<string, DuplicateClaimSource>()
  const activeLinks = input.tenantLinks.filter(isActiveDuplicateSource)

  for (const member of input.reviewMembers) {
    if (!isDuplicateClaimReview(member)) continue

    const source = activeLinks
      .filter(
        (link) =>
          link.discordId !== member.discordId &&
          link.server === member.server &&
          link.playerId === member.playerId,
      )
      .sort((a, b) => TRUST_PRIORITY[a.trustStatus] - TRUST_PRIORITY[b.trustStatus])[0]

    if (!source) continue
    result.set(member.discordId, {
      discordId: source.discordId,
      username: source.username,
    })
  }

  return result
}
