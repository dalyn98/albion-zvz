import { describe, expect, it } from 'vitest'
import {
  buildLoginEntryHref,
  buildReturnToWithSearchParams,
  resolveCurrentPageLoginReturnTo,
} from './login-entry'

describe('buildReturnToWithSearchParams', () => {
  it('preserves navigation filters while removing OAuth and error parameters', () => {
    const searchParams = new URLSearchParams([
      ['view', 'alliance'],
      ['q', 'bomb squad'],
      ['state', 'oauth-state'],
      ['code', 'oauth-code'],
      ['token', 'bearer-token'],
      ['auth_error', 'server_error'],
    ])

    expect(buildReturnToWithSearchParams('/battles', searchParams)).toBe(
      '/battles?view=alliance&q=bomb+squad',
    )
  })

  it('keeps repeated safe parameters and the event guest invite', () => {
    const searchParams = new URLSearchParams([
      ['role', 'tank'],
      ['role', 'healer'],
      ['invite', 'guest-invite'],
    ])

    expect(buildReturnToWithSearchParams('/events/event-1', searchParams)).toBe(
      '/events/event-1?role=tank&role=healer&invite=guest-invite',
    )
  })

  it('bounds untrusted query values and the complete return target', () => {
    const searchParams = new URLSearchParams({
      q: 'x'.repeat(600),
      view: 'alliance',
    })

    expect(buildReturnToWithSearchParams('/battles', searchParams)).toBe(
      '/battles?view=alliance',
    )
    expect(
      buildReturnToWithSearchParams('/battles', new URLSearchParams({
        q: 'a'.repeat(500),
        from: 'b'.repeat(500),
        to: 'c'.repeat(500),
        activity: 'd'.repeat(500),
        result: 'e'.repeat(500),
      })).length,
    ).toBeLessThanOrEqual(2048)
  })
})

describe('buildLoginEntryHref', () => {
  it('builds an internal login recovery URL with the exact safe return target', () => {
    expect(buildLoginEntryHref({
      returnTo: '/members?tab=guests',
    })).toBe('/login?returnTo=%2Fmembers%3Ftab%3Dguests')
  })

  it('carries only a bounded machine-readable auth error and explicit retry flag', () => {
    expect(buildLoginEntryHref({
      returnTo: '/events/event-1?invite=guest-token',
      authError: 'not_in_guild',
      forceConsent: true,
    })).toBe(
      '/login?returnTo=%2Fevents%2Fevent-1%3Finvite%3Dguest-token&auth_error=not_in_guild&retry=1',
    )

    expect(buildLoginEntryHref({
      returnTo: '/me',
      authError: '"><script>alert(1)</script>',
    })).toBe('/login?returnTo=%2Fme')
  })

  it('normalizes unsafe destinations instead of creating an open redirect', () => {
    expect(buildLoginEntryHref({ returnTo: 'https://evil.example/path' })).toBe(
      '/login?returnTo=%2F',
    )
    expect(buildLoginEntryHref({ returnTo: '/api/auth/logout' })).toBe(
      '/login?returnTo=%2F',
    )
  })
})

describe('resolveCurrentPageLoginReturnTo', () => {
  it('uses the local guild login return target instead of returning to the login form', () => {
    expect(resolveCurrentPageLoginReturnTo(
      '/guild-login',
      new URLSearchParams({
        return: '/events/event-1?invite=guest-token',
      }),
    )).toBe('/events/event-1?invite=guest-token')
  })

  it('rejects an unsafe local guild login return target', () => {
    expect(resolveCurrentPageLoginReturnTo(
      '/guild-login',
      new URLSearchParams({ return: 'https://evil.example/path' }),
    )).toBe('/')
  })

  it('keeps the current path and safe filters on ordinary pages', () => {
    expect(resolveCurrentPageLoginReturnTo(
      '/shop',
      new URLSearchParams({ q: 'potion', state: 'secret' }),
    )).toBe('/shop?q=potion')
  })
})
