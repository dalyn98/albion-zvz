import {
  EVENT_REGEAR_AUTO_POLICIES,
  EVENT_REGEAR_POLICIES,
  EVENT_REGEAR_VIDEO_POLICIES,
  type EventCategory,
  type EventRegearAutoPolicy,
  type EventRegearPolicy,
  type EventRegearVideoPolicy,
} from '@/types'
import {
  REGEAR_ROLE_PAYOUT_RATE_MAX,
  REGEAR_ROLE_PAYOUT_RATE_MIN,
  isValidRoleRegearPayoutRate,
} from '@/lib/regear-payout'
import type { RegearDiscordRoleRateFloorSnapshot } from '@/lib/regear-role-rate-floor'
import {
  roleGroupFromSlotRole,
  type RegearRolePolicyRow,
  type RegearRoleGroup,
  type RegearRolePolicyMatchStatus,
  type RegearRolePolicyResolution,
} from '@/lib/regear-role-policy'
export type { EventRegearAutoPolicy, EventRegearPolicy, EventRegearVideoPolicy } from '@/types'

export const DEFAULT_EVENT_REGEAR_POLICY: EventRegearPolicy = 'role'
export const DEFAULT_EVENT_REGEAR_VIDEO_POLICY: EventRegearVideoPolicy = 'inherit'
export const DEFAULT_EVENT_REGEAR_AUTO_POLICY: EventRegearAutoPolicy = 'inherit'
export const EVENT_REGEAR_SILVER_CAP_MIN = 1
export const EVENT_REGEAR_SILVER_CAP_MAX = 2_000_000_000
export const EVENT_REGEAR_MAX_DEATHS_MIN = 1
export const EVENT_REGEAR_MAX_DEATHS_MAX = 10
export const EVENT_REGEAR_VIDEO_BONUS_MIN = 0
export const EVENT_REGEAR_VIDEO_BONUS_MAX = 2_147_483_647
export const EVENT_REGEAR_PAYOUT_RATE_MIN = 1
export const EVENT_REGEAR_PAYOUT_RATE_MAX = 100
export const EVENT_REGEAR_ROLE_PAYOUT_RATE_MIN = REGEAR_ROLE_PAYOUT_RATE_MIN
export const EVENT_REGEAR_ROLE_PAYOUT_RATE_MAX = REGEAR_ROLE_PAYOUT_RATE_MAX

export type ManualRegearPolicySource = EventRegearPolicy
export type EventRegearCapSource =
  | 'event'
  | 'event_role_override'
  | 'discord_role_policy'
  | 'role_reward'
export type EventRegearRateSource =
  | 'event_role_override'
  | 'regear_window'
  | 'discord_role_rate_floor'
  | 'discord_role_policy'
  | 'role_reward'
  | 'guild_default'
  | 'fallback'
export type EventRegearVideoSource = 'event' | 'guild_default' | 'disabled'
export type RegearPolicyScope = 'event' | 'free_window'
export type RegearPolicyFlow = 'manual' | 'auto'
export type RegearPolicyDisabledReason =
  | 'event'
  | 'auto'
  | 'role'
  | 'slot_excluded'
  | 'invalid_event'
  | null

export interface EventRegearRoleOverrideInput {
  enabled: boolean
  silverCap: number | null
  payoutRatePercent: number | null
}

export interface ResolveEventRegearPolicyInput {
  category: EventCategory
  eventPolicy: unknown
  eventSilverCap: unknown
  eventMaxDeathsPerMember: unknown
  eventVideoPolicy: unknown
  eventVideoPayoutRatePercent: unknown
  eventVideoClaimCeilingBonusSilver: unknown
  eventVideoRateAppliesWithoutProof: unknown
  eventAutoPolicy?: unknown
  roleSilver: number
  rolePayoutRatePercent?: number | null
  discordRolePolicy?: RegearRolePolicyResolution | null
  /** @deprecated Pass discordRolePolicy so cap and rate use the same resolution. */
  discordRolePayoutRatePercent?: number | null
  /** @deprecated Pass discordRolePolicy when the caller has a full resolution. */
  discordRolePolicyEnabled?: boolean
  discordRoleRateFloor?: RegearDiscordRoleRateFloorSnapshot | null
  useMaximumVideoPayoutRate?: boolean
  roleOverride?: EventRegearRoleOverrideInput | null
  guildBasePayoutRatePercent: number
  guildVideoPayoutRatePercent: number
  guildVideoClaimCeilingBonusSilver: number
  globalMaxDeaths: number
  hasVideoProof: boolean
  flow?: RegearPolicyFlow
  excluded?: boolean
  policyContext?: {
    policyVersionId: string
    scope: RegearPolicyScope
    capturedAt: string
    discordId: string
    username: string
    roleName: string
  } | null
}

export interface ResolvedEventRegearPolicy {
  enabled: boolean
  disabledReason: RegearPolicyDisabledReason
  source: ManualRegearPolicySource
  capSource: EventRegearCapSource | null
  rateSource: EventRegearRateSource
  videoSource: EventRegearVideoSource
  baseSilverCap: number
  silverCap: number
  maxDeathsPerMember: number
  basePayoutRatePercent: number
  payoutRatePercent: number
  videoEnabled: boolean
  videoPayoutRatePercent: number
  videoClaimCeilingBonusSilver: number
  videoRateAppliesWithoutProof: boolean
  autoPolicy: EventRegearAutoPolicy
  snapshot: RegearPolicySnapshot
}

export interface RegearDiscordRolePolicySnapshot {
  enabled: boolean
  roleGroup: RegearRoleGroup
  silverCap: number
  payoutRatePercent: number | null
  matchStatus: RegearRolePolicyMatchStatus
  matchedDiscordRoleId: string | null
  matchedDiscordRoleName: string | null
  memberRoleIds: string[]
}

export interface RegearPolicySnapshot {
  version: 2 | 3
  enabled?: boolean
  disabledReason?: RegearPolicyDisabledReason
  flow?: RegearPolicyFlow
  policyVersionId?: string | null
  scope?: RegearPolicyScope
  capturedAt?: string | null
  participant?: {
    discordId: string
    username: string
    roleName: string
  } | null
  eventPolicy: EventRegearPolicy
  autoPolicy: EventRegearAutoPolicy
  roleCapSilver: number
  baseCapSilver: number
  maxDeathsPerMember: number
  basePayoutRatePercent: number
  payoutRatePercent: number
  videoPolicy: EventRegearVideoPolicy
  videoEnabled: boolean
  videoPayoutRatePercent: number
  videoClaimCeilingBonusSilver: number
  videoRateAppliesWithoutProof: boolean
  discordRolePolicy?: RegearDiscordRolePolicySnapshot | null
  discordRoleRateFloor?: RegearDiscordRoleRateFloorSnapshot | null
  sources: {
    cap: EventRegearCapSource | null
    payoutRate: EventRegearRateSource
    video: EventRegearVideoSource
  }
}

export interface ResolveManualRegearPolicyInput {
  category: EventCategory
  eventPolicy: unknown
  eventSilverCap: unknown
  eventMaxDeathsPerMember: unknown
  roleSilver: number
  globalMaxDeaths: number
}

export interface ResolvedManualRegearPolicy {
  enabled: boolean
  source: ManualRegearPolicySource
  silverCap: number
  maxDeathsPerMember: number
}

export function isEventRegearPolicy(value: unknown): value is EventRegearPolicy {
  return typeof value === 'string' && EVENT_REGEAR_POLICIES.includes(value as EventRegearPolicy)
}

export function isEventRegearVideoPolicy(value: unknown): value is EventRegearVideoPolicy {
  return (
    typeof value === 'string' &&
    EVENT_REGEAR_VIDEO_POLICIES.includes(value as EventRegearVideoPolicy)
  )
}

export function isEventRegearAutoPolicy(value: unknown): value is EventRegearAutoPolicy {
  return (
    typeof value === 'string' &&
    EVENT_REGEAR_AUTO_POLICIES.includes(value as EventRegearAutoPolicy)
  )
}

export function canUseEventRegearPolicy(category: EventCategory): boolean {
  return category === '전투' || category === 'FF' || category === '갱킹'
}

function toSafeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null
  }
  return value
}

export function isValidEventRegearSilverCap(value: unknown): value is number {
  const n = toSafeInteger(value)
  return n !== null && n >= EVENT_REGEAR_SILVER_CAP_MIN && n <= EVENT_REGEAR_SILVER_CAP_MAX
}

export function isValidEventRegearMaxDeaths(value: unknown): value is number {
  const n = toSafeInteger(value)
  return n !== null && n >= EVENT_REGEAR_MAX_DEATHS_MIN && n <= EVENT_REGEAR_MAX_DEATHS_MAX
}

export function isValidEventRegearPayoutRate(value: unknown): value is number {
  const n = toSafeInteger(value)
  return n !== null && n >= EVENT_REGEAR_PAYOUT_RATE_MIN && n <= EVENT_REGEAR_PAYOUT_RATE_MAX
}

export function isValidEventRegearRolePayoutRate(value: unknown): value is number {
  return isValidRoleRegearPayoutRate(value)
}

export function isValidEventRegearVideoBonus(value: unknown): value is number {
  const n = toSafeInteger(value)
  return n !== null && n >= EVENT_REGEAR_VIDEO_BONUS_MIN && n <= EVENT_REGEAR_VIDEO_BONUS_MAX
}

function normalizePositiveInteger(value: number): number {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : 0
}

export function resolveManualRegearPolicy(
  input: ResolveManualRegearPolicyInput,
): ResolvedManualRegearPolicy {
  const globalMaxDeaths = normalizePositiveInteger(input.globalMaxDeaths) || 1
  const roleSilver = normalizePositiveInteger(input.roleSilver)

  if (!canUseEventRegearPolicy(input.category)) {
    return {
      enabled: roleSilver > 0,
      source: 'role',
      silverCap: roleSilver,
      maxDeathsPerMember: globalMaxDeaths,
    }
  }

  const policy = isEventRegearPolicy(input.eventPolicy)
    ? input.eventPolicy
    : DEFAULT_EVENT_REGEAR_POLICY

  if (policy === 'disabled') {
    return {
      enabled: false,
      source: 'disabled',
      silverCap: 0,
      maxDeathsPerMember: globalMaxDeaths,
    }
  }

  if (policy === 'event') {
    const silverCap = isValidEventRegearSilverCap(input.eventSilverCap)
      ? input.eventSilverCap
      : 0
    const maxDeathsPerMember = isValidEventRegearMaxDeaths(input.eventMaxDeathsPerMember)
      ? input.eventMaxDeathsPerMember
      : globalMaxDeaths

    return {
      enabled: silverCap > 0 && isValidEventRegearMaxDeaths(input.eventMaxDeathsPerMember),
      source: 'event',
      silverCap,
      maxDeathsPerMember,
    }
  }

  return {
    enabled: roleSilver > 0,
    source: 'role',
    silverCap: roleSilver,
    maxDeathsPerMember: globalMaxDeaths,
  }
}

function normalizeRate(value: unknown, fallback: number): number {
  return isValidEventRegearPayoutRate(value) ? value : fallback
}

function normalizeVideoBonus(value: unknown, fallback: number): number {
  return isValidEventRegearVideoBonus(value) ? value : fallback
}

function normalizeBoolean(value: unknown): boolean {
  return value === true
}

export function resolveEventRegearPolicy(
  input: ResolveEventRegearPolicyInput,
): ResolvedEventRegearPolicy {
  const globalMaxDeaths = normalizePositiveInteger(input.globalMaxDeaths) || 1
  const eventPolicy = isEventRegearPolicy(input.eventPolicy)
    ? input.eventPolicy
    : DEFAULT_EVENT_REGEAR_POLICY
  const autoPolicy = isEventRegearAutoPolicy(input.eventAutoPolicy)
    ? input.eventAutoPolicy
    : DEFAULT_EVENT_REGEAR_AUTO_POLICY
  const roleSilver = normalizePositiveInteger(input.roleSilver)
  const override = input.roleOverride ?? null
  const roleOverrideBlocked = override?.enabled === false
  const discordRolePolicy = input.discordRolePolicy ?? null
  const discordRolePolicyEnabled =
    discordRolePolicy?.enabled ?? input.discordRolePolicyEnabled
  const discordRolePayoutRatePercent =
    discordRolePolicy?.payoutRatePercent ?? input.discordRolePayoutRatePercent
  const baseRateFromRole =
    override && isValidEventRegearRolePayoutRate(override.payoutRatePercent)
      ? {
          rate: override.payoutRatePercent,
          source: 'event_role_override' as const,
        }
      : isValidEventRegearRolePayoutRate(discordRolePayoutRatePercent)
        ? {
            rate: discordRolePayoutRatePercent,
            source: 'discord_role_policy' as const,
          }
        : isValidEventRegearRolePayoutRate(input.rolePayoutRatePercent)
          ? {
              rate: input.rolePayoutRatePercent,
              source: 'role_reward' as const,
            }
          : isValidEventRegearPayoutRate(input.guildBasePayoutRatePercent)
            ? {
                rate: input.guildBasePayoutRatePercent,
                source: 'guild_default' as const,
              }
            : {
                rate: 100,
                source: 'fallback' as const,
              }
  const discordRoleRateFloor =
    input.discordRoleRateFloor &&
    isValidEventRegearRolePayoutRate(input.discordRoleRateFloor.minimumPayoutRatePercent)
      ? input.discordRoleRateFloor
      : null
  const basePayoutRatePercent = Math.max(
    baseRateFromRole.rate,
    discordRoleRateFloor?.minimumPayoutRatePercent ?? 0,
  )
  const rateSource: EventRegearRateSource =
    discordRoleRateFloor &&
    discordRoleRateFloor.minimumPayoutRatePercent > baseRateFromRole.rate
      ? 'discord_role_rate_floor'
      : baseRateFromRole.source

  const eventCommonCap = isValidEventRegearSilverCap(input.eventSilverCap)
    ? input.eventSilverCap
    : 0
  const eventCommonDeaths = isValidEventRegearMaxDeaths(input.eventMaxDeathsPerMember)
    ? input.eventMaxDeathsPerMember
    : globalMaxDeaths

  let enabled = true
  let disabledReason: ResolvedEventRegearPolicy['disabledReason'] = null
  let capSource: EventRegearCapSource | null = null
  let baseSilverCap = 0
  let maxDeathsPerMember = globalMaxDeaths

  if (input.excluded) {
    enabled = false
    disabledReason = 'slot_excluded'
  } else if (eventPolicy === 'disabled') {
    enabled = false
    disabledReason = 'event'
  } else if (input.flow === 'auto' && autoPolicy === 'disabled') {
    enabled = false
    disabledReason = 'auto'
  } else if (roleOverrideBlocked) {
    enabled = false
    disabledReason = 'role'
  } else if (eventPolicy === 'event') {
    baseSilverCap = eventCommonCap
    maxDeathsPerMember = eventCommonDeaths
    capSource = 'event'
    if (baseSilverCap <= 0 || !isValidEventRegearMaxDeaths(input.eventMaxDeathsPerMember)) {
      enabled = false
      disabledReason = 'invalid_event'
    }
  } else {
    const overrideCap =
      override && isValidEventRegearSilverCap(override.silverCap) ? override.silverCap : null
    if (overrideCap !== null) {
      baseSilverCap = overrideCap
      capSource = 'event_role_override'
    } else if (discordRolePolicy?.enabled) {
      baseSilverCap =
        Number.isInteger(discordRolePolicy.silverCap) && discordRolePolicy.silverCap >= 0
          ? discordRolePolicy.silverCap
          : 0
      capSource = 'discord_role_policy'
    } else {
      baseSilverCap = roleSilver
      capSource = 'role_reward'
    }
    maxDeathsPerMember = isValidEventRegearMaxDeaths(input.eventMaxDeathsPerMember)
      ? input.eventMaxDeathsPerMember
      : globalMaxDeaths
    if (baseSilverCap <= 0) {
      // Discord-role policies intentionally keep unmatched/zero-cap manual
      // submissions as a zero-silver review item. Automatic regear must never
      // create those review-only rows.
      if (!(discordRolePolicy?.enabled && input.flow !== 'auto')) {
        enabled = false
        disabledReason = 'role'
      }
    }
  }

  const videoPolicy = isEventRegearVideoPolicy(input.eventVideoPolicy)
    ? input.eventVideoPolicy
    : DEFAULT_EVENT_REGEAR_VIDEO_POLICY
  const videoSource: EventRegearVideoSource =
    videoPolicy === 'custom'
      ? 'event'
      : videoPolicy === 'disabled'
        ? 'disabled'
        : 'guild_default'
  const videoEnabled = videoPolicy !== 'disabled'
  const videoRateAppliesWithoutProof =
    videoEnabled && normalizeBoolean(input.eventVideoRateAppliesWithoutProof)
  const configuredVideoPayoutRatePercent =
    videoPolicy === 'custom'
      ? normalizeRate(input.eventVideoPayoutRatePercent, baseRateFromRole.rate)
      : videoPolicy === 'disabled'
        ? baseRateFromRole.rate
        : normalizeRate(input.guildVideoPayoutRatePercent, baseRateFromRole.rate)
  const hasRoleSpecificRate =
    baseRateFromRole.source === 'event_role_override' ||
    baseRateFromRole.source === 'discord_role_policy' ||
    baseRateFromRole.source === 'role_reward'
  const useMaximumInheritedVideoPayoutRate =
    input.useMaximumVideoPayoutRate ||
    (discordRolePolicyEnabled === false &&
      baseRateFromRole.source === 'role_reward')
  const videoPayoutRatePercent =
    videoPolicy === 'inherit' &&
    hasRoleSpecificRate &&
    !useMaximumInheritedVideoPayoutRate &&
    !discordRoleRateFloor
      ? basePayoutRatePercent
      : Math.max(basePayoutRatePercent, configuredVideoPayoutRatePercent)
  const videoClaimCeilingBonusSilver =
    videoPolicy === 'custom'
      ? normalizeVideoBonus(input.eventVideoClaimCeilingBonusSilver, 0)
      : videoPolicy === 'disabled'
        ? 0
        : normalizeVideoBonus(input.guildVideoClaimCeilingBonusSilver, 0)

  const hasEffectiveVideoProof = input.hasVideoProof && videoEnabled
  const hasEffectiveVideoRate = videoEnabled && (input.hasVideoProof || videoRateAppliesWithoutProof)
  const maximumSilverCap = videoEnabled
    ? Math.min(EVENT_REGEAR_VIDEO_BONUS_MAX, baseSilverCap + videoClaimCeilingBonusSilver)
    : baseSilverCap
  const silverCap = hasEffectiveVideoProof ? maximumSilverCap : baseSilverCap
  const payoutRatePercent = hasEffectiveVideoRate
    ? videoPayoutRatePercent
    : basePayoutRatePercent
  const policyContext = input.policyContext ?? null
  const discordRolePolicySnapshot: RegearDiscordRolePolicySnapshot | null = discordRolePolicy
    ? {
        enabled: discordRolePolicy.enabled,
        roleGroup: discordRolePolicy.roleGroup,
        silverCap: discordRolePolicy.silverCap,
        payoutRatePercent: discordRolePolicy.payoutRatePercent,
        matchStatus: discordRolePolicy.matchStatus,
        matchedDiscordRoleId: discordRolePolicy.matchedPolicy?.discordRoleId ?? null,
        matchedDiscordRoleName: discordRolePolicy.matchedPolicy?.discordRoleName ?? null,
        memberRoleIds: [...discordRolePolicy.memberRoleIds],
      }
    : null

  const snapshot: RegearPolicySnapshot = {
    version: 3,
    enabled,
    disabledReason,
    flow: input.flow ?? 'manual',
    policyVersionId: policyContext?.policyVersionId ?? null,
    scope: policyContext?.scope ?? 'event',
    capturedAt: policyContext?.capturedAt ?? null,
    participant: policyContext
      ? {
          discordId: policyContext.discordId,
          username: policyContext.username,
          roleName: policyContext.roleName,
        }
      : null,
    eventPolicy,
    autoPolicy,
    // Version 3 stores the maximum conditional ceiling. Request/approval paths
    // derive the effective base/video ceiling without consulting live settings.
    roleCapSilver: maximumSilverCap,
    baseCapSilver: baseSilverCap,
    maxDeathsPerMember,
    basePayoutRatePercent,
    payoutRatePercent,
    videoPolicy,
    videoEnabled,
    videoPayoutRatePercent,
    videoClaimCeilingBonusSilver,
    videoRateAppliesWithoutProof,
    discordRolePolicy: discordRolePolicySnapshot,
    discordRoleRateFloor,
    sources: {
      cap: capSource,
      payoutRate: rateSource,
      video: videoSource,
    },
  }

  return {
    enabled,
    disabledReason,
    source: eventPolicy,
    capSource,
    rateSource,
    videoSource,
    baseSilverCap,
    silverCap,
    maxDeathsPerMember,
    basePayoutRatePercent,
    payoutRatePercent,
    videoEnabled,
    videoPayoutRatePercent,
    videoClaimCeilingBonusSilver,
    videoRateAppliesWithoutProof,
    autoPolicy,
    snapshot,
  }
}

function readNumberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key]
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
    ? value
    : null
}

function parseDiscordRoleRateFloor(
  raw: unknown,
): RegearDiscordRoleRateFloorSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const discordRoleId =
    typeof obj.discordRoleId === 'string' ? obj.discordRoleId.trim() : ''
  const discordRoleName =
    typeof obj.discordRoleName === 'string' ? obj.discordRoleName.trim() : ''
  const minimumPayoutRatePercent = readNumberField(obj, 'minimumPayoutRatePercent')
  if (
    !discordRoleId ||
    !discordRoleName ||
    discordRoleName.length > 100 ||
    !isValidEventRegearRolePayoutRate(minimumPayoutRatePercent)
  ) {
    return null
  }
  return {
    discordRoleId,
    discordRoleName,
    minimumPayoutRatePercent,
  }
}

const regearRoleGroupSet: ReadonlySet<string> = new Set([
  'dps',
  'healer',
  'tank',
  'support',
  'battle_mount',
  'other',
])
const regearRolePolicyMatchStatusSet: ReadonlySet<string> = new Set([
  'disabled',
  'matched',
  'no_match',
  'roles_unavailable',
])

function parseDiscordRolePolicy(raw: unknown): RegearDiscordRolePolicySnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const roleGroup =
    typeof obj.roleGroup === 'string' && regearRoleGroupSet.has(obj.roleGroup)
      ? (obj.roleGroup as RegearRoleGroup)
      : null
  const matchStatus =
    typeof obj.matchStatus === 'string' && regearRolePolicyMatchStatusSet.has(obj.matchStatus)
      ? (obj.matchStatus as RegearRolePolicyMatchStatus)
      : null
  const silverCap = readNumberField(obj, 'silverCap')
  const payoutRatePercent =
    obj.payoutRatePercent == null ? null : readNumberField(obj, 'payoutRatePercent')
  if (
    !roleGroup ||
    !matchStatus ||
    silverCap == null ||
    silverCap < 0 ||
    (payoutRatePercent != null && !isValidEventRegearRolePayoutRate(payoutRatePercent))
  ) {
    return null
  }
  const memberRoleIds = Array.isArray(obj.memberRoleIds)
    ? Array.from(
        new Set(
          obj.memberRoleIds.filter(
            (value): value is string => typeof value === 'string' && value.length > 0,
          ),
        ),
      )
    : []
  return {
    enabled: obj.enabled === true,
    roleGroup,
    silverCap,
    payoutRatePercent,
    matchStatus,
    matchedDiscordRoleId:
      typeof obj.matchedDiscordRoleId === 'string' && obj.matchedDiscordRoleId
        ? obj.matchedDiscordRoleId
        : null,
    matchedDiscordRoleName:
      typeof obj.matchedDiscordRoleName === 'string' && obj.matchedDiscordRoleName
        ? obj.matchedDiscordRoleName
        : null,
    memberRoleIds,
  }
}

function parseParticipantSnapshot(
  raw: unknown,
): RegearPolicySnapshot['participant'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  const discordId = typeof obj.discordId === 'string' ? obj.discordId.trim() : ''
  const username = typeof obj.username === 'string' ? obj.username.trim() : ''
  const roleName = typeof obj.roleName === 'string' ? obj.roleName.trim() : ''
  if (!discordId || !username || !roleName) return null
  return { discordId, username, roleName }
}

export function parseRegearPolicySnapshot(raw: unknown): RegearPolicySnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== 2 && obj.version !== 3) return null
  const eventPolicy = isEventRegearPolicy(obj.eventPolicy) ? obj.eventPolicy : null
  const autoPolicy = isEventRegearAutoPolicy(obj.autoPolicy) ? obj.autoPolicy : null
  const videoPolicy = isEventRegearVideoPolicy(obj.videoPolicy) ? obj.videoPolicy : null
  const roleCapSilver = readNumberField(obj, 'roleCapSilver')
  const baseCapSilver = readNumberField(obj, 'baseCapSilver')
  const maxDeathsPerMember = readNumberField(obj, 'maxDeathsPerMember')
  const basePayoutRatePercent = readNumberField(obj, 'basePayoutRatePercent')
  const payoutRatePercent = readNumberField(obj, 'payoutRatePercent')
  const videoPayoutRatePercent = readNumberField(obj, 'videoPayoutRatePercent')
  const videoClaimCeilingBonusSilver = readNumberField(obj, 'videoClaimCeilingBonusSilver')
  if (
    !eventPolicy ||
    !autoPolicy ||
    !videoPolicy ||
    roleCapSilver == null ||
    baseCapSilver == null ||
    maxDeathsPerMember == null ||
    basePayoutRatePercent == null ||
    payoutRatePercent == null ||
    videoPayoutRatePercent == null ||
    videoClaimCeilingBonusSilver == null
  ) {
    return null
  }
  if (
    roleCapSilver < 0 ||
    baseCapSilver < 0 ||
    maxDeathsPerMember <= 0 ||
    !isValidEventRegearRolePayoutRate(basePayoutRatePercent) ||
    !isValidEventRegearRolePayoutRate(payoutRatePercent) ||
    !isValidEventRegearRolePayoutRate(videoPayoutRatePercent) ||
    !isValidEventRegearVideoBonus(videoClaimCeilingBonusSilver)
  ) {
    return null
  }
  const defaultSources: RegearPolicySnapshot['sources'] = {
    cap: null,
    payoutRate: 'fallback',
    video: 'guild_default',
  }
  const sources =
    obj.sources && typeof obj.sources === 'object' && !Array.isArray(obj.sources)
      ? (obj.sources as RegearPolicySnapshot['sources'])
      : defaultSources
  const discordRoleRateFloor = parseDiscordRoleRateFloor(obj.discordRoleRateFloor)
  const discordRolePolicy = parseDiscordRolePolicy(obj.discordRolePolicy)
  const disabledReasonSet: ReadonlySet<Exclude<RegearPolicyDisabledReason, null>> = new Set([
    'event',
    'auto',
    'role',
    'slot_excluded',
    'invalid_event',
  ])
  const disabledReason =
    obj.disabledReason == null
      ? null
      : typeof obj.disabledReason === 'string' &&
          disabledReasonSet.has(obj.disabledReason as Exclude<RegearPolicyDisabledReason, null>)
        ? (obj.disabledReason as Exclude<RegearPolicyDisabledReason, null>)
        : null
  const flow: RegearPolicyFlow | undefined =
    obj.flow === 'manual' || obj.flow === 'auto' ? obj.flow : undefined
  const scope: RegearPolicyScope | undefined =
    obj.scope === 'event' || obj.scope === 'free_window' ? obj.scope : undefined
  return {
    version: obj.version,
    ...(obj.version === 3
      ? {
          enabled: obj.enabled === true,
          disabledReason,
          flow: flow ?? 'manual',
          policyVersionId:
            typeof obj.policyVersionId === 'string' && obj.policyVersionId
              ? obj.policyVersionId
              : null,
          scope: scope ?? 'event',
          capturedAt:
            typeof obj.capturedAt === 'string' && obj.capturedAt ? obj.capturedAt : null,
          participant: parseParticipantSnapshot(obj.participant),
        }
      : {}),
    eventPolicy,
    autoPolicy,
    roleCapSilver,
    baseCapSilver,
    maxDeathsPerMember,
    basePayoutRatePercent,
    payoutRatePercent,
    videoPolicy,
    videoEnabled: obj.videoEnabled === true,
    videoPayoutRatePercent,
    videoClaimCeilingBonusSilver,
    videoRateAppliesWithoutProof: obj.videoRateAppliesWithoutProof === true,
    discordRolePolicy,
    discordRoleRateFloor,
    sources,
  }
}

export function materializeRegearPolicySnapshot(
  snapshot: RegearPolicySnapshot,
  hasVideoProof: boolean,
): RegearPolicySnapshot {
  return {
    ...snapshot,
    payoutRatePercent: resolveSnapshotPayoutRatePercent(snapshot, hasVideoProof, 100),
  }
}

export function regearRolePolicyResolutionFromSnapshot(
  snapshot: RegearPolicySnapshot,
  roleName: string,
): RegearRolePolicyResolution {
  const policy = snapshot.discordRolePolicy
  const matchedPolicy: RegearRolePolicyRow | null =
    policy?.matchedDiscordRoleId && policy.matchedDiscordRoleName
      ? {
          discordRoleId: policy.matchedDiscordRoleId,
          discordRoleName: policy.matchedDiscordRoleName,
          roleGroup: policy.roleGroup,
          silverCap: policy.silverCap,
          payoutRatePercent: policy.payoutRatePercent,
        }
      : null
  if (!policy) {
    return {
      enabled: false,
      roleGroup: roleGroupFromSlotRole(roleName),
      silverCap: snapshot.baseCapSilver,
      payoutRatePercent: null,
      matchStatus: 'disabled',
      matchedPolicy: null,
      memberRoleIds: [],
    }
  }
  return {
    enabled: policy.enabled,
    roleGroup: policy.roleGroup,
    silverCap: policy.silverCap,
    payoutRatePercent: policy.payoutRatePercent,
    matchStatus: policy.matchStatus,
    matchedPolicy,
    memberRoleIds: [...policy.memberRoleIds],
  }
}

export function resolveSnapshotPayoutRatePercent(
  snapshot: RegearPolicySnapshot | null,
  hasVideoProof: boolean,
  fallbackRatePercent: number,
): number {
  if (!snapshot) return fallbackRatePercent
  const minimumRate = snapshot.discordRoleRateFloor?.minimumPayoutRatePercent ?? 0
  if (snapshot.videoEnabled && (hasVideoProof || snapshot.videoRateAppliesWithoutProof)) {
    return Math.max(
      snapshot.basePayoutRatePercent,
      snapshot.videoPayoutRatePercent,
      minimumRate,
    )
  }
  return Math.max(snapshot.basePayoutRatePercent, minimumRate)
}

export function applyRegearWindowPayoutRate(
  snapshot: RegearPolicySnapshot,
  payoutRatePercent: number,
): RegearPolicySnapshot {
  if (!isValidEventRegearRolePayoutRate(payoutRatePercent)) return snapshot
  const effectivePayoutRatePercent = Math.max(
    payoutRatePercent,
    snapshot.discordRoleRateFloor?.minimumPayoutRatePercent ?? 0,
  )
  return {
    ...snapshot,
    basePayoutRatePercent: effectivePayoutRatePercent,
    payoutRatePercent: effectivePayoutRatePercent,
    videoPayoutRatePercent: effectivePayoutRatePercent,
    sources: {
      ...snapshot.sources,
      payoutRate: 'regear_window',
    },
  }
}

export function resolveSnapshotClaimCeilingSilver(
  snapshot: RegearPolicySnapshot | null,
  hasVideoProof: boolean,
  fallbackBaseCeilingSilver: number,
): number {
  if (!snapshot) return fallbackBaseCeilingSilver
  if (hasVideoProof && snapshot.videoEnabled) return snapshot.roleCapSilver
  return snapshot.baseCapSilver
}
