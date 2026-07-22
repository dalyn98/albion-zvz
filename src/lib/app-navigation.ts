import {
  APP_AREA_DESCRIPTORS,
  resolveAppArea,
  type AppArea,
} from './app-route-registry'

export interface AreaNavigationSourceItem {
  href: string
  badge?: number
  exact?: boolean
}

export interface AreaNavigationGroup<T extends AreaNavigationSourceItem> {
  area: AppArea
  badge: number
  memberItems: T[]
  operatorItems: T[]
}

export interface NavigationSearchItem {
  href: string
  label: string
  areaLabel: string
  audienceLabel: string
  aliases?: string
}

export type NavigationAudience = 'member' | 'operator'

export interface CurrentNavigationContext {
  audience: NavigationAudience
  destinationLabel: string
}

export interface NavigationVisitMemory {
  version: 1
  visits: Partial<Record<NavigationAudience, Partial<Record<AppArea, string>>>>
  recent: string[]
}

export interface ContextualAreaDestination {
  area: AppArea
  href: string
  audience: NavigationAudience
  destinationLabel: string
  remainingItemCount: number
  badge: number
  active: boolean
  source: 'current' | 'recent' | 'fallback'
}

interface ContextualNavigationItem extends AreaNavigationSourceItem {
  label: string
}

interface CatalogMatch<T extends ContextualNavigationItem> {
  area: AppArea
  audience: NavigationAudience
  item: T
  score: number
}

const EMPTY_VISIT_MEMORY: NavigationVisitMemory = {
  version: 1,
  visits: {},
  recent: [],
}

const MAX_RECENT_NAVIGATION_ITEMS = 10

export const NAVIGATION_SEARCH_ALIAS_KEYS = {
  regearRequest: 'regear',
  craftInventory: 'inventory',
  inventoryAdmin: 'inventory',
  approvals: 'approvals',
  permissions: 'permissions',
  mySettings: 'settings',
  settings: 'settings',
  backup: 'backup',
} as const

export type NavigationSearchAliasKey =
  (typeof NAVIGATION_SEARCH_ALIAS_KEYS)[keyof typeof NAVIGATION_SEARCH_ALIAS_KEYS]

export function getNavigationSearchAliasKey(
  labelKey: string,
): NavigationSearchAliasKey | null {
  return NAVIGATION_SEARCH_ALIAS_KEYS[
    labelKey as keyof typeof NAVIGATION_SEARCH_ALIAS_KEYS
  ] ?? null
}

/**
 * Builds the single navigation model consumed by the sidebar, drawer, and
 * local feature search. Callers must pass items after permission/feature
 * filtering so inaccessible routes never enter the discovery surface.
 */
export function groupNavigationByArea<T extends AreaNavigationSourceItem>(
  memberItems: readonly T[],
  operatorItems: readonly T[],
): AreaNavigationGroup<T>[] {
  return APP_AREA_DESCRIPTORS.flatMap(({ key: area }) => {
    const areaMemberItems = memberItems.filter((item) => resolveAppArea(item.href) === area)
    const areaOperatorItems = operatorItems.filter((item) => resolveAppArea(item.href) === area)
    if (areaMemberItems.length === 0 && areaOperatorItems.length === 0) return []

    const badge = [...areaMemberItems, ...areaOperatorItems].reduce(
      (sum, item) => sum + Math.max(0, item.badge ?? 0),
      0,
    )
    return [{
      area,
      badge,
      memberItems: areaMemberItems,
      operatorItems: areaOperatorItems,
    }]
  })
}

function parseNavigationHref(href: string): URL {
  return new URL(href, 'https://navigation.local')
}

function navigationMatchScore(
  currentHref: string,
  item: AreaNavigationSourceItem,
): number {
  const current = parseNavigationHref(currentHref)
  const target = parseNavigationHref(item.href)
  const currentPath = current.pathname.replace(/\/+$/, '') || '/'
  const targetPath = target.pathname.replace(/\/+$/, '') || '/'

  if (item.exact || targetPath === '/') {
    if (currentPath !== targetPath) return -1
  } else if (currentPath !== targetPath && !currentPath.startsWith(`${targetPath}/`)) {
    return -1
  }

  let matchedQueryCount = 0
  for (const [key, value] of target.searchParams) {
    if (current.searchParams.get(key) !== value) return -1
    matchedQueryCount += 1
  }

  const exactPathBonus = currentPath === targetPath ? 10_000 : 0
  return exactPathBonus + targetPath.length * 10 + matchedQueryCount
}

export function isNavigationItemActive(
  currentHref: string,
  item: AreaNavigationSourceItem,
): boolean {
  return navigationMatchScore(currentHref, item) >= 0
}

function catalogMatches<T extends ContextualNavigationItem>(
  currentHref: string,
  groups: readonly AreaNavigationGroup<T>[],
): CatalogMatch<T>[] {
  return groups.flatMap((group) => [
    ...group.memberItems.map((item) => ({
      area: group.area,
      audience: 'member' as const,
      item,
      score: navigationMatchScore(currentHref, item),
    })),
    ...group.operatorItems.map((item) => ({
      area: group.area,
      audience: 'operator' as const,
      item,
      score: navigationMatchScore(currentHref, item),
    })),
  ]).filter((match) => match.score >= 0)
}

function bestCatalogMatch<T extends ContextualNavigationItem>(
  currentHref: string,
  groups: readonly AreaNavigationGroup<T>[],
  fallbackAudience: NavigationAudience,
): CatalogMatch<T> | null {
  const matches = catalogMatches(currentHref, groups)
  if (matches.length === 0) return null

  return matches.reduce((best, candidate) => {
    if (candidate.score > best.score) return candidate
    if (candidate.score < best.score) return best
    if (candidate.audience === fallbackAudience && best.audience !== fallbackAudience) {
      return candidate
    }
    return best
  })
}

function itemsForAudience<T extends AreaNavigationSourceItem>(
  group: AreaNavigationGroup<T>,
  audience: NavigationAudience,
): readonly T[] {
  return audience === 'operator' ? group.operatorItems : group.memberItems
}

function visitHrefFor(
  memory: NavigationVisitMemory | undefined,
  audience: NavigationAudience,
  area: AppArea,
): string | null {
  return memory?.visits[audience]?.[area] ?? null
}

function findItemByHref<T extends ContextualNavigationItem>(
  items: readonly T[],
  href: string | null,
): T | null {
  if (!href) return null
  return items.find((item) => item.href === href) ?? null
}

export function parseNavigationVisitMemory<T extends ContextualNavigationItem>(
  raw: unknown,
  groups: readonly AreaNavigationGroup<T>[],
): NavigationVisitMemory {
  if (!raw || typeof raw !== 'object') return EMPTY_VISIT_MEMORY
  const value = raw as {
    version?: unknown
    visits?: unknown
    recent?: unknown
  }
  if (value.version !== 1 || !value.visits || typeof value.visits !== 'object') {
    return EMPTY_VISIT_MEMORY
  }

  const sourceVisits = value.visits as Record<string, unknown>
  const visits: NavigationVisitMemory['visits'] = {}
  const allowedHrefs = new Set<string>()

  for (const audience of ['member', 'operator'] as const) {
    const sourceAudience = sourceVisits[audience]
    if (!sourceAudience || typeof sourceAudience !== 'object') continue
    const sourceAreas = sourceAudience as Record<string, unknown>
    const nextAreas: Partial<Record<AppArea, string>> = {}

    for (const group of groups) {
      const items = itemsForAudience(group, audience)
      items.forEach((item) => allowedHrefs.add(item.href))
      const href = sourceAreas[group.area]
      if (typeof href === 'string' && items.some((item) => item.href === href)) {
        nextAreas[group.area] = href
      }
    }

    if (Object.keys(nextAreas).length > 0) visits[audience] = nextAreas
  }

  for (const group of groups) {
    group.memberItems.forEach((item) => allowedHrefs.add(item.href))
    group.operatorItems.forEach((item) => allowedHrefs.add(item.href))
  }

  const recent = Array.isArray(value.recent)
    ? value.recent
        .filter((href): href is string => typeof href === 'string' && allowedHrefs.has(href))
        .filter((href, index, list) => list.indexOf(href) === index)
        .slice(0, MAX_RECENT_NAVIGATION_ITEMS)
    : []

  return { version: 1, visits, recent }
}

export function resolveContextualAreaDestinations<
  T extends ContextualNavigationItem,
>({
  currentHref,
  groups,
  visits,
  fallbackAudience,
  currentContext,
}: {
  currentHref: string
  groups: readonly AreaNavigationGroup<T>[]
  visits?: NavigationVisitMemory
  fallbackAudience: NavigationAudience
  currentContext?: CurrentNavigationContext
}): ContextualAreaDestination[] {
  const match = bestCatalogMatch(currentHref, groups, fallbackAudience)
  const activeArea = resolveAppArea(currentHref) ?? match?.area ?? groups[0]?.area ?? null
  const activeAudience = match?.audience ?? currentContext?.audience ?? fallbackAudience

  return groups.flatMap((group): ContextualAreaDestination[] => {
    const active = group.area === activeArea
    if (active) {
      const activeItems = itemsForAudience(group, activeAudience)
      const fallbackItems = itemsForAudience(
        group,
        activeAudience === 'member' ? 'operator' : 'member',
      )
      const matched = match?.area === group.area ? match : null
      const item = matched?.item ?? activeItems[0] ?? fallbackItems[0]
      if (!item) return []
      const audience = matched?.audience ?? currentContext?.audience ?? (
        activeItems.length > 0
          ? activeAudience
          : activeAudience === 'member' ? 'operator' : 'member'
      )
      const itemCount = itemsForAudience(group, audience).length
      return [{
        area: group.area,
        href: currentHref,
        audience,
        destinationLabel: matched?.item.label ?? currentContext?.destinationLabel ?? item.label,
        remainingItemCount: Math.max(0, itemCount - (matched ? 1 : 0)),
        badge: group.badge,
        active: true,
        source: 'current',
      }]
    }

    const preferredItems = itemsForAudience(group, activeAudience)
    const alternateAudience = activeAudience === 'member' ? 'operator' : 'member'
    const alternateItems = itemsForAudience(group, alternateAudience)
    const remembered = findItemByHref(
      preferredItems,
      visitHrefFor(visits, activeAudience, group.area),
    )
    const item = remembered ?? preferredItems[0] ?? alternateItems[0]
    if (!item) return []
    const audience = preferredItems.includes(item) ? activeAudience : alternateAudience
    const itemCount = itemsForAudience(group, audience).length

    return [{
      area: group.area,
      href: item.href,
      audience,
      destinationLabel: item.label,
      remainingItemCount: Math.max(0, itemCount - 1),
      badge: group.badge,
      active: false,
      source: remembered ? 'recent' : 'fallback',
    }]
  })
}

export function updateNavigationVisitMemory<
  T extends ContextualNavigationItem,
>({
  currentHref,
  groups,
  previous,
  fallbackAudience,
}: {
  currentHref: string
  groups: readonly AreaNavigationGroup<T>[]
  previous: NavigationVisitMemory
  fallbackAudience: NavigationAudience
}): NavigationVisitMemory {
  const safePrevious = parseNavigationVisitMemory(previous, groups)
  const match = bestCatalogMatch(currentHref, groups, fallbackAudience)
  if (!match) return safePrevious

  const audienceVisits = safePrevious.visits[match.audience] ?? {}
  const visits = {
    ...safePrevious.visits,
    [match.audience]: {
      ...audienceVisits,
      [match.area]: match.item.href,
    },
  }
  const recent = [
    match.item.href,
    ...safePrevious.recent.filter((href) => href !== match.item.href),
  ].slice(0, MAX_RECENT_NAVIGATION_ITEMS)

  return { version: 1, visits, recent }
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().trim()
}

/** Local-only search over the already-authorized navigation catalog. */
export function searchNavigationItems<T extends NavigationSearchItem>(
  items: readonly T[],
  query: string,
): T[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...items]

  return items.filter((item) => {
    const haystack = normalizeSearchText([
      item.label,
      item.areaLabel,
      item.audienceLabel,
      item.aliases ?? '',
      item.href,
    ].join(' '))
    return terms.every((term) => haystack.includes(term))
  })
}
