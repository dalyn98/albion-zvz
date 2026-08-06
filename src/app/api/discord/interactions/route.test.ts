import { generateKeyPairSync, sign as signMessage } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => {
  const backgroundTasks: Array<() => Promise<void> | void> = []
  return {
    backgroundTasks,
    after: vi.fn((task: () => Promise<void> | void) => {
      backgroundTasks.push(task)
    }),
    editOriginalInteractionResponse: vi.fn(),
    handleDiscordAppLoginInteraction: vi.fn(),
  }
})

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: routeMocks.after }
})

vi.mock('@/lib/discord-interactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/discord-interactions')>()
  return {
    ...actual,
    editOriginalInteractionResponse: routeMocks.editOriginalInteractionResponse,
  }
})

vi.mock('@/lib/discord-commands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/discord-commands')>()
  return {
    ...actual,
    handleDiscordAppLoginInteraction: routeMocks.handleDiscordAppLoginInteraction,
  }
})

import { POST } from './route'

const originalPublicKey = process.env.DISCORD_PUBLIC_KEY

function signedInteractionRequest(payload: object): Request {
  const rawBody = JSON.stringify(payload)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  process.env.DISCORD_PUBLIC_KEY = publicKeyDer.subarray(-32).toString('hex')
  const signature = signMessage(
    null,
    Buffer.from(timestamp + rawBody, 'utf8'),
    privateKey,
  ).toString('hex')

  return new Request('https://example.test/api/discord/interactions', {
    method: 'POST',
    headers: {
      'x-signature-ed25519': signature,
      'x-signature-timestamp': timestamp,
    },
    body: rawBody,
  })
}

describe('POST /api/discord/interactions', () => {
  beforeEach(() => {
    routeMocks.backgroundTasks.length = 0
    routeMocks.after.mockClear()
    routeMocks.editOriginalInteractionResponse.mockReset()
    routeMocks.handleDiscordAppLoginInteraction.mockReset()
  })

  afterEach(() => {
    if (originalPublicKey === undefined) delete process.env.DISCORD_PUBLIC_KEY
    else process.env.DISCORD_PUBLIC_KEY = originalPublicKey
  })

  it('rejects stale signed interaction requests before signature verification', async () => {
    process.env.DISCORD_PUBLIC_KEY = '00'.repeat(32)
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301)

    const response = await POST(
      new Request('https://example.test/api/discord/interactions', {
        method: 'POST',
        headers: {
          'x-signature-ed25519': '00'.repeat(64),
          'x-signature-timestamp': staleTimestamp,
        },
        body: '{"type":1}',
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe('Bad signature')
  })

  it('acknowledges legacy app-login buttons before running database-backed work', async () => {
    const payload = {
      id: 'interaction-1',
      application_id: 'application-1',
      token: 'interaction-token',
      type: 3,
      guild_id: 'guild-1',
      channel_id: 'channel-1',
      data: { custom_id: 'agm_login:v1:verify', component_type: 2 },
      member: { user: { id: 'user-1', username: 'member' } },
    }
    const completedResponse = {
      type: 4,
      data: { content: 'ready', flags: 1 << 6 },
    }
    routeMocks.handleDiscordAppLoginInteraction.mockResolvedValueOnce(completedResponse)

    const response = await POST(signedInteractionRequest(payload))

    await expect(response.json()).resolves.toEqual({
      type: 5,
      data: { flags: 1 << 6 },
    })
    expect(routeMocks.handleDiscordAppLoginInteraction).not.toHaveBeenCalled()
    expect(routeMocks.backgroundTasks).toHaveLength(1)

    await routeMocks.backgroundTasks[0]?.()

    expect(routeMocks.handleDiscordAppLoginInteraction).toHaveBeenCalledWith(payload)
    expect(routeMocks.editOriginalInteractionResponse).toHaveBeenCalledWith(
      payload,
      completedResponse,
    )
  })
})
