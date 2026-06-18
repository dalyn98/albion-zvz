import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  buildAuthorizeUrl: vi.fn(),
  signOAuthState: vi.fn(),
  detectLocaleFromAcceptLanguage: vi.fn(),
  shouldUseDiscordConsentPrompt: vi.fn(),
  recordAuthStart: vi.fn(),
  recordSeoAttributionEventFromRequest: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: mocks.after,
  }
})

vi.mock('@/lib/discord', () => ({
  buildAuthorizeUrl: mocks.buildAuthorizeUrl,
}))

vi.mock('@/lib/oauth-state', () => ({
  signOAuthState: mocks.signOAuthState,
}))

vi.mock('@/i18n/locales', () => ({
  LOCALE_COOKIE: 'NEXT_LOCALE',
  isLocale: (value: unknown) => ['ko', 'ja', 'en', 'zh'].includes(String(value)),
}))

vi.mock('@/lib/accept-language', () => ({
  detectLocaleFromAcceptLanguage: mocks.detectLocaleFromAcceptLanguage,
}))

vi.mock('@/lib/discord-reauth', () => ({
  DISCORD_REAUTH_COOKIE_NAME: 'discord_reauth',
  clearDiscordReauthCookieOptions: () => ({ path: '/', maxAge: 0 }),
  shouldUseDiscordConsentPrompt: mocks.shouldUseDiscordConsentPrompt,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  recordAuthStart: mocks.recordAuthStart,
}))

vi.mock('@/lib/seo-attribution', () => ({
  recordSeoAttributionEventFromRequest: mocks.recordSeoAttributionEventFromRequest,
}))

import { GET } from './route'

async function runDeferredTask(index = 0): Promise<void> {
  const task = mocks.after.mock.calls[index]?.[0] as (() => Promise<void> | void) | undefined
  expect(task).toBeDefined()
  await task?.()
}

describe('GET /api/auth/discord/start', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.signOAuthState.mockResolvedValue('STATE')
    mocks.buildAuthorizeUrl.mockReturnValue('https://discord.example/oauth?state=STATE')
    mocks.detectLocaleFromAcceptLanguage.mockReturnValue('en')
    mocks.shouldUseDiscordConsentPrompt.mockReturnValue(true)
  })

  it('carries an event guest invite from returnTo into the signed OAuth state', async () => {
    const returnTo = '/events/event-1?invite=guest-token'
    const request = new NextRequest(
      `https://guild.albion-guildmanager.com/api/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`,
      { headers: { host: 'guild.albion-guildmanager.com', 'user-agent': 'TestAgent' } },
    )

    const response = await GET(request)

    expect(mocks.signOAuthState).toHaveBeenCalledWith({
      originHost: 'guild.albion-guildmanager.com',
      returnTo,
      invite: 'guest-token',
      preferredLocale: 'en',
    })
    expect(mocks.shouldUseDiscordConsentPrompt).toHaveBeenCalledWith({
      retry: false,
      invite: 'guest-token',
      returnTo,
      userAgent: 'TestAgent',
    })
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'discord_oauth', {
      has_invite: true,
      prompt: 'consent',
      return_to: returnTo,
    })
    expect(mocks.recordSeoAttributionEventFromRequest).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await runDeferredTask()
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'discord_oauth_start',
      target: '/api/auth/discord/start',
    })
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('normalizes unsafe returnTo values before signing state', async () => {
    const request = new NextRequest(
      'https://guild.albion-guildmanager.com/api/auth/discord/start?returnTo=%2Fapi%2Fauth%2Flogout',
      { headers: { host: 'guild.albion-guildmanager.com' } },
    )

    await GET(request)

    expect(mocks.signOAuthState).toHaveBeenCalledWith(
      expect.objectContaining({
        returnTo: '/',
        invite: null,
      }),
    )
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'discord_oauth', {
      has_invite: false,
      prompt: 'consent',
      return_to: '/',
    })
    expect(mocks.recordSeoAttributionEventFromRequest).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await runDeferredTask()
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'discord_oauth_start',
      target: '/api/auth/discord/start',
    })
  })

  it('clears the legacy reauth cookie without using it to force consent', async () => {
    mocks.shouldUseDiscordConsentPrompt.mockReturnValue(false)
    const request = new NextRequest(
      'https://guild.albion-guildmanager.com/api/auth/discord/start?returnTo=%2F',
      {
        headers: {
          cookie: 'discord_reauth=1',
          host: 'guild.albion-guildmanager.com',
          'user-agent': 'Desktop UA',
        },
      },
    )

    const response = await GET(request)
    const setCookies = response.headers.getSetCookie()

    expect(mocks.shouldUseDiscordConsentPrompt).toHaveBeenCalledWith({
      retry: false,
      invite: '',
      returnTo: '/',
      userAgent: 'Desktop UA',
    })
    expect(mocks.buildAuthorizeUrl).toHaveBeenCalledWith('STATE', { prompt: 'none' })
    expect(setCookies.some((cookie) => cookie.startsWith('discord_reauth=;'))).toBe(true)
  })
})
