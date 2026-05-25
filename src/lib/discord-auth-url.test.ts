import { describe, expect, it } from 'vitest'
import { buildDiscordStartHref } from './discord-auth-url'

describe('buildDiscordStartHref', () => {
  it('keeps regular logins on the fast OAuth path', () => {
    expect(buildDiscordStartHref({ returnTo: '/g/menhera' })).toBe(
      '/api/auth/discord/start?returnTo=%2Fg%2Fmenhera',
    )
  })

  it('adds retry=1 when the user explicitly needs to switch Discord accounts', () => {
    expect(buildDiscordStartHref({ returnTo: '/g/menhera', forceConsent: true })).toBe(
      '/api/auth/discord/start?returnTo=%2Fg%2Fmenhera&retry=1',
    )
  })

  it('carries event guest invites through the OAuth start URL', () => {
    expect(
      buildDiscordStartHref({
        returnTo: '/events/event-1?invite=guest-token',
        invite: 'guest-token',
      }),
    ).toBe(
      '/api/auth/discord/start?returnTo=%2Fevents%2Fevent-1%3Finvite%3Dguest-token&invite=guest-token',
    )
  })
})
