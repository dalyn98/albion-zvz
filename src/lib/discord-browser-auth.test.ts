import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))

import {
  DISCORD_BROWSER_AUTH_TTL_SECONDS,
  approveDiscordBrowserAuthAttempt,
  createDiscordBrowserApprovalCode,
  createDiscordBrowserAuthAttempt,
  discordBrowserAuthCookieValue,
  formatDiscordBrowserApprovalCode,
  hashDiscordBrowserAuthValue,
  normalizeDiscordBrowserApprovalCode,
  parseDiscordBrowserAuthCookie,
} from './discord-browser-auth'

describe('Discord browser-bound app authentication', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    vi.stubEnv('COOKIE_SECRET', 'discord-browser-auth-test-secret')
  })

  it('creates a readable code from an unambiguous 32-character alphabet', () => {
    const code = createDiscordBrowserApprovalCode()

    expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/)
    expect(formatDiscordBrowserApprovalCode(code)).toMatch(
      /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/,
    )
    expect(normalizeDiscordBrowserApprovalCode(formatDiscordBrowserApprovalCode(code))).toBe(code)
    expect(normalizeDiscordBrowserApprovalCode('IIII-0000')).toBeNull()
  })

  it('persists only hashes and returns a browser secret separately', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        allowed: true,
        attempt_id: '11111111-1111-4111-8111-111111111111',
        expires_in_seconds: 300,
      },
      error: null,
    })

    const result = await createDiscordBrowserAuthAttempt({
      guildId: 'guild-1',
      returnTo: '/events/event-1?view=party',
      headers: new Headers({ 'x-forwarded-for': '203.0.113.10' }),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.approvalCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(result.browserSecret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(result.expiresInSeconds).toBe(DISCORD_BROWSER_AUTH_TTL_SECONDS)

    const rpcArgs = mocks.rpc.mock.calls[0]?.[1] as Record<string, string>
    expect(rpcArgs.p_return_to).toBe('/events/event-1?view=party')
    expect(rpcArgs.p_code_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(rpcArgs.p_browser_secret_hash).toBe(
      hashDiscordBrowserAuthValue(result.browserSecret),
    )
    expect(JSON.stringify(rpcArgs)).not.toContain(result.browserSecret)
    expect(JSON.stringify(rpcArgs)).not.toContain(result.approvalCode)
  })

  it('binds the opaque browser secret to one attempt cookie', () => {
    const attemptId = '11111111-1111-4111-8111-111111111111'
    const secret = 'a'.repeat(43)
    const value = discordBrowserAuthCookieValue(attemptId, secret)

    expect(parseDiscordBrowserAuthCookie(value)).toEqual({
      attemptId,
      browserSecret: secret,
    })
    expect(parseDiscordBrowserAuthCookie(`22222222-2222-4222-8222-222222222222.short`))
      .toBeNull()
  })

  it('approves only a normalized code for the signed Discord actor', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null })

    await expect(approveDiscordBrowserAuthAttempt({
      guildId: 'guild-1',
      approvalCode: 'ABCD-EFGH',
      discordId: '123456789012345678',
    })).resolves.toBe(true)

    expect(mocks.rpc).toHaveBeenCalledWith(
      'approve_discord_browser_auth_attempt',
      {
        p_guild_id: 'guild-1',
        p_code_hash: hashDiscordBrowserAuthValue('ABCDEFGH'),
        p_discord_id: '123456789012345678',
      },
    )
  })
})
