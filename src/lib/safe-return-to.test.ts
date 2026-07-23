import { describe, expect, it } from 'vitest'
import { sanitizeInternalReturnTo } from './safe-return-to'

describe('sanitizeInternalReturnTo', () => {
  it('keeps normal in-app paths with query strings', () => {
    expect(sanitizeInternalReturnTo('/events/event-1?invite=guest-token')).toBe(
      '/events/event-1?invite=guest-token',
    )
    expect(sanitizeInternalReturnTo('/me/settings')).toBe('/me/settings')
  })

  it('rejects external, protocol-relative, and api targets', () => {
    expect(sanitizeInternalReturnTo('https://evil.test/path')).toBe('/')
    expect(sanitizeInternalReturnTo('//evil.test/path')).toBe('/')
    expect(sanitizeInternalReturnTo('/api/auth/logout')).toBe('/')
    expect(sanitizeInternalReturnTo('/api')).toBe('/')
  })

  it('rejects backslash and control-character paths before URL normalization', () => {
    expect(sanitizeInternalReturnTo('/\\evil.test/path')).toBe('/')
    expect(sanitizeInternalReturnTo('/events\\evil')).toBe('/')
    expect(sanitizeInternalReturnTo('/\nevents/event-1')).toBe('/')
    expect(sanitizeInternalReturnTo('/\tevents/event-1')).toBe('/')
  })

  it('uses the provided fallback for unsafe onboarding return targets', () => {
    expect(sanitizeInternalReturnTo('/api/auth/logout', '/me')).toBe('/me')
    expect(sanitizeInternalReturnTo('/\\evil.test/path', '/me')).toBe('/me')
  })

  it('rejects oversized return targets before they enter signed state or response headers', () => {
    expect(sanitizeInternalReturnTo(`/events/event-1?q=${'x'.repeat(2048)}`)).toBe('/')
    expect(
      sanitizeInternalReturnTo(`/events/event-1?q=${'x'.repeat(2048)}`, '/events'),
    ).toBe('/events')
  })
})
