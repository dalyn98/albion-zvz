import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const single = vi.fn()
  const select = vi.fn(() => ({ single }))
  const insert = vi.fn(() => ({ select }))
  const inspectMaybeSingle = vi.fn()
  const inspectToken = vi.fn(() => ({ maybeSingle: inspectMaybeSingle }))
  const inspectId = vi.fn(() => ({ eq: inspectToken }))
  const inspectSelect = vi.fn(() => ({ eq: inspectId }))
  const from = vi.fn(() => ({ insert, select: inspectSelect }))
  return {
    from,
    insert,
    inspectId,
    inspectMaybeSingle,
    inspectSelect,
    inspectToken,
    select,
    single,
    tenantUrl: vi.fn(),
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

vi.mock('@/lib/tenant-resolver', () => ({
  tenantUrl: mocks.tenantUrl,
}))
import {
  DISCORD_APP_LOGIN_ATTEMPT_TTL_SECONDS,
  buildDiscordAppLoginCustomId,
  createDiscordAppLoginLink,
  createDiscordAppLoginToken,
  hashDiscordAppLoginToken,
  inspectDiscordAppLoginLink,
  isValidDiscordAppLoginToken,
  parseDiscordAppLoginCustomId,
} from './discord-app-login'

describe('Discord app login token', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.select.mockImplementation(() => ({ single: mocks.single }))
    mocks.insert.mockImplementation(() => ({ select: mocks.select }))
    mocks.inspectSelect.mockImplementation(() => ({ eq: mocks.inspectId }))
    mocks.inspectId.mockImplementation(() => ({ eq: mocks.inspectToken }))
    mocks.inspectToken.mockImplementation(() => ({ maybeSingle: mocks.inspectMaybeSingle }))
    mocks.from.mockImplementation(() => ({
      insert: mocks.insert,
      select: mocks.inspectSelect,
    }))
    mocks.single.mockResolvedValue({
      data: { id: '11111111-1111-4111-8111-111111111111' },
      error: null,
    })
    mocks.tenantUrl.mockImplementation((slug: string, path: string) => `https://${slug}.example.test${path}`)
  })

  it('creates a high-entropy URL-safe token and hashes the stored representation', () => {
    const token = createDiscordAppLoginToken()

    expect(token).not.toBe(hashDiscordAppLoginToken(token))
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isValidDiscordAppLoginToken(token)).toBe(true)
    expect(isValidDiscordAppLoginToken('too-short')).toBe(false)
    expect(hashDiscordAppLoginToken(token)).toMatch(/^[a-f0-9]{64}$/)
    expect(DISCORD_APP_LOGIN_ATTEMPT_TTL_SECONDS).toBe(5 * 60)
  })

  it('persists only the token hash and returns a tenant-scoped one-time URL', async () => {
    const url = await createDiscordAppLoginLink({
      guildId: 'guild-1',
      tenantSlug: 'menhera',
      discordId: 'member-1',
      returnTo: '/me/wallet',
    })
    const inserted = (Reflect.get(mocks.insert, 'mock') as { calls: unknown[][] }).calls[0]?.[0] as {
      guild_id: string
      discord_id: string
      token_hash: string
      return_to: string
      expires_at: string
    }
    const parsed = new URL(url)
    const rawToken = parsed.searchParams.get('token') ?? ''

    expect(mocks.from).toHaveBeenCalledWith('discord_app_login_attempts')
    expect(inserted).toMatchObject({
      guild_id: 'guild-1',
      discord_id: 'member-1',
      return_to: '/me/wallet',
    })
    expect(inserted.token_hash).toBe(hashDiscordAppLoginToken(rawToken))
    expect(inserted.token_hash).not.toBe(rawToken)
    expect(inserted.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed.origin).toBe('https://menhera.example.test')
    expect(parsed.pathname).toBe('/discord/continue')
    expect(parsed.searchParams.get('id')).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('inspects a mobile handoff without consuming the one-time credential', async () => {
    mocks.inspectMaybeSingle.mockResolvedValue({
      data: {
        consumed_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    })
    const token = createDiscordAppLoginToken()

    await expect(inspectDiscordAppLoginLink({
      attemptId: '11111111-1111-4111-8111-111111111111',
      token,
    })).resolves.toMatchObject({ status: 'active' })

    expect(mocks.inspectSelect).toHaveBeenCalledWith('consumed_at, expires_at')
    expect(mocks.inspectId).toHaveBeenCalledWith(
      'id',
      '11111111-1111-4111-8111-111111111111',
    )
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

describe('Discord app login interaction IDs', () => {
  it('keeps a fixed, validated destination in a Discord-safe custom ID', () => {
    const customId = buildDiscordAppLoginCustomId('wallet')

    expect(customId).toBe('agm_login:v1:wallet')
    expect(customId.length).toBeLessThanOrEqual(100)
    expect(parseDiscordAppLoginCustomId(customId)).toEqual({ destination: 'wallet' })
    expect(parseDiscordAppLoginCustomId('agm_login:v1:../../admin')).toBeNull()
    expect(parseDiscordAppLoginCustomId('agm_login:v2:wallet')).toBeNull()
  })
})
