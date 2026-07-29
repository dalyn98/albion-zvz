import { isDiscordId } from '@/lib/discord-id'
import { isLocalAccountSubject } from '@/lib/local-guild-account'
import {
  CAP,
  hasAnyCapability,
  parseCapabilities,
} from '@/lib/permissions'

export type MemberDirectoryState =
  | 'active'
  | 'withdrawn'
  | 'guest'
  | 'unlinked_roster'
  | 'identity_review'

export interface MemberDirectoryStateInput {
  hasGuildAvatar: boolean
  withdrawnAt?: string | null
  isGuest?: boolean
  hasActiveRosterEntry?: boolean
  identityTrustStatus?: string | null
}

export interface MemberDetailScopes {
  activity: boolean
  finance: boolean
  regear: boolean
  compliance: boolean
  memberOperations: boolean
  identityOperations: boolean
}

export const MEMBER_FINANCE_DETAIL_CAPS = [
  CAP.EXCHANGE_APPROVE,
  CAP.DONATION_APPROVE,
] as const

export const MEMBER_REGEAR_DETAIL_CAPS = [
  CAP.REGEAR_APPROVE,
  CAP.REGEAR_EDIT_PRICE,
  CAP.REGEAR_BULK_ACTION,
] as const

export const MEMBER_COMPLIANCE_DETAIL_CAPS = [
  CAP.CONTENT_COMPLIANCE_MANAGE,
] as const

export function resolveMemberDirectoryState(
  input: MemberDirectoryStateInput,
): MemberDirectoryState {
  if (input.hasGuildAvatar && input.withdrawnAt) return 'withdrawn'
  if (input.isGuest) return 'guest'
  if (
    input.hasGuildAvatar &&
    (input.identityTrustStatus === 'disputed' ||
      input.identityTrustStatus === 'revoked')
  ) {
    return 'identity_review'
  }
  if (input.hasGuildAvatar) return 'active'
  if (input.hasActiveRosterEntry) return 'unlinked_roster'
  return 'identity_review'
}

export function isActiveMemberDirectoryState(
  state: MemberDirectoryState,
): state is 'active' {
  return state === 'active'
}

export function resolveMemberDetailScopes(input: {
  viewerDiscordId: string
  targetDiscordId: string
  isMember: boolean
  isAdmin: boolean
  capabilities: string | null | undefined
}): MemberDetailScopes {
  const isSelf = input.viewerDiscordId === input.targetDiscordId
  const bits = input.isAdmin
    ? Object.values(CAP).reduce((all, bit) => all | bit, 0n)
    : parseCapabilities(input.capabilities)
  const canManageMembers =
    input.isAdmin || hasAnyCapability(bits, [CAP.MEMBERS_MANAGE])
  const finance =
    isSelf || input.isAdmin || hasAnyCapability(bits, MEMBER_FINANCE_DETAIL_CAPS)
  const regear =
    isSelf || input.isAdmin || hasAnyCapability(bits, MEMBER_REGEAR_DETAIL_CAPS)
  const compliance =
    isSelf ||
    input.isAdmin ||
    hasAnyCapability(bits, MEMBER_COMPLIANCE_DETAIL_CAPS)
  const activity =
    isSelf ||
    input.isMember ||
    input.isAdmin ||
    hasAnyCapability(bits, [
      CAP.MEMBERS_VIEW,
      CAP.MEMBERS_MANAGE,
      ...MEMBER_FINANCE_DETAIL_CAPS,
      ...MEMBER_REGEAR_DETAIL_CAPS,
      ...MEMBER_COMPLIANCE_DETAIL_CAPS,
    ])

  return {
    activity,
    finance,
    regear,
    compliance,
    memberOperations: isSelf || canManageMembers,
    identityOperations: isSelf || canManageMembers,
  }
}

export function isMemberSubject(value: unknown): value is string {
  const isLocalSubject =
    typeof value === 'string' &&
    isLocalAccountSubject(value) &&
    /^local:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    (isDiscordId(value) || isLocalSubject)
  )
}
