import { describe, expect, it } from 'vitest'
import { redactSearchParams, redactUrlSearch } from './redact-search-params'

describe('redactSearchParams', () => {
  it('redacts OAuth and credential-like query values while preserving diagnostic fields', () => {
    const params = new URLSearchParams({
      guild_id: '123456789012345678',
      code: 'oauth-code',
      state: 'signed-state',
      token: 'hop-token',
      invite: 'guest-token',
      permissions: '8',
    })

    const redacted = redactSearchParams(params)

    expect(redacted).toContain('guild_id=123456789012345678')
    expect(redacted).toContain('permissions=8')
    expect(redacted).not.toContain('oauth-code')
    expect(redacted).not.toContain('signed-state')
    expect(redacted).not.toContain('hop-token')
    expect(redacted).not.toContain('guest-token')
    expect(new URLSearchParams(redacted).get('code')).toBe('[redacted]')
    expect(new URLSearchParams(redacted).get('state')).toBe('[redacted]')
    expect(new URLSearchParams(redacted).get('token')).toBe('[redacted]')
    expect(new URLSearchParams(redacted).get('invite')).toBe('[redacted]')
  })

  it('handles repeated keys and case-insensitive sensitive names', () => {
    const params = new URLSearchParams()
    params.append('CODE', 'first')
    params.append('CODE', 'second')
    params.append('mode', 'install')

    const values = new URLSearchParams(redactSearchParams(params)).getAll('CODE')

    expect(values).toEqual(['[redacted]', '[redacted]'])
    expect(new URLSearchParams(redactSearchParams(params)).get('mode')).toBe('install')
  })

  it('redacts sensitive query values inside relative and nested return URLs', () => {
    const redacted = redactUrlSearch('/welcome-language?return=%2Fevents%2Fevent-1%3Finvite%3Dguest-token')

    expect(redacted).not.toContain('guest-token')
    const nested = new URLSearchParams(redacted.split('?', 2)[1]).get('return')
    expect(nested).toBe('/events/event-1?invite=%5Bredacted%5D')
  })
})
