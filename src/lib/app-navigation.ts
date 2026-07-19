import {
  APP_AREA_DESCRIPTORS,
  resolveAppArea,
  type AppArea,
} from './app-route-registry'

export type MobileNavigationKey = AppArea

export type MobileNavigationLabelKey = AppArea

export interface MobileNavigationItem {
  key: MobileNavigationKey
  labelKey: MobileNavigationLabelKey
  href: string | null
  exact?: boolean
}

export interface AreaNavigationSourceItem {
  href: string
  badge?: number
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

interface AdminMobileNavigationAccess {
  operations: boolean
  events: boolean
  approvals: boolean
}

interface ResolveMobileNavigationInput {
  pathname: string
  canSeeAdminNav: boolean
  isMember: boolean
  isLocalGuildAccount: boolean
  eventNavigationOnly: boolean
  eventScope?: string | null
  memberNavigationVisible: boolean
  adminAccess: AdminMobileNavigationAccess
}

export function resolveMobilePrimaryNavigation(
  input: ResolveMobileNavigationInput,
): MobileNavigationItem[] {
  if (!input.memberNavigationVisible) {
    return [{
      key: 'guild',
      labelKey: 'guild',
      href: '/onboarding/albion',
    }]
  }

  if (input.eventScope) {
    return [{
      key: 'operations',
      labelKey: 'operations',
      href: `/events/${encodeURIComponent(input.eventScope)}`,
    }]
  }

  const availableAreas = input.isLocalGuildAccount
    ? APP_AREA_DESCRIPTORS.slice(0, 3)
    : input.eventNavigationOnly
      ? APP_AREA_DESCRIPTORS.slice(0, 2)
      : APP_AREA_DESCRIPTORS

  return availableAreas.map((item) => ({
    key: item.key,
    labelKey: item.labelKey,
    href:
      item.key === 'supply' && !input.isMember
        ? '/shop'
        : item.href,
    exact: item.key === 'today',
  }))
}

export function isMobileNavigationItemActive(
  pathname: string,
  item: MobileNavigationItem,
): boolean {
  if (!item.href) return false
  return resolveAppArea(pathname) === item.key
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
