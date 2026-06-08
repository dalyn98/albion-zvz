import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSeoFeatureLanguageAlternates,
  buildFaqStructuredData,
  getCanonicalUrlForPathname,
  serializeJsonLd,
} from './seo-metadata'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('seo metadata helpers', () => {
  it('normalizes internal public rewrite paths to clean canonical URLs', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getCanonicalUrlForPathname('/public/landing')).toBe('https://albion-guildmanager.com/')
    expect(getCanonicalUrlForPathname('/public/pricing')).toBe('https://albion-guildmanager.com/pricing')
    expect(getCanonicalUrlForPathname('/public/features')).toBe(
      'https://albion-guildmanager.com/features',
    )
    expect(getCanonicalUrlForPathname('/public/features/auto-regear?from=nav')).toBe(
      'https://albion-guildmanager.com/features/auto-regear',
    )
    expect(getCanonicalUrlForPathname('/ko/features/auto-regear')).toBe(
      'https://albion-guildmanager.com/ko/features/auto-regear',
    )
    expect(getCanonicalUrlForPathname('/public/docs/events/create')).toBe(
      'https://albion-guildmanager.com/docs/events/create',
    )
    expect(getCanonicalUrlForPathname('/public/g/menhera?tab=stats')).toBe(
      'https://albion-guildmanager.com/g/menhera',
    )
  })

  it('builds feature hreflang alternates for localized SEO URLs', () => {
    expect(buildSeoFeatureLanguageAlternates('/en/features/guild-shop')).toEqual({
      'x-default': 'https://albion-guildmanager.com/features/guild-shop',
      ko: 'https://albion-guildmanager.com/ko/features/guild-shop',
      ja: 'https://albion-guildmanager.com/ja/features/guild-shop',
      en: 'https://albion-guildmanager.com/en/features/guild-shop',
      zh: 'https://albion-guildmanager.com/zh/features/guild-shop',
    })
    expect(buildSeoFeatureLanguageAlternates('/pricing')).toBeNull()
  })

  it('does not canonicalize non-indexable app routes or redirect helper routes', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getCanonicalUrlForPathname('/admin/dashboard')).toBeNull()
    expect(getCanonicalUrlForPathname('/events/event-1')).toBeNull()
    expect(getCanonicalUrlForPathname('/g')).toBeNull()
  })

  it('escapes JSON-LD payloads before dangerous HTML insertion', () => {
    const json = serializeJsonLd(buildFaqStructuredData({
      url: 'https://albion-guildmanager.com/faq',
      items: [{ question: '<script>', answer: 'safe < answer' }],
    }))

    expect(json).not.toContain('<script>')
    expect(json).toContain('\\u003cscript>')
    expect(json).toContain('safe \\u003c answer')
  })
})
