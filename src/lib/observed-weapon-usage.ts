import { extractWeaponCategory } from '@/lib/weapon-category'

export const OBSERVED_WEAPON_WINDOW_DAYS = 30
export const OBSERVED_WEAPON_SOURCE = 'killboard_equipment' as const

export interface ObservedWeaponFact {
  memberId: string | null | undefined
  battleId: string | null | undefined
  itemType: string | null | undefined
  observedAt: string | null | undefined
}

export interface ObservedWeaponCategoryUsage {
  category: string
  sampleItemId: string
  observationCount: number
}

export interface ObservedWeaponUsage {
  source: typeof OBSERVED_WEAPON_SOURCE
  windowDays: typeof OBSERVED_WEAPON_WINDOW_DAYS
  sampleCount: number
  categories: ObservedWeaponCategoryUsage[]
}

interface CategoryAccumulator {
  sampleItemId: string
  sampleObservedAt: string
  evidenceKeys: Set<string>
}

/**
 * Actual equipment observations only.
 *
 * The evidence key deliberately includes the member, normalized weapon family,
 * and official/tracked battle. A member can therefore contribute at most one
 * observation for the same weapon family in one battle, regardless of how
 * many killboard events were recorded.
 */
export function resolveObservedWeaponUsage(
  facts: ReadonlyArray<ObservedWeaponFact>,
  limit: number = Number.POSITIVE_INFINITY,
): ObservedWeaponUsage {
  const categories = new Map<string, CategoryAccumulator>()

  for (const fact of facts) {
    const memberId = fact.memberId?.trim()
    const battleId = fact.battleId?.trim()
    const itemType = fact.itemType?.trim()
    if (!memberId || !battleId || !itemType) continue

    const category = extractWeaponCategory(itemType)
    if (!category) continue

    const evidenceKey = `${memberId}\u0000${category}\u0000${battleId}`
    const observedAt = fact.observedAt ?? ''
    const current = categories.get(category)
    if (current) {
      current.evidenceKeys.add(evidenceKey)
      if (
        observedAt > current.sampleObservedAt ||
        (observedAt === current.sampleObservedAt && itemType > current.sampleItemId)
      ) {
        current.sampleItemId = itemType
        current.sampleObservedAt = observedAt
      }
      continue
    }

    categories.set(category, {
      sampleItemId: itemType,
      sampleObservedAt: observedAt,
      evidenceKeys: new Set([evidenceKey]),
    })
  }

  const normalizedLimit = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : Number.POSITIVE_INFINITY
  const allRows = Array.from(categories.entries())
    .map(([category, value]) => ({
      category,
      sampleItemId: value.sampleItemId,
      observationCount: value.evidenceKeys.size,
    }))
    .sort(
      (left, right) =>
        right.observationCount - left.observationCount ||
        left.category.localeCompare(right.category),
    )
  const sampleCount = allRows.reduce(
    (sum, row) => sum + row.observationCount,
    0,
  )
  const rows = allRows.slice(0, normalizedLimit)

  return {
    source: OBSERVED_WEAPON_SOURCE,
    windowDays: OBSERVED_WEAPON_WINDOW_DAYS,
    sampleCount,
    categories: rows,
  }
}

export function observedWeaponWindowStart(reference: Date = new Date()): string {
  return new Date(
    reference.getTime() - OBSERVED_WEAPON_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}
