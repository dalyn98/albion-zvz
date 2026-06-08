import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  buildOpenBotInstallUrl: vi.fn(),
  shouldUseDiscordInstallBridge: vi.fn(),
  recordAuthStart: vi.fn(),
  recordSeoAttributionEventFromRequest: vi.fn(),
}))

vi.mock('@/lib/discord', () => ({
  buildOpenBotInstallUrl: mocks.buildOpenBotInstallUrl,
}))

vi.mock('@/lib/discord-install-bridge', () => ({
  shouldUseDiscordInstallBridge: mocks.shouldUseDiscordInstallBridge,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  recordAuthStart: mocks.recordAuthStart,
}))

vi.mock('@/lib/seo-attribution', () => ({
  recordSeoAttributionEventFromRequest: mocks.recordSeoAttributionEventFromRequest,
}))

import { GET } from './route'

describe('GET /invite', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.buildOpenBotInstallUrl.mockReturnValue('https://discord.example/install?state=STATE')
    mocks.shouldUseDiscordInstallBridge.mockReturnValue(false)
  })

  it('redirects desktop users directly to Discord bot install', async () => {
    const request = new NextRequest('https://albion-guildmanager.com/invite', {
      headers: { 'user-agent': 'Desktop UA' },
    })

    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://discord.example/install?state=STATE')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'open_bot_install', {
      bridge: false,
    })
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'bot_install_start',
      target: '/invite',
    })
  })

  it('routes mobile users through the install bridge page', async () => {
    mocks.shouldUseDiscordInstallBridge.mockReturnValue(true)
    const request = new NextRequest('https://albion-guildmanager.com/invite', {
      headers: { 'user-agent': 'Mobile UA' },
    })

    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://albion-guildmanager.com/invite/open')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'open_bot_install', {
      bridge: true,
    })
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'bot_install_start',
      target: '/invite',
    })
  })
})
