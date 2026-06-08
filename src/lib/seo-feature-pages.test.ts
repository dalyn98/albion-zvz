import { describe, expect, it } from 'vitest'
import {
  FEATURE_PAGE_SLUGS,
  FEATURE_SITEMAP_ROUTES,
  getSeoFeaturePage,
} from './seo-feature-pages'

describe('SEO feature pages', () => {
  it('exposes stable unique slugs for high-intent search landing pages', () => {
    expect(FEATURE_PAGE_SLUGS).toEqual([
      'discord-bot',
      'auto-regear',
      'zvz-killboard',
      'guild-events',
      'guild-shop',
      'guild-stats',
    ])
    expect(new Set(FEATURE_PAGE_SLUGS).size).toBe(FEATURE_PAGE_SLUGS.length)
  })

  it('maps feature pages into canonical sitemap routes', () => {
    expect(FEATURE_SITEMAP_ROUTES).toEqual([
      '/features',
      '/features/discord-bot',
      '/features/auto-regear',
      '/features/zvz-killboard',
      '/features/guild-events',
      '/features/guild-shop',
      '/features/guild-stats',
    ])
  })

  it('keeps every page tied to related docs and search terms', () => {
    for (const slug of FEATURE_PAGE_SLUGS) {
      const page = getSeoFeaturePage(slug)
      expect(page.relatedDocs.length).toBeGreaterThan(0)
      expect(page.keywords.length).toBeGreaterThanOrEqual(3)
    }
  })
})
