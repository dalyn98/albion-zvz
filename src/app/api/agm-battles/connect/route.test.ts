import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  signAgmBattlesConnectIntent: vi.fn(),
  cookieOptions: vi.fn(),
}))

vi.mock('@/lib/oauth-state', () => ({
  signAgmBattlesConnectIntent: mocks.signAgmBattlesConnectIntent,
}))

vi.mock('@/lib/agm-battles-connect-intent', () => ({
  AGM_BATTLES_CONNECT_INTENT_COOKIE: 'agm_battles_connect_intent',
  agmBattlesConnectIntentCookieOptions: mocks.cookieOptions,
}))

import { GET } from './route'

describe('GET /api/agm-battles/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.signAgmBattlesConnectIntent.mockResolvedValue('signed-connect-intent')
    mocks.cookieOptions.mockReturnValue({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 86_400,
    })
  })

  it('stores a signed intent and enters the recoverable login flow', async () => {
    const source = '/zvz-battles/guild/europe/guild_ABC-123'
    const request = new NextRequest(
      `https://albion-guildmanager.com/api/agm-battles/connect?server=europe&guild=guild_ABC-123&source=${encodeURIComponent(source)}`,
      { headers: { host: 'albion-guildmanager.com' } },
    )

    const response = await GET(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/login?returnTo=%2Fonboard',
    )
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.cookies.get('agm_battles_connect_intent')?.value).toBe(
      'signed-connect-intent',
    )
    expect(mocks.signAgmBattlesConnectIntent).toHaveBeenCalledWith({
      server: 'europe',
      guildAlbionId: 'guild_ABC-123',
      sourcePath: source,
    })
  })

  it.each([
    'server=invalid&guild=guild-1&source=%2Fzvz-battles%2Fguild%2Fwest%2Fguild-1',
    'server=west&guild=%3Cscript%3E&source=%2Fzvz-battles%2Fguild%2Fwest%2Fguild-1',
    'server=west&guild=guild-1&source=https%3A%2F%2Fevil.example%2Fzvz-battles%2Fguild%2Fwest%2Fguild-1',
    'server=west&guild=guild-1&source=%2Fadmin%2Fdashboard',
  ])('rejects invalid or external intent input: %s', async (query) => {
    const response = await GET(
      new NextRequest(`https://albion-guildmanager.com/api/agm-battles/connect?${query}`),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_connect_intent' })
    expect(mocks.signAgmBattlesConnectIntent).not.toHaveBeenCalled()
  })
})
