import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  buildOpenBotInstallUrl: vi.fn(),
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

vi.mock('@/lib/oauth-state', () => ({
  signBotInstallState: mocks.signBotInstallState,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  botInstallIntentCookieName: mocks.botInstallIntentCookieName,
  botInstallIntentCookieOptions: mocks.botInstallIntentCookieOptions,
  buildCanonicalAuthBindingBridgeUrl: mocks.buildCanonicalAuthBindingBridgeUrl,
}))

import { GET } from './route'

async function runDeferredTask(index = 0): Promise<void> {
  const task = mocks.after.mock.calls[index]?.[0] as (() => Promise<void> | void) | undefined
  expect(task).toBeDefined()
  await task?.()
}

describe('GET /invite', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.buildOpenBotInstallUrl.mockReturnValue('https://discord.example/install?state=STATE')
    mocks.shouldUseDiscordInstallBridge.mockReturnValue(false)
    mocks.signBotInstallState.mockResolvedValue('STATE')
    mocks.botInstallIntentCookieName.mockImplementation(
      (nonce: string) => `agm_bot_install_${nonce}`,
    )
    mocks.botInstallIntentCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.buildCanonicalAuthBindingBridgeUrl.mockReturnValue(null)
  })

  it('redirects desktop users directly to Discord bot install', async () => {
    const request = new NextRequest('https://albion-guildmanager.com/invite', {
      headers: { 'user-agent': 'Desktop UA' },
    })

    const response = await GET(request)

    expect(response.headers.get('location')).toBe('https://discord.example/install?state=STATE')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    const flowId = mocks.signBotInstallState.mock.calls[0]?.[0]?.nonce as string
    expect(mocks.signBotInstallState).toHaveBeenCalledWith(expect.objectContaining({
      originHost: 'albion-guildmanager.com',
    }))
    expect(response.cookies.get(`agm_bot_install_${flowId}`)?.value).toBe('STATE')
    expect(mocks.recordAuthStart).toHaveBeenCalledWith(request, 'open_bot_install', {
      bridge: false,
      flow_id: expect.any(String),
    })
    expect(mocks.recordSeoAttributionEventFromRequest).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await runDeferredTask()
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
      flow_id: expect.any(String),
    })
    expect(mocks.recordSeoAttributionEventFromRequest).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await runDeferredTask()
    expect(mocks.recordSeoAttributionEventFromRequest).toHaveBeenCalledWith(request, {
      eventType: 'bot_install_start',
      target: '/invite',
    })
  })
})
