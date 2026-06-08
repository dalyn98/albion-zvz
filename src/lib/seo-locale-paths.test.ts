import { describe, expect, it } from 'vitest'
import {
  buildSeoFeatureLanguageAlternates,
  getSeoFeatureCanonicalPathname,
  getSeoFeatureInternalPathname,
  replaceSeoFeatureLocale,
} from './seo-locale-paths'

describe('SEO locale paths', () => {
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
})
