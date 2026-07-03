import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMarketingPathsForHost, resolveMarketingHref } from './marketing-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getMarketingPathsForHost', () => {
  it('uses clean canonical paths on the official root domain', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('albion-guildmanager.com')).toEqual({
      home: '/',
      features: '/features',
      zvzBattles: '/zvz-battles',
      pricing: '/pricing',
      faq: '/faq',
      docs: '/docs',
      demo: '/demo',
      privacy: '/privacy',
      terms: '/terms',
      guildPage: '/g',
    })
  })

  it('uses locale-prefixed SEO paths on the official root domain when SEO locale is active', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('albion-guildmanager.com', 'en')).toEqual({
      home: '/',
      features: '/en/features',
      zvzBattles: '/zvz-battles',
      pricing: '/pricing',
      faq: '/faq',
      docs: '/en/docs',
      demo: '/demo',
      privacy: '/privacy',
      terms: '/terms',
      guildPage: '/g',
    })
  })

  it('uses official root absolute URLs on tenant subdomains', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('menhera.albion-guildmanager.com')).toEqual({
      home: 'https://albion-guildmanager.com/',
      features: 'https://albion-guildmanager.com/features',
      zvzBattles: 'https://albion-guildmanager.com/zvz-battles',
      pricing: 'https://albion-guildmanager.com/pricing',
      faq: 'https://albion-guildmanager.com/faq',
      docs: 'https://albion-guildmanager.com/docs',
      demo: 'https://albion-guildmanager.com/demo',
      privacy: 'https://albion-guildmanager.com/privacy',
      terms: 'https://albion-guildmanager.com/terms',
      guildPage: 'https://albion-guildmanager.com/g',
    })
  })

  it('uses localized official root SEO URLs on tenant subdomains when SEO locale is active', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    const paths = getMarketingPathsForHost('menhera.albion-guildmanager.com', 'ja')

    expect(paths.features).toBe('https://albion-guildmanager.com/ja/features')
    expect(paths.docs).toBe('https://albion-guildmanager.com/ja/docs')
  })

  it('keeps direct public paths on localhost and previews', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('localhost:3000')).toEqual({
      home: '/public/landing',
      features: '/public/features',
      zvzBattles: '/public/zvz-battles',
      pricing: '/public/pricing',
      faq: '/public/faq',
      docs: '/public/docs',
      demo: '/demo',
      privacy: '/public/privacy',
      terms: '/public/terms',
      guildPage: '/public/g',
    })
    expect(getMarketingPathsForHost('albion-guildmanager-git-main.vercel.app').home).toBe(
      '/public/landing',
    )
  })

  it('keeps locale-prefixed SEO paths on localhost for local SEO QA', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    const paths = getMarketingPathsForHost('localhost:3000', 'zh')

    expect(paths.features).toBe('/zh/features')
    expect(paths.docs).toBe('/zh/docs')
  })

  it('normalizes clean docs links for localhost and preview public routes', () => {
    const paths = getMarketingPathsForHost('localhost:3000')

    expect(resolveMarketingHref(paths, '/docs')).toBe('/public/docs')
    expect(resolveMarketingHref(paths, '/docs/events/create')).toBe(
      '/public/docs/events/create',
    )
    expect(resolveMarketingHref(paths, '/features/auto-regear')).toBe(
      '/public/features/auto-regear',
    )
    expect(resolveMarketingHref(paths, '/zvz-battles')).toBe('/public/zvz-battles')
    expect(resolveMarketingHref(paths, '/pricing')).toBe('/public/pricing')
    expect(resolveMarketingHref(paths, '/g/menhera')).toBe('/public/g/menhera')
    expect(resolveMarketingHref(paths, 'https://example.com/docs')).toBe(
      'https://example.com/docs',
    )
  })

  it('normalizes clean docs links to canonical absolute URLs on tenant hosts', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')
    const paths = getMarketingPathsForHost('menhera.albion-guildmanager.com')

    expect(resolveMarketingHref(paths, '/docs/admin/logs')).toBe(
      'https://albion-guildmanager.com/docs/admin/logs',
    )
    expect(resolveMarketingHref(paths, '/features/zvz-killboard')).toBe(
      'https://albion-guildmanager.com/features/zvz-killboard',
    )
    expect(resolveMarketingHref(paths, '/zvz-battles')).toBe(
      'https://albion-guildmanager.com/zvz-battles',
    )
    expect(resolveMarketingHref(paths, '/g/menhera')).toBe(
      'https://albion-guildmanager.com/g/menhera',
    )
  })
})
