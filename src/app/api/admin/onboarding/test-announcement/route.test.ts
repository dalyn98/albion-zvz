import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  class DiscordChannelMessageError extends Error {
    constructor(
      public readonly status: number,
      public readonly discordCode: number | null,
      public readonly discordMessage: string | null,
      public readonly raw: string,
    ) {
      super(`Discord channel message failed (${status})`)
    }
  }

  return {
    getSession: vi.fn(),
    getSessionGuildId: vi.fn(),
    getTenantDiscordConfig: vi.fn(),
    getTranslations: vi.fn(),
    sendDiscordChannelMessage: vi.fn(),
    DiscordChannelMessageError,
  }
})

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/discord', () => ({
  sendDiscordChannelMessage: mocks.sendDiscordChannelMessage,
  DiscordChannelMessageError: mocks.DiscordChannelMessageError,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

import { POST } from './route'

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest('https://menhera.albion-guildmanager.com/api/admin/onboarding/test-announcement', {
    method: 'POST',
    headers,
  })
}

function expectNoStore(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  expect(response.headers.get('pragma')).toBe('no-cache')
  expect(response.headers.get('expires')).toBe('0')
}

describe('POST /api/admin/onboarding/test-announcement', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getTenantDiscordConfig.mockReset()
    mocks.getTranslations.mockReset()
    mocks.sendDiscordChannelMessage.mockReset()
    mocks.getTranslations.mockResolvedValue((key: string, values?: Record<string, string>) => {
      if (key === 'discordTestContent') return `Setup test for ${values?.guildName ?? ''}`
      return key
    })
  })

  it('requires an admin session before resolving tenant Discord config', async () => {
    mocks.getSession.mockResolvedValue({ isAdmin: false })

    const response = await POST(request())

    expect(response.status).toBe(401)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ ok: false, code: 'unauthorized' })
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
  })

  it('rejects cross-origin POST attempts before sending to Discord', async () => {
    mocks.getSession.mockResolvedValue({ isAdmin: true, discordId: 'admin-1' })

    const response = await POST(
      request({
        host: 'menhera.albion-guildmanager.com',
        origin: 'https://evil.example',
      }),
    )

    expect(response.status).toBe(403)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ ok: false, code: 'forbidden_origin' })
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
  })

  it('returns a channel setup error when the tenant has no default event channel', async () => {
    mocks.getSession.mockResolvedValue({ isAdmin: true, discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
      eventChannelId: null,
      botInstalled: true,
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ ok: false, code: 'channel_missing' })
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
  })

  it('sends a quiet setup test message to the tenant event channel', async () => {
    mocks.getSession.mockResolvedValue({ isAdmin: true, discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
      eventChannelId: 'channel-1',
      botInstalled: true,
    })
    mocks.sendDiscordChannelMessage.mockResolvedValue('message-1')

    const response = await POST(
      request({
        host: 'menhera.albion-guildmanager.com',
        origin: 'https://menhera.albion-guildmanager.com',
      }),
    )

    expect(response.status).toBe(200)
    expectNoStore(response)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.objectContaining({
        content: 'Setup test for Menhera',
        allowed_mentions: { parse: [] },
      }),
    )
  })
})
