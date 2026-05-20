import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { buildAuthorizeUrl } from './discord'

describe('buildAuthorizeUrl', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('APP_URL', 'https://example.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('omits prompt by default', () => {
    const url = new URL(buildAuthorizeUrl('STATE_ABC'))
    expect(url.searchParams.has('prompt')).toBe(false)
    expect(url.searchParams.get('state')).toBe('STATE_ABC')
    expect(url.searchParams.get('client_id')).toBe('test-client')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.test/api/auth/discord/callback',
    )
  })

  it('adds prompt=none when requested', () => {
    const url = new URL(buildAuthorizeUrl('STATE_ABC', { prompt: 'none' }))
    expect(url.searchParams.get('prompt')).toBe('none')
  })

  it('adds prompt=consent when requested', () => {
    const url = new URL(buildAuthorizeUrl('STATE_ABC', { prompt: 'consent' }))
    expect(url.searchParams.get('prompt')).toBe('consent')
  })
})
