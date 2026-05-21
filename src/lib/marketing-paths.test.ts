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
      faq: '/faq',
      docs: '/docs',
      guildPage: '/g',
    })
  })

  it('uses official root absolute URLs on tenant subdomains', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('menhera.albion-guildmanager.com')).toEqual({
      home: 'https://albion-guildmanager.com/',
      features: 'https://albion-guildmanager.com/#features',
      faq: 'https://albion-guildmanager.com/faq',
      docs: 'https://albion-guildmanager.com/docs',
      guildPage: 'https://albion-guildmanager.com/g',
    })
  })

  it('keeps direct public paths on localhost and previews', () => {
    vi.stubEnv('TENANT_ROOT_DOMAIN', 'albion-guildmanager.com')

    expect(getMarketingPathsForHost('localhost:3000')).toEqual({
      home: '/public/landing',
      features: '/public/landing#features',
      faq: '/public/faq',
      docs: '/public/docs',
      guildPage: '/public/g',
    })
    expect(getMarketingPathsForHost('albion-guildmanager-git-main.vercel.app').home).toBe(
      '/public/landing',
    )
  })
})
