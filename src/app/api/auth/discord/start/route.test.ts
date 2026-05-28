import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildAuthorizeUrl: vi.fn(),
  signOAuthState: vi.fn(),
  detectLocaleFromAcceptLanguage: vi.fn(),
  shouldUseDiscordConsentPrompt: vi.fn(),
  recordAuthStart: vi.fn(),
}))

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

import { GET } from './route'

describe('GET /api/auth/discord/start', () => {
  beforeEach(() => {
    mocks.buildAuthorizeUrl.mockReset()
    mocks.signOAuthState.mockReset()
    mocks.detectLocaleFromAcceptLanguage.mockReset()
    mocks.shouldUseDiscordConsentPrompt.mockReset()
    mocks.recordAuthStart.mockReset()

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

    await GET(request)

    expect(mocks.signOAuthState).toHaveBeenCalledWith({
      originHost: 'guild.albion-guildmanager.com',
      returnTo,
      invite: 'guest-token',
      preferredLocale: 'en',
    })
    expect(mocks.shouldUseDiscordConsentPrompt).toHaveBeenCalledWith({
      retry: false,
      invite: 'guest-token',
      reauthCookieValue: undefined,
      returnTo,
      userAgent: 'TestAgent',
    })
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'discord_oauth', {
      has_invite: true,
      prompt: 'consent',
      return_to: returnTo,
    })
  })
})
