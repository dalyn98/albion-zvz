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

const DEMO_DETAIL_ROUTE_ALLOWLIST = new Set([
  '/demo/guide',
  '/demo/settings',
  '/demo/loot-audit',
  '/demo/audit',
  '/demo/craft',
  '/demo/shop',
  '/demo/siphon',
])

export function resolveLegacyDemoRedirect(pathname: string): string | null {
  const normalizedPathname = pathname.replace(/\/+$/, '')
  if (!normalizedPathname.startsWith('/demo/')) return null
  if (DEMO_DETAIL_ROUTE_ALLOWLIST.has(normalizedPathname)) return null

  const segments = normalizedPathname.split('/').filter(Boolean)
  const twoSegmentKey = `/${segments.slice(0, 2).join('/')}`
  const threeSegmentKey = `/${segments.slice(0, 3).join('/')}`
  const scenario = LEGACY_DEMO_SCENARIOS[threeSegmentKey] ?? LEGACY_DEMO_SCENARIOS[twoSegmentKey]

  return scenario ? `/demo?scenario=${scenario}` : '/demo'
}
