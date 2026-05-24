import type { RegearType } from '@/types'

export const MANUAL_REGEAR_MAX_BATCH_ENTRIES = 3

export function getRemainingDeathClaims(
  activeDeathCount: number,
  maxDeaths: number,
): number {
  return Math.max(0, maxDeaths - activeDeathCount)
}

export function isDeathLimitReached(
  activeDeathCount: number,
  maxDeaths: number,
): boolean {
  return getRemainingDeathClaims(activeDeathCount, maxDeaths) <= 0
}

export function getDeathBatchEntryLimit(
  activeDeathCount: number,
  maxDeaths: number,
): number {
  return Math.max(
    1,
    Math.min(MANUAL_REGEAR_MAX_BATCH_ENTRIES, getRemainingDeathClaims(activeDeathCount, maxDeaths)),
  )
}

export function getEntryLimitForRequestType(
  requestType: RegearType,
  activeDeathCount: number,
  maxDeaths: number,
): number {
  if (requestType === 'overcharge') return 1
  return getDeathBatchEntryLimit(activeDeathCount, maxDeaths)
}

export function canOpenManualRegearRequest(input: {
  baseEnabled: boolean
  activeDeathCount: number
  maxDeaths: number
  overchargeEnabled: boolean
}): boolean {
  if (!input.baseEnabled) return false
  return !isDeathLimitReached(input.activeDeathCount, input.maxDeaths) || input.overchargeEnabled
}
