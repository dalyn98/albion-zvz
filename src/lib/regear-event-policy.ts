import { EVENT_REGEAR_POLICIES, type EventCategory, type EventRegearPolicy } from '@/types'
export type { EventRegearPolicy } from '@/types'

export const DEFAULT_EVENT_REGEAR_POLICY: EventRegearPolicy = 'role'
export const EVENT_REGEAR_SILVER_CAP_MIN = 1
export const EVENT_REGEAR_SILVER_CAP_MAX = 2_000_000_000
export const EVENT_REGEAR_MAX_DEATHS_MIN = 1
export const EVENT_REGEAR_MAX_DEATHS_MAX = 10

export type ManualRegearPolicySource = EventRegearPolicy

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

export function canUseEventRegearPolicy(category: EventCategory): boolean {
  return category !== '전투'
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
