export const APP_AREAS = ['today', 'operations', 'supply', 'records', 'guild'] as const

export type AppArea = (typeof APP_AREAS)[number]

export type AppSurface =
  | 'situation'
  | 'sequence'
  | 'board'
  | 'queue'
  | 'ledger'
  | 'workbench'

export interface AppAreaDescriptor {
  key: AppArea
  labelKey: AppArea
  href: string
  demoHref: string
  surface: AppSurface
}

/**
 * Product navigation is organised around the guild's recurring operating
 * loop, not around member/admin implementation boundaries. Permission checks
 * still happen at the route and tool-link layers.
 */
export const APP_AREA_DESCRIPTORS: ReadonlyArray<AppAreaDescriptor> = [
  { key: 'today', labelKey: 'today', href: '/', demoHref: '/demo', surface: 'situation' },
  { key: 'operations', labelKey: 'operations', href: '/events', demoHref: '/demo/member-events', surface: 'sequence' },
  { key: 'supply', labelKey: 'supply', href: '/regear', demoHref: '/demo/member-regear', surface: 'queue' },
  { key: 'records', labelKey: 'records', href: '/leaderboard', demoHref: '/demo/leaderboard', surface: 'ledger' },
  { key: 'guild', labelKey: 'guild', href: '/members', demoHref: '/demo/members', surface: 'workbench' },
] as const

const EXACT_AREA_ROUTES: Readonly<Record<string, AppArea>> = {
  '/': 'today',
  '/admin/dashboard': 'today',
  '/demo': 'today',
  '/me': 'supply',
  '/demo/me': 'supply',
} as const

const AREA_PREFIXES: ReadonlyArray<readonly [string, AppArea]> = [
  // Records must precede the broader event/member prefixes.
  ['/admin/dashboard/content-compliance', 'records'],
  ['/admin/dashboard/killbot', 'records'],
  ['/admin/dashboard/stats', 'records'],
  ['/admin/dashboard/audit', 'records'],
  ['/me/content-compliance', 'records'],
  ['/me/activity', 'records'],
  ['/leaderboard', 'records'],
  ['/battles', 'records'],
  ['/archive', 'records'],
  ['/demo/stats', 'records'],
  ['/demo/audit', 'records'],
  ['/demo/leaderboard', 'records'],
  ['/demo/battles', 'records'],

  ['/admin/dashboard/guild-profile', 'guild'],
  ['/admin/dashboard/permissions', 'guild'],
  ['/admin/dashboard/settings', 'guild'],
  ['/admin/dashboard/backup', 'guild'],
  ['/admin/dashboard/guide', 'guild'],
  ['/onboarding', 'guild'],
  ['/onboard', 'guild'],
  ['/welcome-language', 'guild'],
  ['/me/profile', 'guild'],
  ['/me/settings', 'guild'],
  ['/members', 'guild'],
  ['/g', 'guild'],
  ['/demo/guild-profile', 'guild'],
  ['/demo/permissions', 'guild'],
  ['/demo/settings', 'guild'],
  ['/demo/backup', 'guild'],
  ['/demo/guide', 'guild'],
  ['/demo/members', 'guild'],
  ['/demo/me/settings', 'guild'],

  ['/admin/dashboard/approvals', 'supply'],
  ['/admin/dashboard/regear', 'supply'],
  ['/admin/dashboard/exchanges', 'supply'],
  ['/admin/dashboard/donations', 'supply'],
  ['/admin/dashboard/settlements', 'supply'],
  ['/admin/dashboard/craft', 'supply'],
  ['/admin/dashboard/inventory', 'supply'],
  ['/admin/dashboard/shop', 'supply'],
  ['/admin/dashboard/baseline', 'supply'],
  ['/admin/dashboard/siphon', 'supply'],
  ['/admin/dashboard/loot-audit', 'supply'],
  ['/admin/dashboard/regear-windows', 'supply'],
  ['/admin/dashboard/role-rewards', 'supply'],
  ['/me/wallet', 'supply'],
  ['/me/siphon', 'supply'],
  ['/me/requests', 'supply'],
  ['/me/settlements', 'supply'],
  ['/craft', 'supply'],
  ['/market', 'supply'],
  ['/regear', 'supply'],
  ['/shop', 'supply'],
  ['/demo/member-regear', 'supply'],
  ['/demo/regear', 'supply'],
  ['/demo/craft', 'supply'],
  ['/demo/inventory', 'supply'],
  ['/demo/shop', 'supply'],
  ['/demo/siphon', 'supply'],
  ['/demo/loot-audit', 'supply'],
  ['/demo/me', 'supply'],

  ['/admin/dashboard/events', 'operations'],
  ['/admin/dashboard/builds', 'operations'],
  ['/admin/dashboard/tactics', 'operations'],
  ['/events', 'operations'],
  ['/tactics', 'operations'],
  ['/demo/member-events', 'operations'],
  ['/demo/events', 'operations'],
  ['/demo/builds', 'operations'],
] as const

export function normalizeAppPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  if (path === '/') return path
  return path.endsWith('/') ? path.slice(0, -1) : path
}

export function resolveAppArea(pathname: string): AppArea | null {
  const path = normalizeAppPath(pathname)
  const exact = EXACT_AREA_ROUTES[path]
  if (exact) return exact

  // Event reports are record detail pages nested below the broader event
  // workspace. Resolve them before the `/events` prefix claims the route.
  if (/^\/(?:demo\/)?events\/[^/]+\/report$/.test(path)) return 'records'

  const match = AREA_PREFIXES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))
  return match?.[1] ?? null
}

export function getAppAreaDescriptor(area: AppArea): AppAreaDescriptor {
  const descriptor = APP_AREA_DESCRIPTORS.find((item) => item.key === area)
  if (!descriptor) throw new Error(`Unknown app area: ${area}`)
  return descriptor
}
