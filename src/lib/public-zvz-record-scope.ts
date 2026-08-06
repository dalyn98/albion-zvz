import type { PublicZvzEngagementScale } from '@/lib/public-zvz-ranking-v2'

interface PublicZvzScaleEvidence {
  scale: PublicZvzEngagementScale
  scaleRankingEligible: boolean
}

export function filterPublicZvzScaleRankingEvidence<
  T extends PublicZvzScaleEvidence,
>(
  evidence: readonly T[],
  scale: PublicZvzEngagementScale | null,
): T[] {
  if (!scale) return [...evidence]
  return evidence.filter((row) => (
    row.scale === scale && row.scaleRankingEligible
  ))
}
