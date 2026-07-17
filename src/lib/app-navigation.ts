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
