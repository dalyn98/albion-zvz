import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  buildAuthorizeUrl,
  buildBotInstallUrl,
  buildOpenBotInstallUrl,
  getCurrentUser,
} from './discord'

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
    expect(url.searchParams.get('scope')).toBe('identify guilds')
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

describe('bot install URLs', () => {
  beforeEach(() => {
    vi.stubEnv('DISCORD_CLIENT_ID', 'test-client')
    vi.stubEnv('DISCORD_CLIENT_SECRET', 'test-secret')
    vi.stubEnv('APP_URL', 'https://example.test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a guild-locked install URL for the onboard guild picker', () => {
    const url = new URL(buildBotInstallUrl({ guildId: '123456789012345678', state: 'STATE_ABC' }))

    expect(url.origin).toBe('https://discord.com')
    expect(url.pathname).toBe('/oauth2/authorize')
    expect(url.searchParams.get('client_id')).toBe('test-client')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('bot applications.commands identify')
    expect(url.searchParams.get('integration_type')).toBe('0')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.test/api/auth/discord/bot-callback',
    )
    expect(url.searchParams.get('permissions')).toBe('134237184')
    expect(url.searchParams.get('guild_id')).toBe('123456789012345678')
    expect(url.searchParams.get('disable_guild_select')).toBe('true')
    expect(url.searchParams.get('state')).toBe('STATE_ABC')
  })

  it('builds an open guild-select install URL for /invite', () => {
    const url = new URL(buildOpenBotInstallUrl({ state: 'STATE_ABC' }))

    expect(url.searchParams.get('scope')).toBe('bot applications.commands identify')
    expect(url.searchParams.get('integration_type')).toBe('0')
    expect(url.searchParams.get('permissions')).toBe('134237184')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://example.test/api/auth/discord/bot-callback',
    )
    expect(url.searchParams.get('state')).toBe('STATE_ABC')
    expect(url.searchParams.has('guild_id')).toBe(false)
    expect(url.searchParams.has('disable_guild_select')).toBe(false)
  })
})

describe('Discord API requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches a timeout signal to Discord fetches', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'user-1',
        username: 'tester',
        global_name: 'Tester',
        avatar: null,
      })),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(getCurrentUser('access-token')).resolves.toEqual({
      id: 'user-1',
      username: 'tester',
      global_name: 'Tester',
      avatar: null,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/users/@me',
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('turns aborted Discord fetches into explicit timeout errors', async () => {
    const timeoutError = new Error('The operation was aborted')
    timeoutError.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError))

    await expect(getCurrentUser('access-token')).rejects.toThrow(
      'Discord API request timed out after 10000ms',
    )
  })
})
