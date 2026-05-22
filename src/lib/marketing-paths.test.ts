import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMarketingPathsForHost } from './marketing-paths'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getMarketingPathsForHost', () => {
  it('uses clean canonical paths on the official root domain', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('albion-guildmanager.com')).toEqual({
      home: '/',
      features: '/#features',
      pricing: '/pricing',
      faq: '/faq',
      docs: '/docs',
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
      features: 'https://albion-guildmanager.com/#features',
      pricing: 'https://albion-guildmanager.com/pricing',
      faq: 'https://albion-guildmanager.com/faq',
      docs: 'https://albion-guildmanager.com/docs',
      demo: 'https://albion-guildmanager.com/demo',
      privacy: 'https://albion-guildmanager.com/privacy',
      terms: 'https://albion-guildmanager.com/terms',
      guildPage: 'https://albion-guildmanager.com/g',
    })
  })

  it('keeps direct public paths on localhost and previews', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('localhost:3000')).toEqual({
      home: '/public/landing',
      features: '/public/landing#features',
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
})
