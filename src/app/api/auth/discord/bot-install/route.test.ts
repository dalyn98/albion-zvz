import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  buildBotInstallUrl: vi.fn(),
  shouldUseDiscordInstallBridge: vi.fn(),
  recordAuthStart: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/discord', () => ({
  buildBotInstallUrl: mocks.buildBotInstallUrl,
}))

vi.mock('@/lib/discord-install-bridge', () => ({
  shouldUseDiscordInstallBridge: mocks.shouldUseDiscordInstallBridge,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  recordAuthStart: mocks.recordAuthStart,
}))

import { GET } from './route'

describe('GET /api/auth/discord/bot-install', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'user-1' })
    mocks.buildBotInstallUrl.mockReturnValue('https://discord.example/install?guild_id=123456789012345678')
    mocks.shouldUseDiscordInstallBridge.mockReturnValue(false)
  })

  it('redirects unauthenticated users back through onboarding login', async () => {
    mocks.getSession.mockResolvedValue(null)
    const request = new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bot-install?guild_id=123456789012345678',
    )

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/api/auth/discord/start?returnTo=/onboard',
    )
  })

  it('redirects desktop users directly to the guild-locked Discord install URL', async () => {
    const request = new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bot-install?guild_id=123456789012345678',
      { headers: { 'user-agent': 'Desktop UA' } },
    )

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://discord.example/install?guild_id=123456789012345678',
    )
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'bot_install', {
      bridge: false,
      guild_id: '123456789012345678',
    })
  })

  it('routes mobile guild-locked installs through the bridge page', async () => {
    mocks.shouldUseDiscordInstallBridge.mockReturnValue(true)
    const request = new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bot-install?guild_id=123456789012345678',
      { headers: { 'user-agent': 'Mobile UA' } },
    )

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard/bot-install/open?guild_id=123456789012345678',
    )
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'bot_install', {
      bridge: true,
      guild_id: '123456789012345678',
    })
  })
})
