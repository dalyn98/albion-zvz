import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getMarketingMyGuildHref: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/last-guild', () => ({
  getMarketingMyGuildHref: mocks.getMarketingMyGuildHref,
}))

import { GET } from './route'

describe('GET /api/marketing/my-guild', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getMarketingMyGuildHref.mockReset()
  })

  it('returns the remembered guild href even when the Discord session is gone', async () => {
    mocks.getSession.mockResolvedValue(null)
    mocks.getMarketingMyGuildHref.mockResolvedValue(
      'https://menhera.albion-guildmanager.com/',
    )

    const response = await GET()

    await expect(response.json()).resolves.toEqual({
      href: 'https://menhera.albion-guildmanager.com/',
    })
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.getMarketingMyGuildHref).toHaveBeenCalledWith(null)
  })

  it('returns null when neither session nor last-guild cookie can resolve a guild', async () => {
    mocks.getSession.mockResolvedValue(null)
    mocks.getMarketingMyGuildHref.mockResolvedValue(null)

    const response = await GET()

    await expect(response.json()).resolves.toEqual({ href: null })
  })
})
