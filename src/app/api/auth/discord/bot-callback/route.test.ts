import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { GET } from './route'

describe('GET /api/auth/discord/bot-callback', () => {
  it('redacts OAuth query values before logging invalid guild ids', async () => {
    const response = await GET(
      new NextRequest(
        'https://example.test/api/auth/discord/bot-callback?guild_id=bad&code=oauth-code&state=signed-state&permissions=8',
      ),
    )

    expect(response.headers.get('location')).toBe('https://example.test/onboard?install_error=guild_id_missing')
    expect(mocks.logError).toHaveBeenCalledWith(
      '[bot-callback] invalid guild_id',
      undefined,
      expect.objectContaining({
        params: expect.stringContaining('permissions=8'),
      }),
    )
    const params = mocks.logError.mock.calls[0]?.[2]?.params as string
    expect(params).not.toContain('oauth-code')
    expect(params).not.toContain('signed-state')
    expect(new URLSearchParams(params).get('code')).toBe('[redacted]')
    expect(new URLSearchParams(params).get('state')).toBe('[redacted]')
  })

  it('redacts state when logging missing code diagnostics', async () => {
    await GET(
      new NextRequest(
        'https://example.test/api/auth/discord/bot-callback?guild_id=123456789012345678&state=signed-state&permissions=8',
      ),
    )

    expect(mocks.logError).toHaveBeenCalledWith(
      '[bot-callback] missing code',
      undefined,
      expect.objectContaining({
        params: expect.not.stringContaining('signed-state'),
      }),
    )
  })
})
