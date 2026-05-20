import { CAP, hasAnyCapability, parseCapabilities } from '@/lib/permissions'

interface AdminRouteAccessRule {
  href: string
  exact?: boolean
  capabilities: readonly bigint[]
}

const OFFICER_DASHBOARD_CAPABILITIES = [
  CAP.SIPHON_MANAGE,
  CAP.AUDIT_VIEW,
  CAP.SETTINGS_PERMISSIONS,
  CAP.STATS_VIEW,
  CAP.SETTLEMENT_MANAGE,
] as const

export const ADMIN_ROUTE_ACCESS_RULES: readonly AdminRouteAccessRule[] = [
  {
    href: '/admin/dashboard/stats',
    capabilities: [CAP.STATS_VIEW],
  },
  {
    href: '/admin/dashboard/settlements',
    capabilities: [CAP.SETTLEMENT_MANAGE],
  },
  {
    href: '/admin/dashboard/siphon',
    capabilities: [CAP.SIPHON_MANAGE],
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
  let best: AdminRouteAccessRule | null = null
  for (const rule of ADMIN_ROUTE_ACCESS_RULES) {
    const matches = rule.exact
      ? pathname === rule.href
      : pathname === rule.href || pathname.startsWith(`${rule.href}/`)
    if (!matches) continue
    if (!best || rule.href.length > best.href.length) best = rule
  }
  return best
}
