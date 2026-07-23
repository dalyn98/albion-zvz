import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildAuthorizeUrl: vi.fn(),
  buildBotInstallUrl: vi.fn(),
  buildOpenBotInstallUrl: vi.fn(),
  botInstallIntentCookieName: vi.fn(),
  botInstallIntentCookieOptions: vi.fn(),
  oauthStateBindingCookieName: vi.fn(),
  oauthStateBindingCookieOptions: vi.fn(),
  signBotInstallState: vi.fn(),
  signOAuthState: vi.fn(),
  verifyBotInstallState: vi.fn(),
  verifyOAuthState: vi.fn(),
}))

vi.mock('@/lib/oauth-state', () => ({
  signBotInstallState: mocks.signBotInstallState,
  signOAuthState: mocks.signOAuthState,
  verifyBotInstallState: mocks.verifyBotInstallState,
  verifyOAuthState: mocks.verifyOAuthState,
}))

vi.mock('@/lib/discord', () => ({
  buildAuthorizeUrl: mocks.buildAuthorizeUrl,
  buildBotInstallUrl: mocks.buildBotInstallUrl,
  buildOpenBotInstallUrl: mocks.buildOpenBotInstallUrl,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  AUTH_FLOW_BINDING_COOKIE_VALUE: '1',
  botInstallIntentCookieName: mocks.botInstallIntentCookieName,
  botInstallIntentCookieOptions: mocks.botInstallIntentCookieOptions,
  oauthStateBindingCookieName: mocks.oauthStateBindingCookieName,
  oauthStateBindingCookieOptions: mocks.oauthStateBindingCookieOptions,
}))

import { GET } from './route'

describe('GET /api/auth/discord/bind', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.botInstallIntentCookieName.mockImplementation(
      (nonce: string) => `agm_bot_install_${nonce}`,
    )
    mocks.botInstallIntentCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.oauthStateBindingCookieName.mockImplementation(
      (nonce: string) => `agm_oauth_state_${nonce}`,
    )
    mocks.oauthStateBindingCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.signBotInstallState.mockResolvedValue('FRESH_BOT_STATE')
    mocks.signOAuthState.mockResolvedValue('FRESH_USER_STATE')
  })

  it('reissues a fresh user state before binding it on the callback host', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'source-flow',
      originHost: 'preview.vercel.app',
      returnTo: '/members',
      invite: null,
      preferredLocale: 'en',
      issuedAt: Date.now(),
    })
    mocks.buildAuthorizeUrl.mockReturnValue('https://discord.example/user')

    const response = await GET(new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bind?kind=user&state=STATE&prompt=none',
      { headers: { host: 'albion-guildmanager.com' } },
    ))

    expect(response.headers.get('location')).toBe('https://discord.example/user')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.signOAuthState).toHaveBeenCalledWith(expect.objectContaining({
      originHost: 'preview.vercel.app',
      returnTo: '/members',
      invite: null,
      preferredLocale: 'en',
      nonce: expect.any(String),
    }))
    expect(mocks.signOAuthState.mock.calls[0]?.[0]?.nonce).not.toBe('source-flow')
    expect(mocks.buildAuthorizeUrl).toHaveBeenCalledWith(
      'FRESH_USER_STATE',
      { prompt: 'none' },
    )
    const freshNonce = mocks.signOAuthState.mock.calls[0]?.[0]?.nonce as string
    expect(response.cookies.get(`agm_oauth_state_${freshNonce}`)?.value).toBe('1')
  })

  it('keeps state out of referrers while canonicalizing a bridge request', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await GET(new NextRequest(
      'https://preview.vercel.app/api/auth/discord/bind?kind=user&state=STATE',
    ))

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/api/auth/discord/bind?kind=user&state=STATE',
    )
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.verifyOAuthState).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
  })

  it('reissues a fresh authoritative guild intent for bot installs', async () => {
    mocks.verifyBotInstallState.mockResolvedValue({
      nonce: 'source-flow',
      expectedGuildId: '123456789012345678',
      mode: 'guided',
      originHost: 'menhera.albion-guildmanager.com',
      issuedAt: Date.now(),
    })
    mocks.buildBotInstallUrl.mockReturnValue('https://discord.example/bot')

    const response = await GET(new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bind?kind=bot&state=STATE',
      { headers: { host: 'albion-guildmanager.com' } },
    ))

    expect(response.headers.get('location')).toBe('https://discord.example/bot')
    expect(mocks.signBotInstallState).toHaveBeenCalledWith(expect.objectContaining({
      expectedGuildId: '123456789012345678',
      mode: 'guided',
      originHost: 'menhera.albion-guildmanager.com',
      nonce: expect.any(String),
    }))
    expect(mocks.signBotInstallState.mock.calls[0]?.[0]?.nonce).not.toBe('source-flow')
    expect(mocks.buildBotInstallUrl).toHaveBeenCalledWith({
      guildId: '123456789012345678',
      state: 'FRESH_BOT_STATE',
    })
    const freshNonce = mocks.signBotInstallState.mock.calls[0]?.[0]?.nonce as string
    expect(response.cookies.get(`agm_bot_install_${freshNonce}`)?.value).toBe(
      'FRESH_BOT_STATE',
    )
  })

  it('rejects invalid bridge state without redirecting to Discord', async () => {
    mocks.verifyOAuthState.mockResolvedValue(null)

    const response = await GET(new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bind?kind=user&state=BAD',
    ))

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/login?returnTo=%2F&auth_error=state_mismatch',
    )
    expect(mocks.buildAuthorizeUrl).not.toHaveBeenCalled()
  })
})
