import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSeoDocsHomeLanguageAlternates,
  buildSeoFeatureLanguageAlternates,
  buildFaqStructuredData,
  buildCanonicalRootMetadata,
  buildPublicLandingMetadata,
  getCanonicalUrlForPathname,
  serializeJsonLd,
} from './seo-metadata'

afterEach(() => {
  vi.unstubAllEnvs()
})

const ROOT = process.cwd()

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
    expect(getCanonicalUrlForPathname('/en/docs')).toBe(
      'https://albion-guildmanager.com/en/docs',
    )
    expect(getCanonicalUrlForPathname('/en/docs/events/create')).toBeNull()
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

  it('builds docs home hreflang alternates for the translated minimum docs set', () => {
    expect(buildSeoDocsHomeLanguageAlternates('/en/docs')).toEqual({
      'x-default': 'https://albion-guildmanager.com/docs',
      ko: 'https://albion-guildmanager.com/ko/docs',
      ja: 'https://albion-guildmanager.com/ja/docs',
      en: 'https://albion-guildmanager.com/en/docs',
      zh: 'https://albion-guildmanager.com/zh/docs',
    })
    expect(buildSeoDocsHomeLanguageAlternates('/en/docs/events/create')).toBeNull()
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

  it('exposes Google verification and indexable defaults from the root metadata', () => {
    const metadata = buildCanonicalRootMetadata(
      '<meta name="google-site-verification" content="abc_123-XYZ" />',
    )

    expect(metadata.metadataBase?.toString()).toBe('https://albion-guildmanager.com/')
    expect(metadata.title).toBe('AlbionGuildManager — Albion Online 길드 운영 도구')
    expect(metadata.description).toContain('ZvZ 킬보드')
    expect(metadata.icons).toEqual({
      icon: [{ url: '/icon.png', sizes: '192x192', type: 'image/png' }],
      apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
    })
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(metadata.verification).toEqual({ google: 'abc_123-XYZ' })
    expect(metadata.alternates).toBeUndefined()
  })

  it('keeps a stable, high-resolution square favicon available to search crawlers', () => {
    const iconPath = join(ROOT, 'public/icon.png')
    const fallbackPath = join(ROOT, 'public/favicon.ico')

    expect(existsSync(iconPath)).toBe(true)
    expect(existsSync(fallbackPath)).toBe(true)

    const icon = readFileSync(iconPath)
    expect(icon.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(icon.readUInt32BE(16)).toBe(192)
    expect(icon.readUInt32BE(20)).toBe(192)
  })

  it('adds a canonical URL only for the public landing metadata', () => {
    const metadata = buildPublicLandingMetadata('abc_123-XYZ')

    expect(metadata.alternates).toEqual({
      canonical: 'https://albion-guildmanager.com/',
    })
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: 'https://albion-guildmanager.com/',
    })
  })
})
