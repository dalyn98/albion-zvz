import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createAttempt: vi.fn(),
  resolveTenantBySlug: vi.fn(),
}))

vi.mock('@/lib/discord-browser-auth', () => ({
  DISCORD_BROWSER_AUTH_COOKIE: 'agm_discord_browser_auth',
  createDiscordBrowserAuthAttempt: mocks.createAttempt,
  discordBrowserAuthCookieOptions: (maxAge: number) => ({
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/api/auth/discord/device',
    maxAge,
  }),
  discordBrowserAuthCookieValue: (id: string, secret: string) => `${id}.${secret}`,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  FALLBACK_TENANT_SLUG: 'menhera',
  classifyHost: () => ({ kind: 'tenant', slug: 'menhera' }),
  resolveTenantBySlug: mocks.resolveTenantBySlug,
}))

import { POST } from './route'

describe('POST /api/auth/discord/device/start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantBySlug.mockResolvedValue({
      tenantId: 'guild-1',
      slug: 'menhera',
      discordGuildId: '123456789012345678',
    })
    mocks.createAttempt.mockResolvedValue({
      ok: true,
      attemptId: '11111111-1111-4111-8111-111111111111',
      approvalCode: 'ABCD-EFGH',
      browserSecret: 'secret',
      expiresInSeconds: 300,
    })
  })

  it('preserves the shared URL and sets a browser-only binding cookie', async () => {
    const response = await POST(new NextRequest(
      'https://menhera.example.test/api/auth/discord/device/start',
      {
        method: 'POST',
        headers: {
          host: 'menhera.example.test',
          origin: 'https://menhera.example.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ returnTo: '/events/event-1?view=party' }),
      },
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.createAttempt).toHaveBeenCalledWith(expect.objectContaining({
      guildId: 'guild-1',
      returnTo: '/events/event-1?view=party',
    }))
    expect(body).toMatchObject({
      ok: true,
      approvalCode: 'ABCD-EFGH',
      discordUrl: 'https://discord.com/channels/123456789012345678',
    })
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=strict')
    expect(response.headers.get('set-cookie')).toContain('Path=/api/auth/discord/device')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('rejects cross-origin attempt creation', async () => {
    const response = await POST(new NextRequest(
      'https://menhera.example.test/api/auth/discord/device/start',
      {
        method: 'POST',
        headers: {
          host: 'menhera.example.test',
          origin: 'https://attacker.example',
          'content-type': 'application/json',
        },
        body: '{}',
      },
    ))

    expect(response.status).toBe(403)
    expect(mocks.createAttempt).not.toHaveBeenCalled()
  })
})
