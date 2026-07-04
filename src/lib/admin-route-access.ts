import { CAP, hasAnyCapability, parseCapabilities } from '@/lib/permissions'
import { REGEAR_WINDOW_MANAGE_CAPS } from '@/lib/regear-window-permissions'
import { SETTINGS_PAGE_CAPABILITIES } from '@/lib/settings-access'
import { APPROVAL_REVIEW_CAPS } from '@/lib/admin-approval-permissions'

interface AdminRouteAccessRule {
  href: string
  exact?: boolean
  capabilities: readonly bigint[]
}

const OFFICER_DASHBOARD_CAPABILITIES = [
  CAP.REGEAR_APPROVE,
  CAP.REGEAR_EDIT_PRICE,
  CAP.REGEAR_BULK_ACTION,
  CAP.EVENT_CREATE_COMBAT,
  CAP.EVENT_CREATE_FF,
  CAP.EVENT_CREATE_GANKING,
  CAP.EVENT_MANAGE,
  CAP.INVENTORY_MANAGE,
  CAP.INVENTORY_DELIVER,
  CAP.SHOP_PRICING,
  CAP.CHEST_LOG_PASTE,
  CAP.CRAFT_TASK_CREATE,
  CAP.CRAFT_TASK_DELIVER,
  CAP.CRAFT_MASTER,
  CAP.SETTINGS_GENERAL,
  CAP.SETTINGS_TOGGLES,
  CAP.SETTINGS_GUILD_PROFILE,
  CAP.SIPHON_MANAGE,
  CAP.AUDIT_VIEW,
  CAP.SETTINGS_PERMISSIONS,
  CAP.STATS_VIEW,
  CAP.EXCHANGE_APPROVE,
  CAP.DONATION_APPROVE,
  CAP.TACTICS_MANAGE,
  CAP.TACTICS_PUBLISH,
] as const

export const ADMIN_ROUTE_ACCESS_RULES: readonly AdminRouteAccessRule[] = [
  {
    href: '/admin/dashboard',
    exact: true,
    capabilities: [
      CAP.EVENT_CREATE_COMBAT,
      CAP.EVENT_CREATE_FF,
      CAP.EVENT_CREATE_GANKING,
      CAP.EVENT_MANAGE,
    ],
  },
  {
    href: '/admin/dashboard/events',
    capabilities: [
      CAP.EVENT_CREATE_COMBAT,
      CAP.EVENT_CREATE_FF,
      CAP.EVENT_CREATE_GANKING,
      CAP.EVENT_MANAGE,
    ],
  },
  {
    href: '/admin/dashboard/templates',
    capabilities: [
      CAP.EVENT_CREATE_COMBAT,
      CAP.EVENT_CREATE_FF,
      CAP.EVENT_CREATE_GANKING,
      CAP.EVENT_MANAGE,
    ],
  },
  {
    href: '/admin/dashboard/builds',
    capabilities: [
      CAP.EVENT_CREATE_COMBAT,
      CAP.EVENT_CREATE_FF,
      CAP.EVENT_CREATE_GANKING,
      CAP.EVENT_MANAGE,
    ],
  },
  {
    href: '/admin/dashboard/tactics',
    capabilities: [CAP.TACTICS_MANAGE, CAP.TACTICS_PUBLISH],
  },
  {
    href: '/admin/dashboard/approvals',
    capabilities: APPROVAL_REVIEW_CAPS,
  },
  {
    href: '/admin/dashboard/exchanges',
    capabilities: APPROVAL_REVIEW_CAPS,
  },
  {
    href: '/admin/dashboard/donations',
    capabilities: APPROVAL_REVIEW_CAPS,
  },
  {
    href: '/admin/dashboard/settlements',
    capabilities: APPROVAL_REVIEW_CAPS,
  },
  {
    href: '/admin/dashboard/regear',
    capabilities: [
      CAP.REGEAR_APPROVE,
      CAP.REGEAR_EDIT_PRICE,
      CAP.REGEAR_BULK_ACTION,
    ],
  },
  {
    href: '/admin/dashboard/shop',
    capabilities: [CAP.INVENTORY_MANAGE, CAP.INVENTORY_DELIVER, CAP.SHOP_PRICING, CAP.CHEST_LOG_PASTE],
  },
  {
    href: '/admin/dashboard/inventory',
    capabilities: [CAP.INVENTORY_MANAGE, CAP.INVENTORY_DELIVER],
  },
  {
    href: '/admin/dashboard/craft',
    capabilities: [CAP.CRAFT_TASK_CREATE, CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER],
  },
  {
    href: '/admin/dashboard/regear-windows',
    capabilities: REGEAR_WINDOW_MANAGE_CAPS,
  },
  {
    href: '/admin/dashboard/stats',
    capabilities: [CAP.STATS_VIEW],
  },
  {
    href: '/admin/dashboard/killbot',
    capabilities: [CAP.SETTINGS_GENERAL],
  },
  {
    href: '/admin/dashboard/siphon',
    capabilities: [CAP.SIPHON_MANAGE],
  },
  {
    href: '/admin/dashboard/loot-audit',
    capabilities: [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE],
  },
  {
    href: '/admin/dashboard/audit',
    capabilities: [CAP.AUDIT_VIEW],
  },
  {
    href: '/admin/dashboard/permissions',
    capabilities: [CAP.SETTINGS_PERMISSIONS],
  },
  {
    href: '/admin/dashboard/guild-profile',
    capabilities: [CAP.SETTINGS_GUILD_PROFILE],
  },
  {
    href: '/admin/dashboard/settings',
    capabilities: SETTINGS_PAGE_CAPABILITIES,
  },
  {
    href: '/admin/dashboard/guide',
    capabilities: OFFICER_DASHBOARD_CAPABILITIES,
  },
]

export function canAccessAdminPath(
  pathname: string,
  isAdmin: boolean,
  rawCapabilities: string | null | undefined,
): boolean {
  if (isAdmin) return true
  const rule = matchAdminRoute(pathname)
  if (!rule) return false
  return hasAnyCapability(parseCapabilities(rawCapabilities), rule.capabilities)
}

export function canAccessAnyOfficerAdminRoute(
  isAdmin: boolean,
  rawCapabilities: string | null | undefined,
): boolean {
  if (isAdmin) return true
  return hasAnyCapability(parseCapabilities(rawCapabilities), OFFICER_DASHBOARD_CAPABILITIES)
}

export function getFirstAccessibleAdminPath(
  isAdmin: boolean,
  rawCapabilities: string | null | undefined,
): string | null {
  if (isAdmin) return '/admin/dashboard'
  const bits = parseCapabilities(rawCapabilities)
  const firstRule = ADMIN_ROUTE_ACCESS_RULES.find((rule) =>
    hasAnyCapability(bits, rule.capabilities),
  )
  return firstRule?.href ?? null
}

function matchAdminRoute(pathname: string): AdminRouteAccessRule | null {
  const normalizedPath = pathname.split(/[?#]/, 1)[0] || pathname
  let best: AdminRouteAccessRule | null = null
  for (const rule of ADMIN_ROUTE_ACCESS_RULES) {
    const matches = rule.exact
      ? normalizedPath === rule.href
      : normalizedPath === rule.href || normalizedPath.startsWith(`${rule.href}/`)
    if (!matches) continue
    if (!best || rule.href.length > best.href.length) best = rule
  }
  return best
}
