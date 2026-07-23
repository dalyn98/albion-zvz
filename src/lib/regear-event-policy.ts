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
export type EventRegearCapSource = 'event' | 'event_role_override' | 'role_reward'
export type EventRegearRateSource =
  | 'event_role_override'
  | 'discord_role_policy'
  | 'role_reward'
  | 'guild_default'
  | 'fallback'
export type EventRegearVideoSource = 'event' | 'guild_default' | 'disabled'

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
  discordRolePayoutRatePercent?: number | null
  roleOverride?: EventRegearRoleOverrideInput | null
  guildBasePayoutRatePercent: number
  guildVideoPayoutRatePercent: number
  guildVideoClaimCeilingBonusSilver: number
  globalMaxDeaths: number
  hasVideoProof: boolean
  flow?: 'manual' | 'auto'
}

export interface ResolvedEventRegearPolicy {
  enabled: boolean
  disabledReason: 'event' | 'auto' | 'role' | 'invalid_event' | null
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

export interface RegearPolicySnapshot {
  version: 2
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
  const baseRateFromRole =
    override && isValidEventRegearRolePayoutRate(override.payoutRatePercent)
      ? {
          rate: override.payoutRatePercent,
          source: 'event_role_override' as const,
        }
      : isValidEventRegearRolePayoutRate(input.discordRolePayoutRatePercent)
        ? {
            rate: input.discordRolePayoutRatePercent,
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

  if (eventPolicy === 'disabled') {
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
    baseSilverCap = overrideCap ?? roleSilver
    capSource = overrideCap !== null ? 'event_role_override' : 'role_reward'
    maxDeathsPerMember = isValidEventRegearMaxDeaths(input.eventMaxDeathsPerMember)
      ? input.eventMaxDeathsPerMember
      : globalMaxDeaths
    if (baseSilverCap <= 0) {
      enabled = false
      disabledReason = 'role'
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
  const videoPayoutRatePercent =
    videoPolicy === 'inherit' && hasRoleSpecificRate
      ? baseRateFromRole.rate
      : Math.max(baseRateFromRole.rate, configuredVideoPayoutRatePercent)
  const videoClaimCeilingBonusSilver =
    videoPolicy === 'custom'
      ? normalizeVideoBonus(input.eventVideoClaimCeilingBonusSilver, 0)
      : videoPolicy === 'disabled'
        ? 0
        : normalizeVideoBonus(input.guildVideoClaimCeilingBonusSilver, 0)

  const hasEffectiveVideoProof = input.hasVideoProof && videoEnabled
  const hasEffectiveVideoRate = videoEnabled && (input.hasVideoProof || videoRateAppliesWithoutProof)
  const silverCap = hasEffectiveVideoProof
    ? Math.min(EVENT_REGEAR_VIDEO_BONUS_MAX, baseSilverCap + videoClaimCeilingBonusSilver)
    : baseSilverCap
  const payoutRatePercent = hasEffectiveVideoRate
    ? videoPayoutRatePercent
    : baseRateFromRole.rate

  const snapshot: RegearPolicySnapshot = {
    version: 2,
    eventPolicy,
    autoPolicy,
    roleCapSilver: silverCap,
    baseCapSilver: baseSilverCap,
    maxDeathsPerMember,
    basePayoutRatePercent: baseRateFromRole.rate,
    payoutRatePercent,
    videoPolicy,
    videoEnabled,
    videoPayoutRatePercent,
    videoClaimCeilingBonusSilver,
    videoRateAppliesWithoutProof,
    sources: {
      cap: capSource,
      payoutRate: baseRateFromRole.source,
      video: videoSource,
    },
  }

  return {
    enabled,
    disabledReason,
    source: eventPolicy,
    capSource,
    rateSource: baseRateFromRole.source,
    videoSource,
    baseSilverCap,
    silverCap,
    maxDeathsPerMember,
    basePayoutRatePercent: baseRateFromRole.rate,
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

export function parseRegearPolicySnapshot(raw: unknown): RegearPolicySnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const obj = raw as Record<string, unknown>
  if (obj.version !== 2) return null
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
  return {
    version: 2,
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
    sources,
  }
}

export function resolveSnapshotPayoutRatePercent(
  snapshot: RegearPolicySnapshot | null,
  hasVideoProof: boolean,
  fallbackRatePercent: number,
): number {
  if (!snapshot) return fallbackRatePercent
  if (snapshot.videoEnabled && (hasVideoProof || snapshot.videoRateAppliesWithoutProof)) {
    return Math.max(snapshot.basePayoutRatePercent, snapshot.videoPayoutRatePercent)
  }
  return snapshot.basePayoutRatePercent
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
