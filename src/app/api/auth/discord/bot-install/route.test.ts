import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getSession: vi.fn(),
  buildBotInstallUrl: vi.fn(),
  shouldUseDiscordInstallBridge: vi.fn(),
  recordAuthStart: vi.fn(),
  recordSeoAttributionEventFromRequest: vi.fn(),
  signBotInstallState: vi.fn(),
  botInstallIntentCookieName: vi.fn(),
  botInstallIntentCookieOptions: vi.fn(),
  buildCanonicalAuthBindingBridgeUrl: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: mocks.after,
  }
})

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

vi.mock('@/lib/oauth-state', () => ({
  signBotInstallState: mocks.signBotInstallState,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  botInstallIntentCookieName: mocks.botInstallIntentCookieName,
  botInstallIntentCookieOptions: mocks.botInstallIntentCookieOptions,
  buildCanonicalAuthBindingBridgeUrl: mocks.buildCanonicalAuthBindingBridgeUrl,
}))

vi.mock('@/lib/seo-attribution', () => ({
  recordSeoAttributionEventFromRequest: mocks.recordSeoAttributionEventFromRequest,
}))

import { GET } from './route'

async function runDeferredTask(index = 0): Promise<void> {
  const task = mocks.after.mock.calls[index]?.[0] as (() => Promise<void> | void) | undefined
  expect(task).toBeDefined()
  await task?.()
}

describe('GET /api/auth/discord/bot-install', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'user-1' })
    mocks.buildBotInstallUrl.mockReturnValue('https://discord.example/install?guild_id=123456789012345678')
    mocks.shouldUseDiscordInstallBridge.mockReturnValue(false)
    mocks.signBotInstallState.mockResolvedValue('STATE')
    mocks.botInstallIntentCookieName.mockImplementation(
      (nonce: string) => `agm_bot_install_${nonce}`,
    )
    mocks.botInstallIntentCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.buildCanonicalAuthBindingBridgeUrl.mockReturnValue(null)
  })

  it('redirects unauthenticated users back through onboarding login', async () => {
    mocks.getSession.mockResolvedValue(null)
    const request = new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bot-install?guild_id=123456789012345678',
    )

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/login?returnTo=%2Fonboard',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.after).not.toHaveBeenCalled()
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
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    const flowId = mocks.signBotInstallState.mock.calls[0]?.[0]?.nonce as string
    expect(mocks.signBotInstallState).toHaveBeenCalledWith(expect.objectContaining({
      originHost: 'albion-guildmanager.com',
    }))
    expect(response.cookies.get(`agm_bot_install_${flowId}`)?.value).toBe('STATE')
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'bot_install', {
      bridge: false,
      flow_id: expect.any(String),
      guild_id: '123456789012345678',
    })
    expect(mocks.recordSeoAttributionEventFromRequest).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await runDeferredTask()
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'bot_install_start',
      target: '/api/auth/discord/bot-install',
    })
  })

  it('uses independent cookies for concurrent bot install starts', async () => {
    mocks.signBotInstallState.mockImplementation(async ({ nonce }: { nonce: string }) =>
      `STATE_${nonce}`)

    const [first, second] = await Promise.all([
      GET(new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-install?guild_id=123456789012345678',
      )),
      GET(new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-install?guild_id=999999999999999999',
      )),
    ])

    const firstIntent = first.cookies.getAll().find((cookie) =>
      cookie.name.startsWith('agm_bot_install_'))
    const secondIntent = second.cookies.getAll().find((cookie) =>
      cookie.name.startsWith('agm_bot_install_'))

    expect(firstIntent?.name).toBeTruthy()
    expect(secondIntent?.name).toBeTruthy()
    expect(firstIntent?.name).not.toBe(secondIntent?.name)
    expect(firstIntent?.value).not.toBe(secondIntent?.value)
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
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'bot_install', {
      bridge: true,
      flow_id: expect.any(String),
      guild_id: '123456789012345678',
    })
    expect(mocks.recordSeoAttributionEventFromRequest).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await runDeferredTask()
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'bot_install_start',
      target: '/api/auth/discord/bot-install',
    })
  })
})
