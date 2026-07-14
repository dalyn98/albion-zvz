import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  const lookupMaybeSingle = vi.fn()
  const lookupGt = vi.fn(() => ({ maybeSingle: lookupMaybeSingle }))
  const lookupIs = vi.fn(() => ({ gt: lookupGt }))
  const lookupToken = vi.fn(() => ({ is: lookupIs }))
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
    getTenantDiscordConfig: vi.fn(),
    hashDiscordAppLoginToken: vi.fn(),
    lookupId,
    lookupMaybeSingle,
    lookupSelect,
    recordAuthFailure: vi.fn(),
    recordAuthSuccess: vi.fn(),
    signHopToken: vi.fn(),
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
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/oauth-state', () => ({
  signHopToken: mocks.signHopToken,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  buildTenantHostUrl: mocks.buildTenantHostUrl,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  createAuthTimer: () => () => 0,
  recordAuthFailure: mocks.recordAuthFailure,
  recordAuthSuccess: mocks.recordAuthSuccess,
}))

import { GET } from './route'

describe('GET /api/auth/discord/app/consume', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.hashDiscordAppLoginToken.mockReturnValue('a'.repeat(64))
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: {
        guild_id: 'guild-1',
        discord_id: 'member-1',
        return_to: '/me/wallet',
      },
      error: null,
    })
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

    expect(mocks.lookupSelect).toHaveBeenCalledWith('guild_id, discord_id, return_to')
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
    })
    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('does not call Discord or issue a session when the attempt was already consumed or expired', async () => {
    mocks.lookupMaybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await GET(
      new NextRequest(
        'https://menhera.example.test/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/?auth_error=app_login_invalid',
    )
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
    expect(mocks.consumeUpdate).not.toHaveBeenCalled()
    expect(mocks.signHopToken).not.toHaveBeenCalled()
  })
})
