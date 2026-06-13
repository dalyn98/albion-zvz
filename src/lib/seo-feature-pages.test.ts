import { describe, expect, it } from 'vitest'
import {
  FEATURE_PAGE_SLUGS,
  FEATURE_LOCALIZED_SITEMAP_ROUTES,
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

  it('maps every supported locale into feature sitemap routes', () => {
    expect(FEATURE_LOCALIZED_SITEMAP_ROUTES).toContain('/ko/features')
    expect(FEATURE_LOCALIZED_SITEMAP_ROUTES).toContain('/en/features/auto-regear')
    expect(FEATURE_LOCALIZED_SITEMAP_ROUTES).toContain('/ja/features/guild-shop')
    expect(FEATURE_LOCALIZED_SITEMAP_ROUTES).toContain('/zh/features/guild-stats')
    expect(FEATURE_LOCALIZED_SITEMAP_ROUTES).toHaveLength(
      FEATURE_SITEMAP_ROUTES.length * 4,
    )
  })

  it('keeps every page tied to related docs and search terms', () => {
    for (const slug of FEATURE_PAGE_SLUGS) {
      const page = getSeoFeaturePage(slug)
      expect(page.relatedDocs.length).toBeGreaterThan(0)
      expect(page.keywordMessageKeys.length).toBeGreaterThanOrEqual(3)
    }
  })
})
