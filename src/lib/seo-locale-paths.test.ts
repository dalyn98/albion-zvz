import { describe, expect, it } from 'vitest'
import {
  buildSeoMarketingLanguageAlternates,
  buildSeoDocsHomeLanguageAlternates,
  buildSeoFeatureLanguageAlternates,
  getSeoDocsCanonicalPathname,
  getSeoDocsInternalPathname,
  getSeoFeatureCanonicalPathname,
  getSeoFeatureInternalPathname,
  getSeoMarketingCanonicalPathname,
  getSeoMarketingInternalPathname,
  getSeoZvzRecordCanonicalPathname,
  getSeoZvzRecordInternalPathname,
  replaceSeoDocsLocale,
  replaceSeoFeatureLocale,
  replaceSeoMarketingLocale,
} from './seo-locale-paths'

describe('SEO locale paths', () => {
  it('maps locale-prefixed static marketing pages to their shared internal routes', () => {
    expect(getSeoMarketingCanonicalPathname('/pricing')).toBe('/pricing')
    expect(getSeoMarketingCanonicalPathname('/ja/pricing')).toBe('/ja/pricing')
    expect(getSeoMarketingCanonicalPathname('/zh')).toBe('/zh')
    expect(getSeoMarketingCanonicalPathname('/public/faq')).toBe('/faq')
    expect(getSeoMarketingInternalPathname('/en/terms')).toBe('/public/terms')
    expect(getSeoMarketingInternalPathname('/ko')).toBe('/public/landing')
    expect(getSeoMarketingInternalPathname('/ja/features')).toBeNull()
  })

  it('builds reciprocal hreflang alternates for translated static marketing pages', () => {
    expect(buildSeoMarketingLanguageAlternates('/zh/privacy')).toEqual({
      'x-default': 'https://albion-guildmanager.com/privacy',
      ko: 'https://albion-guildmanager.com/ko/privacy',
      ja: 'https://albion-guildmanager.com/ja/privacy',
      en: 'https://albion-guildmanager.com/en/privacy',
      zh: 'https://albion-guildmanager.com/zh/privacy',
    })
  })

  it('maps permanent guild and alliance record paths without making them static pages', () => {
    expect(
      getSeoZvzRecordCanonicalPathname(
        '/ko/zvz-battles/guild/east/guild-id?week=2026-07-27',
      ),
    ).toBe('/ko/zvz-battles/guild/east/guild-id')
    expect(
      getSeoZvzRecordInternalPathname(
        '/en/zvz-battles/alliance/west/alliance-id',
      ),
    ).toBe('/public/zvz-battles/alliance/west/alliance-id')
    expect(
      getSeoZvzRecordCanonicalPathname(
        '/public/zvz-battles/guild/europe/guild-id',
      ),
    ).toBe('/zvz-battles/guild/europe/guild-id')
    expect(getSeoZvzRecordInternalPathname('/zvz-battles/guild/invalid/id')).toBeNull()
    expect(
      replaceSeoMarketingLocale(
        '/public/zvz-battles/alliance/east/alliance-id',
        'ja',
      ),
    ).toBe('/ja/zvz-battles/alliance/east/alliance-id')
  })

  it('normalizes default and locale-prefixed feature paths', () => {
    expect(getSeoFeatureCanonicalPathname('/features')).toBe('/features')
    expect(getSeoFeatureCanonicalPathname('/features/auto-regear?from=nav')).toBe(
      '/features/auto-regear',
    )
    expect(getSeoFeatureCanonicalPathname('/ko/features')).toBe('/ko/features')
    expect(getSeoFeatureCanonicalPathname('/en/features/auto-regear')).toBe(
      '/en/features/auto-regear',
    )
    expect(getSeoFeatureCanonicalPathname('/public/features/auto-regear')).toBe(
      '/features/auto-regear',
    )
    expect(getSeoFeatureCanonicalPathname('/fr/features/auto-regear')).toBeNull()
  })

  it('maps locale-prefixed feature URLs to the shared internal public route', () => {
    expect(getSeoFeatureInternalPathname('/ko/features')).toBe('/public/features')
    expect(getSeoFeatureInternalPathname('/ja/features/guild-shop')).toBe(
      '/public/features/guild-shop',
    )
    expect(getSeoFeatureInternalPathname('/pricing')).toBeNull()
  })

  it('builds reciprocal hreflang alternates for every feature page variant', () => {
    expect(buildSeoFeatureLanguageAlternates('/ko/features/auto-regear')).toEqual({
      'x-default': 'https://albion-guildmanager.com/features/auto-regear',
      ko: 'https://albion-guildmanager.com/ko/features/auto-regear',
      ja: 'https://albion-guildmanager.com/ja/features/auto-regear',
      en: 'https://albion-guildmanager.com/en/features/auto-regear',
      zh: 'https://albion-guildmanager.com/zh/features/auto-regear',
    })
  })

  it('switches feature page language URLs without touching other routes', () => {
    expect(replaceSeoFeatureLocale('/features/auto-regear', 'en')).toBe(
      '/en/features/auto-regear',
    )
    expect(replaceSeoFeatureLocale('/ko/features/auto-regear', 'ja')).toBe(
      '/ja/features/auto-regear',
    )
    expect(replaceSeoFeatureLocale('/docs/regear/auto', 'en')).toBeNull()
  })

  it('normalizes default and locale-prefixed docs paths', () => {
    expect(getSeoDocsCanonicalPathname('/docs')).toBe('/docs')
    expect(getSeoDocsCanonicalPathname('/docs/regear/auto?from=nav')).toBe(
      '/docs/regear/auto',
    )
    expect(getSeoDocsCanonicalPathname('/en/docs')).toBe('/en/docs')
    expect(getSeoDocsCanonicalPathname('/ja/docs/regear/auto')).toBe(
      '/ja/docs/regear/auto',
    )
    expect(getSeoDocsCanonicalPathname('/public/docs/regear/auto')).toBe(
      '/docs/regear/auto',
    )
    expect(getSeoDocsCanonicalPathname('/fr/docs/regear/auto')).toBeNull()
  })

  it('maps locale-prefixed docs URLs to the shared internal public route', () => {
    expect(getSeoDocsInternalPathname('/ko/docs')).toBe('/public/docs')
    expect(getSeoDocsInternalPathname('/en/docs/regear/auto')).toBe(
      '/public/docs/regear/auto',
    )
    expect(getSeoDocsInternalPathname('/faq')).toBeNull()
  })

  it('builds reciprocal hreflang alternates only for the translated docs home', () => {
    expect(buildSeoDocsHomeLanguageAlternates('/ja/docs')).toEqual({
      'x-default': 'https://albion-guildmanager.com/docs',
      ko: 'https://albion-guildmanager.com/ko/docs',
      ja: 'https://albion-guildmanager.com/ja/docs',
      en: 'https://albion-guildmanager.com/en/docs',
      zh: 'https://albion-guildmanager.com/zh/docs',
    })
    expect(buildSeoDocsHomeLanguageAlternates('/en/docs/regear/auto')).toBeNull()
  })

  it('switches docs page language URLs and leaves unrelated routes alone', () => {
    expect(replaceSeoDocsLocale('/docs', 'en')).toBe('/en/docs')
    expect(replaceSeoDocsLocale('/ko/docs/regear/auto', 'ja')).toBe(
      '/ja/docs/regear/auto',
    )
    expect(replaceSeoDocsLocale('/pricing', 'en')).toBeNull()

    expect(replaceSeoMarketingLocale('/features/auto-regear', 'zh')).toBe(
      '/zh/features/auto-regear',
    )
    expect(replaceSeoMarketingLocale('/docs', 'zh')).toBe('/zh/docs')
    expect(replaceSeoMarketingLocale('/pricing', 'zh')).toBe('/zh/pricing')
    expect(replaceSeoMarketingLocale('/en', 'ja')).toBe('/ja')
    expect(replaceSeoMarketingLocale('/public/faq', 'en')).toBe('/en/faq')
  })
})
