import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAdminClientMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: getAdminClientMock,
}))

import sitemap from './sitemap'

describe('sitemap dependency recovery', () => {
  beforeEach(() => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      abortSignal: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    query.in.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.limit.mockReturnValue(query)
    query.abortSignal.mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    getAdminClientMock.mockReturnValue({
      from: vi.fn(() => query),
    })
  })

  it('keeps static routes available when database-backed entries time out', async () => {
    const entries = await sitemap()

    expect(entries).toContainEqual(expect.objectContaining({
      url: 'https://albion-guildmanager.com/',
    }))
    expect(entries.some((entry) => entry.url.includes('/g/'))).toBe(false)
  })
})
