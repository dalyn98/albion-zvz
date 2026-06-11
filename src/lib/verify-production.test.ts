import { describe, expect, it } from 'vitest'

async function loadVerifyProductionModule() {
  return import(/* @vite-ignore */ new URL('../../scripts/verify-production.mjs', import.meta.url).href)
}

describe('verify-production script contract', () => {
  it('builds cache and browser verification steps with artifact outputs', async () => {
    const { buildVerificationSteps, parseArgs } = await loadVerifyProductionModule()
    const config = parseArgs([
      '--base-url',
      'https://example.test/',
      '--output-dir',
      '/tmp/albion-verify',
      '--samples',
      '5',
      '--browser-groups',
      'public,demo',
    ], {})

    expect(config).toMatchObject({
      baseUrl: 'https://example.test',
      outputDir: '/tmp/albion-verify',
      publicCachePaths: ['/features', '/pricing', '/faq', '/docs'],
      browserGroups: ['public', 'demo'],
      samples: 5,
      expectedCdnCacheControl: 'public, s-maxage=3600, stale-while-revalidate=86400',
      skipCache: false,
      skipBrowser: false,
    })

    const steps = buildVerificationSteps(config)
    expect(steps.map((step: { label: string }) => step.label)).toEqual([
      'public-cache',
      'browser-public',
    ])
    expect(steps[0].args).toEqual(expect.arrayContaining([
      'scripts/perf-smoke.mjs',
      '--base-url',
      'https://example.test',
      '--expect-cdn-cache-control',
      'public, s-maxage=3600, stale-while-revalidate=86400',
      '--output',
      '/tmp/albion-verify/public-cache.md',
    ]))
    expect(steps[1].args).toEqual(expect.arrayContaining([
      'scripts/browser-smoke.mjs',
      '--groups',
      'public,demo',
      '--output',
      '/tmp/albion-verify/browser-public.md',
      '--screenshot-dir',
      '/tmp/albion-verify/screenshots',
    ]))
  })

  it('supports running only the cache verification step', async () => {
    const { buildVerificationSteps, parseArgs } = await loadVerifyProductionModule()
    const config = parseArgs([
      '--output-dir',
      '/tmp/albion-verify',
      '--skip-browser',
    ], {})

    expect(buildVerificationSteps(config).map((step: { label: string }) => step.label))
      .toEqual(['public-cache'])
  })

  it('formats a compact summary for deployment logs', async () => {
    const { formatSummary } = await loadVerifyProductionModule()

    expect(formatSummary({
      baseUrl: 'https://albion-guildmanager.com',
      outputDir: '/tmp/albion-verify',
    }, [
      { label: 'public-cache', code: 0, durationMs: 1234 },
      { label: 'browser-public', code: 1, durationMs: 2222 },
    ])).toContain('| browser-public | FAIL 1 | 2.2s |')
  })
})
