export type MobileNavigationKey =
  | 'today'
  | 'events'
  | 'regear'
  | 'wallet'
  | 'operations'
  | 'adminEvents'
  | 'approvals'
  | 'memberToday'
  | 'more'

export type MobileNavigationLabelKey =
  | 'today'
  | 'events'
  | 'regearRequest'
  | 'wallet'
  | 'adminToday'
  | 'eventAdmin'
  | 'approvals'
  | 'more'

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
  memberNavigationVisible: boolean
  adminAccess: AdminMobileNavigationAccess
}

const MEMBER_ITEMS: MobileNavigationItem[] = [
  { key: 'today', labelKey: 'today', href: '/', exact: true },
  { key: 'events', labelKey: 'events', href: '/events' },
  { key: 'regear', labelKey: 'regearRequest', href: '/regear' },
  { key: 'wallet', labelKey: 'wallet', href: '/me/wallet' },
]

const ADMIN_ITEMS: Array<MobileNavigationItem & { access: keyof AdminMobileNavigationAccess }> = [
  {
    key: 'operations',
    labelKey: 'adminToday',
    href: '/admin/dashboard',
    exact: true,
    access: 'operations',
  },
  {
    key: 'adminEvents',
    labelKey: 'eventAdmin',
    href: '/admin/dashboard/events',
    access: 'events',
  },
  {
    key: 'approvals',
    labelKey: 'approvals',
    href: '/admin/dashboard/approvals',
    access: 'approvals',
  },
]

const MEMBER_TODAY_ITEM: MobileNavigationItem = {
  key: 'memberToday',
  labelKey: 'today',
  href: '/',
  exact: true,
}

const MORE_ITEM: MobileNavigationItem = {
  key: 'more',
  labelKey: 'more',
  href: null,
}

export function resolveMobilePrimaryNavigation(
  input: ResolveMobileNavigationInput,
): MobileNavigationItem[] {
  const adminMode = input.canSeeAdminNav && input.pathname.startsWith('/admin')

  if (adminMode) {
    const adminItems = ADMIN_ITEMS
      .filter((item) => input.adminAccess[item.access])
      .map(({ key, labelKey, href, exact }) => ({ key, labelKey, href, exact }))
    return [...adminItems, MEMBER_TODAY_ITEM, MORE_ITEM]
  }

  const memberItems = input.memberNavigationVisible
    ? MEMBER_ITEMS.filter((item) => {
        if (item.key === 'regear') return input.isMember
        if (item.key === 'wallet') return input.isMember && !input.isLocalGuildAccount
        return true
      })
    : []

  return [...memberItems, MORE_ITEM]
}

export function isMobileNavigationItemActive(
  pathname: string,
  item: MobileNavigationItem,
): boolean {
  if (!item.href) return false
  if (item.href === '/' || item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}
