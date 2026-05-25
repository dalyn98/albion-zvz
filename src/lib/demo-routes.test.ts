import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_SITEMAP_ROUTES } from './demo-routes'

const APP_DIR = join(process.cwd(), 'src/app')
const DEMO_DIR = join(APP_DIR, 'demo')
const EXCLUDED_STATIC_DEMO_ROUTES = new Set([
  // Redirect shim for the canonical requests demo page.
  '/demo/me/settlements',
])

function routeToPagePath(route: string): string {
  const segments = route.split('/').filter(Boolean)
  if (segments.length === 1 && segments[0] === 'demo') {
    return join(APP_DIR, 'demo/page.tsx')
  }
  return join(APP_DIR, ...segments, 'page.tsx')
}

function pagePathToRoute(pagePath: string): string {
  const route = pagePath
    .replace(APP_DIR, '')
    .replace(/\/page\.tsx$/, '')

  return route === '/demo' ? '/demo' : route
}

function collectDemoPagePaths(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectDemoPagePaths(path)
    }

    return entry.name === 'page.tsx' ? [path] : []
  })
}

describe('DEMO_SITEMAP_ROUTES', () => {
  it('contains only concrete demo pages that exist', () => {
    expect(DEMO_SITEMAP_ROUTES.length).toBeGreaterThan(0)
    expect(new Set(DEMO_SITEMAP_ROUTES).size).toBe(DEMO_SITEMAP_ROUTES.length)

    for (const route of DEMO_SITEMAP_ROUTES) {
      expect(route.startsWith('/demo')).toBe(true)
      expect(route).not.toContain('[')
      expect(existsSync(routeToPagePath(route)), route).toBe(true)
    }
  })

  it('keeps every indexable static demo page in the sitemap list', () => {
    const expectedRoutes = collectDemoPagePaths(DEMO_DIR)
      .map(pagePathToRoute)
      .filter((route) => !route.includes('['))
      .filter((route) => !EXCLUDED_STATIC_DEMO_ROUTES.has(route))
      .sort()

    expect([...DEMO_SITEMAP_ROUTES].sort()).toEqual(expectedRoutes)
  })
})
