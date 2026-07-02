import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}))

const getAdminClientMock = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => getAdminClientMock(),
}))

import { loadMarketingScreenshots } from './marketing-screenshots'

afterEach(() => {
  vi.unstubAllEnvs()
  getAdminClientMock.mockReset()
})

describe('loadMarketingScreenshots', () => {
  it('uses bundled fallback screenshots when Supabase admin env is not available', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')

    const screenshots = await loadMarketingScreenshots()

    expect(getAdminClientMock).not.toHaveBeenCalled()
    expect(screenshots.events).toEqual([
      expect.objectContaining({
        id: 'fallback-events-demo',
        source: 'fallback',
      }),
    ])
  })

  it('uses database screenshots per slot and fills missing slots with fallbacks', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role')

    const query = {
      select: vi.fn(),
      order: vi.fn(),
    }
    query.select.mockReturnValue(query)
    query.order
      .mockReturnValueOnce(query)
      .mockReturnValueOnce(query)
      .mockResolvedValueOnce({
        data: [
          {
            id: 'db-regear-1',
            slot: 'regear',
            position: 2,
            image_url: 'https://cdn.example/regear.png',
            alt_text: 'Regear screenshot',
          },
          {
            id: 'db-invalid-1',
            slot: 'unknown',
            position: 0,
            image_url: 'https://cdn.example/unknown.png',
            alt_text: null,
          },
        ],
        error: null,
      })

    getAdminClientMock.mockReturnValue({
      from: vi.fn(() => query),
    })

    const screenshots = await loadMarketingScreenshots()

    expect(screenshots.regear).toEqual([
      {
        id: 'db-regear-1',
        url: 'https://cdn.example/regear.png',
        alt: 'Regear screenshot',
        position: 2,
        source: 'database',
      },
    ])
    expect(screenshots.events[0]?.source).toBe('fallback')
  })
})
