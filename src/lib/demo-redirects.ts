const LEGACY_DEMO_SCENARIOS: Record<string, string> = {
  '/demo/events': 'events',
  '/demo/member-events': 'events',
  '/demo/builds': 'events',
  '/demo/battles': 'stats',
  '/demo/leaderboard': 'stats',
  '/demo/members': 'stats',
  '/demo/stats': 'stats',
  '/demo/me/profile': 'stats',
  '/demo/regear': 'regear',
  '/demo/member-regear': 'regear',
  '/demo/me/requests': 'regear',
}

export const DEMO_DETAIL_ROUTE_PATHS = [
  '/demo/events',
  '/demo/builds',
  '/demo/battles',
  '/demo/leaderboard',
  '/demo/members',
  '/demo/member-events',
  '/demo/member-regear',
  '/demo/me',
  '/demo/me/profile',
  '/demo/me/requests',
  '/demo/me/settings',
  '/demo/me/settlements',
  '/demo/me/siphon',
  '/demo/guide',
  '/demo/settings',
  '/demo/loot-audit',
  '/demo/audit',
  '/demo/craft',
  '/demo/regear',
  '/demo/shop',
  '/demo/siphon',
  '/demo/stats',
  '/demo/guild-profile',
  '/demo/permissions',
  '/demo/inventory',
  '/demo/backup',
] as const

const DEMO_DETAIL_ROUTE_ALLOWLIST = new Set<string>(DEMO_DETAIL_ROUTE_PATHS)

function normalizeDemoPathname(pathname: string): string {
  const normalizedPathname = pathname.split('?')[0]?.replace(/\/+$/, '') || '/'
  return normalizedPathname === '/demo' ? '/demo' : normalizedPathname
}

function resolveLegacyDemoScenario(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean)
  const twoSegmentKey = `/${segments.slice(0, 2).join('/')}`
  const threeSegmentKey = `/${segments.slice(0, 3).join('/')}`
  return LEGACY_DEMO_SCENARIOS[threeSegmentKey] ?? LEGACY_DEMO_SCENARIOS[twoSegmentKey] ?? null
}

function findAllowedDetailRoot(pathname: string): string | null {
  if (DEMO_DETAIL_ROUTE_ALLOWLIST.has(pathname)) return pathname
  return DEMO_DETAIL_ROUTE_PATHS.find(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  ) ?? null
}

export function isDemoDetailRoute(pathname: string): boolean {
  return DEMO_DETAIL_ROUTE_ALLOWLIST.has(normalizeDemoPathname(pathname))
}

export function resolveDemoNavigationHref(href: string): string | null {
  const parsed = new URL(href, 'https://demo.local')
  const pathname = normalizeDemoPathname(parsed.pathname)

  if (pathname === '/demo') return `/demo${parsed.search}`

  const detailRoot = findAllowedDetailRoot(pathname)
  if (detailRoot) return `${detailRoot}${parsed.search}`

  const scenario = resolveLegacyDemoScenario(pathname)
  return scenario ? `/demo?scenario=${scenario}` : null
}

export function resolveLegacyDemoRedirect(pathname: string): string | null {
  const normalizedPathname = normalizeDemoPathname(pathname)
  if (!normalizedPathname.startsWith('/demo/')) return null
  if (isDemoDetailRoute(normalizedPathname)) return null

  const scenario = resolveLegacyDemoScenario(normalizedPathname)

  return scenario ? `/demo?scenario=${scenario}` : '/demo'
}
