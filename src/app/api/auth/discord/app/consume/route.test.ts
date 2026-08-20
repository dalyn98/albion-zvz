import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const lookupMaybeSingle = vi.fn()
  const lookupToken = vi.fn(() => ({ maybeSingle: lookupMaybeSingle }))
  const lookupId = vi.fn(() => ({ eq: lookupToken }))
  const lookupSelect = vi.fn(() => ({ eq: lookupId }))

  const consumeMaybeSingle = vi.fn()
  const consumeSelect = vi.fn(() => ({ maybeSingle: consumeMaybeSingle }))
  const consumeGt = vi.fn(() => ({ select: consumeSelect }))
  const consumeIs = vi.fn(() => ({ gt: consumeGt }))
  const consumeToken = vi.fn(() => ({ is: consumeIs }))
  const consumeId = vi.fn(() => ({ eq: consumeToken }))
  const consumeUpdate = vi.fn(() => ({ eq: consumeId }))

  return {
    buildDiscordMemberSession: vi.fn(),
    buildTenantHostUrl: vi.fn(),
    consumeId,
    consumeMaybeSingle,
    consumeUpdate,
    getGuildMemberByBot: vi.fn(),
    getSession: vi.fn(),
    getTenantDiscordConfig: vi.fn(),
    hashDiscordAppLoginToken: vi.fn(),
    lookupId,
    lookupMaybeSingle,
    lookupSelect,
    recordAuthFailure: vi.fn(),
    recordAuthSuccess: vi.fn(),
    signHopToken: vi.fn(),
    canShareAuthBindingCookie: vi.fn(),
    hopTokenBindingCookieName: vi.fn(),
    hopTokenBindingCookieOptions: vi.fn(),
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: mocks.lookupSelect,
      update: mocks.consumeUpdate,
    }),
  }),
}))

vi.mock('@/lib/discord-app-login', () => ({
  hashDiscordAppLoginToken: mocks.hashDiscordAppLoginToken,
  isValidDiscordAppLoginAttemptId: (value: unknown) => value === '11111111-1111-4111-8111-111111111111',
  isValidDiscordAppLoginToken: (value: unknown) => value === 'valid-token',
}))

vi.mock('@/lib/discord', () => ({
  getGuildMemberByBot: mocks.getGuildMemberByBot,
}))

vi.mock('@/lib/discord-member-session', () => ({
  buildDiscordMemberSession: mocks.buildDiscordMemberSession,
  resolveDiscordMemberPostLoginPath: (returnTo: string) => returnTo,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/oauth-state', () => ({
  signHopToken: mocks.signHopToken,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  AUTH_FLOW_BINDING_COOKIE_VALUE: '1',
  canShareAuthBindingCookie: mocks.canShareAuthBindingCookie,
  hopTokenBindingCookieName: mocks.hopTokenBindingCookieName,
  hopTokenBindingCookieOptions: mocks.hopTokenBindingCookieOptions,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  buildTenantHostUrl: mocks.buildTenantHostUrl,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  createAuthTimer: () => () => 0,
  recordAuthFailure: mocks.recordAuthFailure,
  recordAuthSuccess: mocks.recordAuthSuccess,
}))

import { GET, HEAD, POST } from './route'

describe('GET /api/auth/discord/app/consume', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.hashDiscordAppLoginToken.mockReturnValue('a'.repeat(64))
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: {
        guild_id: 'guild-1',
        discord_id: 'member-1',
        return_to: '/me/wallet',
        consumed_at: null,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      },
      error: null,
    })
    mocks.getSession.mockResolvedValue(null)
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      slug: 'menhera',
      discordGuildId: 'discord-guild-1',
      memberRoleIds: ['member-role'],
      adminRoleIds: [],
    })
    mocks.getGuildMemberByBot.mockResolvedValue({
      user: {
        id: 'member-1',
        username: 'Member',
        global_name: null,
        avatar: null,
        locale: 'en-US',
      },
      nick: null,
      roles: ['member-role'],
    })
    mocks.buildDiscordMemberSession.mockResolvedValue({
      session: { guildId: 'guild-1', discordId: 'member-1' },
      preferredLocale: 'en',
      mode: 'member',
    })
    mocks.consumeMaybeSingle.mockResolvedValue({
      data: { id: '11111111-1111-4111-8111-111111111111' },
      error: null,
    })
    mocks.signHopToken.mockResolvedValue('hop-token')
    mocks.canShareAuthBindingCookie.mockReturnValue(true)
    mocks.hopTokenBindingCookieName.mockImplementation(
      (flowId: string) => `agm_auth_hop_${flowId}`,
    )
    mocks.hopTokenBindingCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.buildTenantHostUrl.mockImplementation(
      (slug: string, path: string) => `https://${slug}.example.test${path}`,
    )
  })

  it('re-checks the current Discord member and atomically consumes the link before issuing a tenant hop', async () => {
    const response = await GET(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
      ),
    )

    expect(mocks.lookupSelect).toHaveBeenCalledWith(
      'guild_id, discord_id, return_to, consumed_at, expires_at',
    )
    expect(mocks.lookupId).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111')
    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith('discord-guild-1', 'member-1')
    expect(mocks.buildDiscordMemberSession).toHaveBeenCalledWith(expect.objectContaining({
      tenant: expect.objectContaining({ id: 'guild-1' }),
      discordId: 'member-1',
      preferredLocale: null,
    }))
    expect(mocks.consumeUpdate).toHaveBeenCalledWith({ consumed_at: expect.any(String) })
    expect(mocks.consumeId).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111')
    expect(mocks.signHopToken).toHaveBeenCalledWith({
      session: { guildId: 'guild-1', discordId: 'member-1' },
      returnTo: '/me/wallet',
      preferredLocale: 'en',
      flowId: '11111111-1111-4111-8111-111111111111',
      requiresBrowserBinding: true,
    })
    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(
      response.cookies.get(
        'agm_auth_hop_11111111-1111-4111-8111-111111111111',
      )?.value,
    ).toBe('1')
  })

  it('uses a 303 redirect when the mobile continuation form explicitly consumes the link', async () => {
    const response = await POST(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            id: '11111111-1111-4111-8111-111111111111',
            token: 'valid-token',
          }),
        },
      ),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(mocks.consumeUpdate).toHaveBeenCalledWith({ consumed_at: expect.any(String) })
  })

  it('keeps the POST redirect method-safe when the continuation link is unknown', async () => {
    mocks.lookupMaybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await POST(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume',
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            id: '11111111-1111-4111-8111-111111111111',
            token: 'valid-token',
          }),
        },
      ),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/login?returnTo=%2F&auth_error=app_login_invalid',
    )
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
  })

  it('issues an unbound host-checked hop when the source cannot share cookies', async () => {
    mocks.canShareAuthBindingCookie.mockReturnValue(false)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.vercel.app/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
        { headers: { host: 'albion-guildmanager.vercel.app' } },
      ),
    )

    expect(mocks.signHopToken).toHaveBeenCalledWith(expect.objectContaining({
      requiresBrowserBinding: false,
    }))
    expect(mocks.hopTokenBindingCookieName).not.toHaveBeenCalled()
    expect(
      response.cookies.get(
        'agm_auth_hop_11111111-1111-4111-8111-111111111111',
      ),
    ).toBeUndefined()
  })

  it('does not call Discord or issue a session for an unknown attempt', async () => {
    mocks.lookupMaybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await GET(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/login?returnTo=%2F&auth_error=app_login_invalid',
    )
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
    expect(mocks.signHopToken).not.toHaveBeenCalled()
  })

  it('returns an already authenticated member to the safe destination when a link is reopened', async () => {
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: {
        guild_id: 'guild-1',
        discord_id: 'member-1',
        return_to: '/me/wallet',
        consumed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      },
      error: null,
    })
    mocks.getSession.mockResolvedValue({
      guildId: 'guild-1',
      discordId: 'member-1',
    })

    const response = await GET(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/me/wallet',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
    expect(mocks.signHopToken).not.toHaveBeenCalled()
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'discord_app_login',
      expect.objectContaining({
        mode: 'existing_session_replay',
        tenant_id: 'guild-1',
        return_to: '/me/wallet',
      }),
    )
  })

  it('does not recover a reopened link with a session from another tenant', async () => {
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: {
        guild_id: 'guild-1',
        discord_id: 'member-1',
        return_to: '/me/wallet',
        consumed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      },
      error: null,
    })
    mocks.getSession.mockResolvedValue({
      guildId: 'guild-2',
      discordId: 'member-1',
    })

    const response = await GET(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/login?returnTo=%2F&auth_error=app_login_invalid',
    )
    expect(mocks.recordAuthSuccess).not.toHaveBeenCalled()
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
  })

  it('does not recover another member’s reopened link within the same tenant', async () => {
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: {
        guild_id: 'guild-1',
        discord_id: 'member-1',
        return_to: '/me/wallet',
        consumed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
      },
      error: null,
    })
    mocks.getSession.mockResolvedValue({
      guildId: 'guild-1',
      discordId: 'member-2',
    })

    const response = await GET(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/login?returnTo=%2F&auth_error=app_login_invalid',
    )
    expect(mocks.recordAuthSuccess).not.toHaveBeenCalled()
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
  })

  it('does not consume a one-time attempt for a HEAD probe', async () => {
    const response = await HEAD()

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.lookupSelect).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
  })
})
