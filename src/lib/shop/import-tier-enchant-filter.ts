import type { AggregateRow } from './aggregate-stock'

export const TIER_ENCHANT_SUM_MIN = 0
export const TIER_ENCHANT_SUM_MAX = 12

export interface TierEnchantSumFilter {
  excludeAtOrBelow: number | null
  excludeAtOrAbove: number | null
}

export interface TierEnchantSumFilterResult {
  rows: AggregateRow[]
  excludedRows: number
}

export function parseTierEnchantSumSetting(value: string | null | undefined): number | null {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < TIER_ENCHANT_SUM_MIN ||
    parsed > TIER_ENCHANT_SUM_MAX
  ) {
    return null
  }
  return parsed
}

export function parseTierEnchantSumFilter(input: {
  excludeAtOrBelow: string | null | undefined
  excludeAtOrAbove: string | null | undefined
}): TierEnchantSumFilter {
  return {
    excludeAtOrBelow: parseTierEnchantSumSetting(input.excludeAtOrBelow),
    excludeAtOrAbove: parseTierEnchantSumSetting(input.excludeAtOrAbove),
  }
}

export function tierEnchantSum(row: Pick<AggregateRow, 'entry' | 'resolved'>): number | null {
  const tier = row.resolved?.tier
  if (tier == null) return null
  if (!Number.isFinite(row.entry.enchant)) return null
  return tier + row.entry.enchant
}

export function shouldExcludeByTierEnchantSum(
  row: AggregateRow,
  filter: TierEnchantSumFilter,
): boolean {
  const sum = tierEnchantSum(row)
  if (sum == null) return false
  if (filter.excludeAtOrBelow !== null && sum <= filter.excludeAtOrBelow) return true
  if (filter.excludeAtOrAbove !== null && sum >= filter.excludeAtOrAbove) return true
  return false
}

export function applyTierEnchantSumFilter(
  rows: AggregateRow[],
  filter: TierEnchantSumFilter,
): TierEnchantSumFilterResult {
  if (filter.excludeAtOrBelow === null && filter.excludeAtOrAbove === null) {
    return { rows, excludedRows: 0 }
  }

  const kept: AggregateRow[] = []
  let excludedRows = 0
  for (const row of rows) {
    if (shouldExcludeByTierEnchantSum(row, filter)) {
      excludedRows += 1
      continue
    }
    kept.push(row)
  }
  return { rows: kept, excludedRows }
}
