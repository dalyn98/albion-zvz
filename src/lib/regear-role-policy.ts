import type { SlotRole } from '@/types'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'

export const REGEAR_ROLE_GROUPS = [
  'dps',
  'healer',
  'tank',
  'support',
  'battle_mount',
  'other',
] as const

export type RegearRoleGroup = (typeof REGEAR_ROLE_GROUPS)[number]

export type RegearRolePolicyMatchStatus =
  | 'disabled'
  | 'matched'
  | 'no_match'
  | 'roles_unavailable'

export interface RegearRolePolicyRow {
  id?: string
  discordRoleId: string
  discordRoleName: string
  roleGroup: RegearRoleGroup
  silverCap: number
  payoutRatePercent: number | null
}

export interface RegearRolePolicyResolution {
  enabled: boolean
  roleGroup: RegearRoleGroup
  silverCap: number
  payoutRatePercent: number | null
  matchStatus: RegearRolePolicyMatchStatus
  matchedPolicy: RegearRolePolicyRow | null
  memberRoleIds: string[]
}

export function isRegearRolePolicyZeroReview(input: {
  enabled: boolean
  matchStatus: RegearRolePolicyMatchStatus
  silverCap: number | null | undefined
}): boolean {
  return input.enabled && (input.matchStatus !== 'matched' || (input.silverCap ?? 0) <= 0)
}

const roleGroupSet: ReadonlySet<string> = new Set(REGEAR_ROLE_GROUPS)

export function isRegearRoleGroup(value: unknown): value is RegearRoleGroup {
  return typeof value === 'string' && roleGroupSet.has(value)
}

export function roleGroupFromSlotRole(roleName: string | null | undefined): RegearRoleGroup {
  switch (roleName) {
    case 'Dps':
    case 'EngageDps':
    case 'BrawlerDps':
      return 'dps'
    case 'Healer':
      return 'healer'
    case 'OffTanker':
    case 'DefTanker':
      return 'tank'
    case 'Caller':
    case 'Sup':
      return 'support'
    case 'BM':
      return 'battle_mount'
    case '기타':
    default:
      return 'other'
  }
}

export const SITE_REGEAR_ROLE_OPTIONS: readonly {
  roleName: SlotRole
  roleGroup: RegearRoleGroup
}[] = [
  { roleName: 'Caller', roleGroup: 'support' },
  { roleName: 'OffTanker', roleGroup: 'tank' },
  { roleName: 'DefTanker', roleGroup: 'tank' },
  { roleName: 'Sup', roleGroup: 'support' },
  { roleName: 'Healer', roleGroup: 'healer' },
  { roleName: 'EngageDps', roleGroup: 'dps' },
  { roleName: 'BrawlerDps', roleGroup: 'dps' },
  { roleName: 'BM', roleGroup: 'battle_mount' },
  { roleName: '기타', roleGroup: 'other' },
]

export function resolveRegearRolePolicy(input: {
  enabled: boolean
  roleGroup: RegearRoleGroup
  fallbackSilverCap: number
  memberRoleIds: readonly string[] | null
  rolesUnavailable?: boolean
  policies: readonly RegearRolePolicyRow[]
}): RegearRolePolicyResolution {
  const fallbackSilverCap =
    Number.isInteger(input.fallbackSilverCap) && input.fallbackSilverCap > 0
      ? input.fallbackSilverCap
      : 0
  const memberRoleIds = Array.from(
    new Set((input.memberRoleIds ?? []).filter((id) => typeof id === 'string' && id.length > 0)),
  )

  if (!input.enabled) {
    return {
      enabled: false,
      roleGroup: input.roleGroup,
      silverCap: fallbackSilverCap,
      payoutRatePercent: null,
      matchStatus: 'disabled',
      matchedPolicy: null,
      memberRoleIds,
    }
  }

  const memberRoleSet = new Set(memberRoleIds)
  const matches = input.policies
    .filter(
      (policy) =>
        policy.roleGroup === input.roleGroup &&
        memberRoleSet.has(policy.discordRoleId) &&
        Number.isInteger(policy.silverCap) &&
        policy.silverCap >= 0,
    )
    .sort((a, b) => {
      if (b.silverCap !== a.silverCap) return b.silverCap - a.silverCap
      return a.discordRoleName.localeCompare(b.discordRoleName)
    })

  const matchedPolicy = matches[0] ?? null
  if (matchedPolicy) {
    const matchedPayoutRatePercent = matchedPolicy.payoutRatePercent
    return {
      enabled: true,
      roleGroup: input.roleGroup,
      silverCap: matchedPolicy.silverCap,
      payoutRatePercent: isValidRoleRegearPayoutRate(matchedPayoutRatePercent)
        ? matchedPayoutRatePercent
        : null,
      matchStatus: 'matched',
      matchedPolicy,
      memberRoleIds,
    }
  }

  return {
    enabled: true,
    roleGroup: input.roleGroup,
    silverCap: 0,
    payoutRatePercent: null,
    matchStatus: input.rolesUnavailable ? 'roles_unavailable' : 'no_match',
    matchedPolicy: null,
    memberRoleIds,
  }
}
