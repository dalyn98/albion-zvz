export const GUILD_HOME_OWNERSHIP_DISPUTE_STATUSES = [
  'submitted',
  'under_review',
  'resolved_existing',
  'resolved_reassigned',
  'rejected',
  'cancelled',
] as const

export type GuildHomeOwnershipDisputeStatus =
  (typeof GUILD_HOME_OWNERSHIP_DISPUTE_STATUSES)[number]

export const GUILD_HOME_OWNERSHIP_REVIEW_ACTIONS = [
  'start_review',
  'keep_existing',
  'reject',
  'reassign',
] as const

export type GuildHomeOwnershipReviewAction =
  (typeof GUILD_HOME_OWNERSHIP_REVIEW_ACTIONS)[number]

export function isGuildHomeOwnershipReviewAction(
  value: unknown,
): value is GuildHomeOwnershipReviewAction {
  return typeof value === 'string' && (
    GUILD_HOME_OWNERSHIP_REVIEW_ACTIONS as readonly string[]
  ).includes(value)
}

export function doesOwnershipDisputeHidePublicSurface(
  status: GuildHomeOwnershipDisputeStatus | null | undefined,
): boolean {
  return status === 'under_review'
}
