import { afterEach, describe, expect, it } from 'vitest'
import { POST } from './route'

const originalPublicKey = process.env.DISCORD_PUBLIC_KEY

describe('POST /api/discord/interactions', () => {
  afterEach(() => {
    process.env.DISCORD_PUBLIC_KEY = originalPublicKey
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
})
