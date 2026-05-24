import { CAP, hasAnyCapability, parseCapabilities } from '@/lib/permissions'

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
    href: '/admin/dashboard/approvals',
    capabilities: [
      CAP.REGEAR_APPROVE,
      CAP.REGEAR_EDIT_PRICE,
      CAP.REGEAR_BULK_ACTION,
      CAP.INVENTORY_DELIVER,
      CAP.EVENT_MANAGE,
      CAP.CRAFT_TASK_DELIVER,
      CAP.CRAFT_MASTER,
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
    capabilities: [CAP.REGEAR_APPROVE, CAP.SETTINGS_TOGGLES],
  },
  {
    href: '/admin/dashboard/stats',
    capabilities: [CAP.STATS_VIEW],
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
    capabilities: [
      CAP.SETTINGS_GENERAL,
      CAP.SETTINGS_TOGGLES,
      CAP.SETTINGS_GUILD_PROFILE,
    ],
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
