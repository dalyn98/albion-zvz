import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isPublicBattleGroupPathname,
  isIndexablePathname,
  isPublicEventDetailPathname,
  isPublicPathname,
  shouldSkipRootSessionForPathname,
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
    expect(isPublicPathname('/public/zvz-battles')).toBe(true)
    expect(isPublicPathname('/demo/events/evt-1')).toBe(true)
    expect(isPublicPathname('/guild-login')).toBe(true)
    expect(isPublicPathname('/invite/open')).toBe(true)
  })

  it('marks only standalone public shell routes as root-session skippable', () => {
    expect(shouldSkipRootSessionForPathname('/public/landing')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/public/zvz-battles')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/public/features/auto-regear')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/public/docs/getting-started')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/public/u/member-1')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/demo/regear')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/invite/open')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/public/g/menhera/battles/multi')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/g/menhera/battles/multi')).toBe(true)

    expect(shouldSkipRootSessionForPathname('/public/g/menhera')).toBe(false)
    expect(shouldSkipRootSessionForPathname('/events/event-1')).toBe(false)
    expect(shouldSkipRootSessionForPathname('/members')).toBe(false)
    expect(shouldSkipRootSessionForPathname('/onboard')).toBe(false)
  })

  it('treats shared battle group reports as public but not indexable', () => {
    expect(isPublicBattleGroupPathname('/g/menhera/battles/multi')).toBe(true)
    expect(isPublicBattleGroupPathname('/public/g/menhera/battles/multi')).toBe(true)
    expect(isPublicPathname('/public/g/menhera/battles/multi')).toBe(true)
    expect(isIndexablePathname('/g/menhera/battles/multi')).toBe(false)
    expect(isIndexablePathname('/public/g/menhera/battles/multi')).toBe(false)
  })

  it('keeps only the focused demo surface indexable for metadata robots', () => {
    expect(isIndexablePathname('/demo')).toBe(true)
    expect(isIndexablePathname('/demo/loot-audit')).toBe(false)
    expect(isIndexablePathname('/demo/me/siphon?tab=ledger')).toBe(false)
  })

  it('keeps detailed demo pages out of indexable response headers', () => {
    const nextConfigSource = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

    expect(nextConfigSource).toContain("{ source: '/demo', headers: [indexHeader] }")
    expect(nextConfigSource).not.toContain("{ source: '/demo/:path*', headers: [indexHeader] }")
  })

  it('indexes feature marketing pages for SEO landing traffic', () => {
    expect(isIndexablePathname('/features')).toBe(true)
    expect(isIndexablePathname('/zvz-battles')).toBe(false)
    expect(isIndexablePathname('/features/auto-regear')).toBe(true)
    expect(isPublicPathname('/ko/features')).toBe(true)
    expect(isPublicPathname('/en/features/auto-regear')).toBe(true)
    expect(isIndexablePathname('/ko/features')).toBe(true)
    expect(isIndexablePathname('/en/features/auto-regear')).toBe(true)
    expect(isIndexablePathname('/public/features')).toBe(true)
    expect(isIndexablePathname('/public/zvz-battles')).toBe(false)
    expect(isIndexablePathname('/public/features/auto-regear')).toBe(true)
  })

  it('indexes localized docs home but not untranslated localized docs details', () => {
    const nextConfigSource = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')

    expect(isPublicPathname('/en/docs')).toBe(true)
    expect(isPublicPathname('/ja/docs/regear/auto')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/en/docs')).toBe(true)
    expect(shouldSkipRootSessionForPathname('/ja/docs/regear/auto')).toBe(true)

    expect(isIndexablePathname('/docs')).toBe(true)
    expect(isIndexablePathname('/docs/regear/auto')).toBe(true)
    expect(isIndexablePathname('/en/docs')).toBe(true)
    expect(isIndexablePathname('/ja/docs/regear/auto')).toBe(false)
    expect(nextConfigSource).toContain(
      "{ source: '/:locale(ko|ja|en|zh)/docs', headers: cachedIndexHeaders }",
    )
    expect(nextConfigSource).not.toContain(
      "{ source: '/:locale(ko|ja|en|zh)/docs/:path*', headers: cachedIndexHeaders }",
    )
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
