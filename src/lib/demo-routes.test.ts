import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isDemoDetailRoute,
  resolveDemoNavigationHref,
  resolveLegacyDemoRedirect,
} from './demo-redirects'
import { DEMO_SITEMAP_ROUTES } from './demo-routes'

const APP_DIR = join(process.cwd(), 'src/app')
const PUBLIC_SHELL_DIR = join(APP_DIR, '(public-shell)')

function routeToPagePath(route: string): string {
  const segments = route.split('/').filter(Boolean)
  if (segments.length === 1 && segments[0] === 'demo') {
    return join(PUBLIC_SHELL_DIR, 'demo/page.tsx')
  }
  return join(PUBLIC_SHELL_DIR, ...segments, 'page.tsx')
}

describe('DEMO_SITEMAP_ROUTES', () => {
  it('contains the single focused demo page', () => {
    expect(DEMO_SITEMAP_ROUTES).toEqual(['/demo'])

    for (const route of DEMO_SITEMAP_ROUTES) {
      expect(route.startsWith('/demo')).toBe(true)
      expect(route).not.toContain('[')
      expect(existsSync(routeToPagePath(route)), route).toBe(true)
    }
  })

  it('keeps legacy demo clones out of the sitemap list', () => {
    expect(DEMO_SITEMAP_ROUTES).not.toContain('/demo/loot-audit')
    expect(DEMO_SITEMAP_ROUTES).not.toContain('/demo/regear')
    expect(DEMO_SITEMAP_ROUTES).not.toContain('/demo/events')
  })
})

describe('resolveLegacyDemoRedirect', () => {
  it('keeps selected detailed demo pages renderable outside the sitemap', () => {
    expect(resolveLegacyDemoRedirect('/demo/guide')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/guide/')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/settings')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/loot-audit')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/audit')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/craft')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/shop')).toBeNull()
    expect(resolveLegacyDemoRedirect('/demo/siphon')).toBeNull()
  })

  it('preserves focused legacy scenario redirects', () => {
    expect(resolveLegacyDemoRedirect('/demo/member-events')).toBe('/demo?scenario=events')
    expect(resolveLegacyDemoRedirect('/demo/battles')).toBe('/demo?scenario=stats')
    expect(resolveLegacyDemoRedirect('/demo/me/requests')).toBe('/demo?scenario=regear')
  })

  it('collapses old unapproved demo clones to the focused demo page', () => {
    expect(resolveLegacyDemoRedirect('/demo/inventory')).toBe('/demo')
    expect(resolveLegacyDemoRedirect('/demo/unknown/deep-link')).toBe('/demo')
  })
})

describe('demo navigation route policy', () => {
  it('identifies only exact allowlisted detail pages as renderable details', () => {
    expect(isDemoDetailRoute('/demo/guide')).toBe(true)
    expect(isDemoDetailRoute('/demo/settings?tab=guild')).toBe(true)
    expect(isDemoDetailRoute('/demo/craft/queue')).toBe(false)
    expect(isDemoDetailRoute('/demo/inventory')).toBe(false)
  })

  it('normalizes sidebar links to reachable demo surfaces', () => {
    expect(resolveDemoNavigationHref('/demo')).toBe('/demo')
    expect(resolveDemoNavigationHref('/demo/settings?tab=guild')).toBe('/demo/settings?tab=guild')
    expect(resolveDemoNavigationHref('/demo/craft/queue')).toBe('/demo/craft')
    expect(resolveDemoNavigationHref('/demo/member-events')).toBe('/demo?scenario=events')
    expect(resolveDemoNavigationHref('/demo/battles')).toBe('/demo?scenario=stats')
    expect(resolveDemoNavigationHref('/demo/me/requests')).toBe('/demo?scenario=regear')
    expect(resolveDemoNavigationHref('/demo/inventory')).toBeNull()
  })
})
