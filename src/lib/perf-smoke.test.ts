import { describe, expect, it } from 'vitest'

async function loadPerfSmokeModule() {
  return import(/* @vite-ignore */ new URL('../../scripts/perf-smoke.mjs', import.meta.url).href)
}

describe('perf-smoke script contract', () => {
  it('builds a repeatable public and tenant route matrix without auth secrets', async () => {
    const { buildTargets } = await loadPerfSmokeModule()

    expect(buildTargets({
      baseUrl: 'https://albion-guildmanager.com',
      tenantBaseUrl: 'https://test.albion-guildmanager.com',
      paths: [],
    })).toEqual([
      { label: 'public /features', url: 'https://albion-guildmanager.com/features', requiresAuth: false },
      { label: 'public /pricing', url: 'https://albion-guildmanager.com/pricing', requiresAuth: false },
      { label: 'public /faq', url: 'https://albion-guildmanager.com/faq', requiresAuth: false },
      { label: 'tenant /members', url: 'https://test.albion-guildmanager.com/members', requiresAuth: false },
      { label: 'tenant /regear', url: 'https://test.albion-guildmanager.com/regear', requiresAuth: false },
      { label: 'tenant /shop', url: 'https://test.albion-guildmanager.com/shop', requiresAuth: false },
      { label: 'tenant /me', url: 'https://test.albion-guildmanager.com/me', requiresAuth: false },
    ])
  })

  it('summarizes timing samples with stable median and best values', async () => {
    const { summarizeSamples } = await loadPerfSmokeModule()

    expect(summarizeSamples([
      { status: 200, ttfbMs: 540, totalMs: 620, cache: 'MISS', cdnCacheControl: 'public, s-maxage=3600' },
      { status: 200, ttfbMs: 110, totalMs: 170, cache: 'HIT', cdnCacheControl: 'public, s-maxage=3600' },
      { status: 200, ttfbMs: 160, totalMs: 210, cache: 'HIT', cdnCacheControl: 'public, s-maxage=3600' },
    ])).toEqual({
      status: 200,
      medianTtfbMs: 160,
      medianTotalMs: 210,
      bestTtfbMs: 110,
      bestTotalMs: 170,
      cacheValues: ['HIT', 'MISS'],
      cdnCacheControlValues: ['public, s-maxage=3600'],
    })
  })

  it('formats markdown output for deployment performance reports', async () => {
    const { formatMarkdown } = await loadPerfSmokeModule()

    const markdown = formatMarkdown({
      title: '성능 측정',
      measuredAt: '2026-06-09T06:00:00.000Z',
      samplesPerTarget: 3,
      targets: [
        {
          label: 'public /features',
          url: 'https://albion-guildmanager.com/features',
          requiresAuth: false,
          samples: [
            {
              status: 200,
              ttfbMs: 120,
              totalMs: 180,
              cache: 'HIT',
              cdnCacheControl: 'public, s-maxage=3600',
            },
            {
              status: 200,
              ttfbMs: 150,
              totalMs: 210,
              cache: 'HIT',
              cdnCacheControl: 'public, s-maxage=3600',
            },
            {
              status: 200,
              ttfbMs: 600,
              totalMs: 700,
              cache: 'MISS',
              cdnCacheControl: 'public, s-maxage=3600',
            },
          ],
        },
      ],
    })

    expect(markdown).toContain('# 성능 측정')
    expect(markdown).toContain(
      '| public /features | 200 | 150 | 210 | 120 | 180 | HIT, MISS | public, s-maxage=3600 |',
    )
    expect(markdown).toContain('샘플 수: 3')
  })

  it('fails deployment verification when CDN cache headers are missing', async () => {
    const { validateExpectedCdnCacheControl } = await loadPerfSmokeModule()

    expect(validateExpectedCdnCacheControl({
      targets: [
        {
          label: 'custom /features',
          samples: [
            {
              status: 200,
              ttfbMs: 120,
              totalMs: 180,
              cache: 'MISS',
              cdnCacheControl: '',
            },
          ],
        },
      ],
    }, 'public, s-maxage=3600')).toEqual([
      'custom /features: expected CDN Cache-Control "public, s-maxage=3600", got (missing)',
    ])
  })
})
