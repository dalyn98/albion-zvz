export const MAX_MEMBER_EXCHANGE_RESTRICTION_DAYS = 90
export const MAX_MEMBER_EXCHANGE_RESTRICTION_REASON_LENGTH = 500

const MAX_DISCORD_ID_LENGTH = 128
const DAY_MS = 24 * 60 * 60 * 1000

export interface MemberExchangeRestrictionInput {
  discordId: string
  blockedUntil: string
  reason: string
}

export type MemberExchangeRestrictionValidationResult =
  | {
      ok: true
      value: {
        discordId: string
        blockedUntil: string
        reason: string
      }
    }
  | {
      ok: false
      code: 'invalidMember' | 'invalidExpiry' | 'expiryTooLong' | 'reasonRequired' | 'reasonTooLong'
    }

export function normalizeMemberExchangeRestriction(
  input: MemberExchangeRestrictionInput,
  now: Date,
): MemberExchangeRestrictionValidationResult {
  const discordId = input.discordId.trim()
  if (
    !discordId ||
    discordId.length > MAX_DISCORD_ID_LENGTH ||
    discordId.startsWith('local:')
  ) {
    return { ok: false, code: 'invalidMember' }
  }

  const blockedUntilMs = Date.parse(input.blockedUntil)
  if (!Number.isFinite(blockedUntilMs) || blockedUntilMs <= now.getTime()) {
    return { ok: false, code: 'invalidExpiry' }
  }
  if (blockedUntilMs > now.getTime() + MAX_MEMBER_EXCHANGE_RESTRICTION_DAYS * DAY_MS) {
    return { ok: false, code: 'expiryTooLong' }
  }

  const reason = input.reason.trim()
  if (!reason) return { ok: false, code: 'reasonRequired' }
  if (reason.length > MAX_MEMBER_EXCHANGE_RESTRICTION_REASON_LENGTH) {
    return { ok: false, code: 'reasonTooLong' }
  }

  return {
    ok: true,
    value: {
      discordId,
      blockedUntil: new Date(blockedUntilMs).toISOString(),
      reason,
    },
  }
}

export function isValidExchangeRestrictionMemberId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_DISCORD_ID_LENGTH &&
    value === value.trim() &&
    !value.startsWith('local:')
  )
}
