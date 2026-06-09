import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_SITEMAP_ROUTES } from './demo-routes'

const APP_DIR = join(process.cwd(), 'src/app')

function routeToPagePath(route: string): string {
  const segments = route.split('/').filter(Boolean)
  if (segments.length === 1 && segments[0] === 'demo') {
    return join(APP_DIR, 'demo/page.tsx')
  }
  return join(APP_DIR, ...segments, 'page.tsx')
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
