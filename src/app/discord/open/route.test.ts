import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getTenantDiscordConfigByDiscordGuildId: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfigByDiscordGuildId: mocks.getTenantDiscordConfigByDiscordGuildId,
}))

vi.mock('@/lib/log', () => ({
  log: {
    warn: mocks.logWarn,
  },
}))

import { GET } from './route'

function request(path: string): NextRequest {
  return new NextRequest(`https://albion-guildmanager.com${path}`)
}

describe('GET /discord/open', () => {
  beforeEach(() => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mocks.getTenantDiscordConfigByDiscordGuildId.mockReset()
    mocks.logWarn.mockReset()
  })

  it('redirects the events destination to the tenant event list home', async () => {
    mocks.getTenantDiscordConfigByDiscordGuildId.mockResolvedValue({
      id: 'tenant-1',
      discordGuildId: '123456789012345678',
      slug: 'menhera',
      name: 'Menhera',
      botInstalled: true,
    })

    const response = await GET(
      request('/discord/open?guild=123456789012345678&dest=events'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://menhera.albion-guildmanager.com/events')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.getTenantDiscordConfigByDiscordGuildId).toHaveBeenCalledWith(
      '123456789012345678',
    )
  })

  it('lets an existing tenant session open Albion onboarding directly', async () => {
    mocks.getTenantDiscordConfigByDiscordGuildId.mockResolvedValue({
      id: 'tenant-1',
      discordGuildId: '123456789012345678',
      slug: 'menhera',
      name: 'Menhera',
      botInstalled: true,
    })

    const response = await GET(
      request('/discord/open?guild=123456789012345678&dest=verify'),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/onboarding/albion',
    )
  })

  it('keeps the guide destination public and tenant-independent', async () => {
    const response = await GET(
      request('/discord/open?guild=not-a-snowflake&dest=guide'),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/member-quick-guide.html',
    )
    expect(mocks.getTenantDiscordConfigByDiscordGuildId).not.toHaveBeenCalled()
  })

  it('does not turn invalid guild or destination input into an open redirect', async () => {
    const response = await GET(
      request('/discord/open?guild=https://evil.example&dest=https://evil.example'),
    )

    expect(response.headers.get('location')).toBe('https://albion-guildmanager.com/faq')
    expect(mocks.getTenantDiscordConfigByDiscordGuildId).not.toHaveBeenCalled()
  })

  it('falls back to FAQ when the Discord guild is no longer linked', async () => {
    mocks.getTenantDiscordConfigByDiscordGuildId.mockResolvedValue(null)

    const response = await GET(
      request('/discord/open?guild=123456789012345678&dest=shop'),
    )

    expect(response.headers.get('location')).toBe('https://albion-guildmanager.com/faq')
  })
})
