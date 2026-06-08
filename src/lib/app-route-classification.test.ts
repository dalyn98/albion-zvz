import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isIndexablePathname,
  isPublicEventDetailPathname,
  isPublicPathname,
} from './app-route-classification'

function appSourceFiles(dir = join(process.cwd(), 'src', 'app')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return appSourceFiles(fullPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

describe('app route classification', () => {
  it('treats shareable event detail links as public', () => {
    expect(isPublicEventDetailPathname('/events/event-1')).toBe(true)
    expect(isPublicEventDetailPathname('/events/event-1/')).toBe(true)
    expect(isPublicPathname('/events/event-1')).toBe(true)
  })

  it('keeps event list and nested operational pages behind their existing guards', () => {
    expect(isPublicPathname('/events')).toBe(false)
    expect(isPublicPathname('/events/event-1/report')).toBe(false)
    expect(isPublicPathname('/events/event-1/party/1')).toBe(false)
    expect(isPublicPathname('/admin/dashboard/events/event-1')).toBe(false)
  })

  it('preserves existing public route behavior', () => {
    expect(isPublicPathname('/public/landing')).toBe(true)
    expect(isPublicPathname('/demo/events/evt-1')).toBe(true)
    expect(isPublicPathname('/guild-login')).toBe(true)
    expect(isPublicPathname('/invite/open')).toBe(true)
  })

  it('keeps sitemap marketing demo routes indexable for metadata robots', () => {
    expect(isIndexablePathname('/demo')).toBe(true)
    expect(isIndexablePathname('/demo/loot-audit')).toBe(true)
    expect(isIndexablePathname('/demo/me/siphon?tab=ledger')).toBe(true)
  })

  it('indexes feature marketing pages for SEO landing traffic', () => {
    expect(isIndexablePathname('/features')).toBe(true)
    expect(isIndexablePathname('/features/auto-regear')).toBe(true)
    expect(isIndexablePathname('/public/features')).toBe(true)
    expect(isIndexablePathname('/public/features/auto-regear')).toBe(true)
  })

  it('does not index non-page marketing helper routes', () => {
    expect(isIndexablePathname('/g')).toBe(false)
    expect(isIndexablePathname('/public/g')).toBe(false)
  })

  it('keeps operational app routes out of search indexing', () => {
    expect(isIndexablePathname('/admin/dashboard')).toBe(false)
    expect(isIndexablePathname('/events/event-1')).toBe(false)
    expect(isIndexablePathname('/me')).toBe(false)
    expect(isIndexablePathname('/api/health')).toBe(false)
  })

  it('does not opt app routes into force-static rendering', () => {
    const offenders = appSourceFiles()
      .filter((filePath) =>
        /^\s*export\s+const\s+dynamic\s*=\s*['"]force-static['"]/m.test(
          readFileSync(filePath, 'utf8'),
        ),
      )
      .map((filePath) => filePath.replace(`${process.cwd()}/`, ''))

    expect(offenders).toEqual([])
  })
})
