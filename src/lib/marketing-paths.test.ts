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
      guilds: '/guilds',
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
      home: '/en',
      features: '/en/features',
      guilds: '/en/guilds',
      zvzBattles: '/en/zvz-battles',
      pricing: '/en/pricing',
      faq: '/en/faq',
      docs: '/en/docs',
      demo: '/demo?locale=en',
      privacy: '/en/privacy',
      terms: '/en/terms',
      guildPage: '/g',
    })
  })

  it('uses official root absolute URLs on tenant subdomains', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('menhera.albion-guildmanager.com')).toEqual({
      home: 'https://albion-guildmanager.com/',
      features: 'https://albion-guildmanager.com/features',
      guilds: 'https://albion-guildmanager.com/guilds',
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
    expect(paths.guilds).toBe('https://albion-guildmanager.com/ja/guilds')
    expect(paths.docs).toBe('https://albion-guildmanager.com/ja/docs')
    expect(paths.home).toBe('https://albion-guildmanager.com/ja')
    expect(paths.pricing).toBe('https://albion-guildmanager.com/ja/pricing')
    expect(paths.demo).toBe('https://albion-guildmanager.com/demo?locale=ja')
  })

  it('keeps direct public paths on localhost and previews', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('localhost:3000')).toEqual({
      home: '/public/landing',
      features: '/public/features',
      guilds: '/public/guilds',
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
    expect(paths.guilds).toBe('/zh/guilds')
    expect(paths.docs).toBe('/zh/docs')
    expect(paths.home).toBe('/zh')
    expect(paths.faq).toBe('/zh/faq')
    expect(paths.demo).toBe('/demo?locale=zh')
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
    expect(resolveMarketingHref(paths, '/guilds')).toBe('/public/guilds')
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
    expect(resolveMarketingHref(paths, '/guilds')).toBe(
      'https://albion-guildmanager.com/guilds',
    )
    expect(resolveMarketingHref(paths, '/zvz-battles')).toBe(
      'https://albion-guildmanager.com/zvz-battles',
    )
    expect(resolveMarketingHref(paths, '/g/menhera')).toBe(
      'https://albion-guildmanager.com/g/menhera',
    )
  })
})
