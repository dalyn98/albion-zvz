import { describe, expect, it } from 'vitest'
import {
  normalizeMarketingMyGuildHref,
  resolveMarketingGuildCta,
} from './marketing-my-guild-cta'

describe('marketing my-guild CTA', () => {
  it('keeps the install CTA when no remembered guild exists', () => {
    expect(
      resolveMarketingGuildCta({
        installHref: '/api/auth/discord/start?returnTo=%2Fonboard',
        installLabel: 'Create my guild',
        myGuildLabel: 'Go to my guild',
        myGuildHref: null,
      }),
    ).toEqual({
      href: '/api/auth/discord/start?returnTo=%2Fonboard',
      kind: 'install',
      label: 'Create my guild',
    })
  })

  it('promotes a remembered guild href to the primary CTA', () => {
    expect(
      resolveMarketingGuildCta({
        installHref: '/api/auth/discord/start?returnTo=%2Fonboard',
        installLabel: 'Create my guild',
        myGuildLabel: 'Go to my guild',
        myGuildHref: 'https://menhera.albion-guildmanager.com/',
      }),
    ).toEqual({
      href: 'https://menhera.albion-guildmanager.com/',
      kind: 'my-guild',
      label: 'Go to my guild',
    })
  })

  it('rejects unsafe href payloads from the client-side API response', () => {
    expect(normalizeMarketingMyGuildHref('javascript:alert(1)')).toBeNull()
    expect(normalizeMarketingMyGuildHref('//evil.example')).toBeNull()
    expect(normalizeMarketingMyGuildHref('https://evil.example/')).toBeNull()
    expect(normalizeMarketingMyGuildHref('/')).toBe('/')
    expect(normalizeMarketingMyGuildHref('https://menhera.albion-guildmanager.com/')).toBe(
      'https://menhera.albion-guildmanager.com/',
    )
  })
})
