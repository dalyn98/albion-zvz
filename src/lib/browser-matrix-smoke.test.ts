import { describe, expect, it } from 'vitest'

async function loadModule() {
  return import(/* @vite-ignore */ new URL('../../scripts/browser-matrix-smoke.mjs', import.meta.url).href)
}

describe('browser matrix smoke', () => {
  it('covers three browser engines, authenticated roles, and mobile Chromium', async () => {
    const { buildMatrixCases, parseMatrixArgs } = await loadModule()
    const config = parseMatrixArgs([
      '--member-storage-state=member.json',
      '--admin-storage-state=admin.json',
    ], {})
    const cases = buildMatrixCases(config)
    expect(new Set(cases.map((entry: { engine: string }) => entry.engine)))
      .toEqual(new Set(['chromium', 'firefox', 'webkit']))
    expect(cases).toEqual(expect.arrayContaining([
      expect.objectContaining({ engine: 'webkit', role: 'member', path: '/events' }),
      expect.objectContaining({ engine: 'firefox', role: 'admin', path: '/admin/dashboard/approvals' }),
      expect.objectContaining({ engine: 'chromium', viewport: 'mobile', path: '/features' }),
      expect.objectContaining({ engine: 'chromium', viewport: 'desktop', path: '/zvz-battles' }),
      expect.objectContaining({
        engine: 'chromium',
        viewport: 'mobile',
        path: '/ar/zvz-battles',
        expectedLanguage: 'ar',
        expectedDirection: 'rtl',
      }),
    ]))
    expect(cases).toContainEqual(expect.objectContaining({
      engine: 'chromium',
      viewport: 'desktop',
      path: '/zvz-battles',
      maxDomNodes: 4_000,
    }))
  })

  it('fails serious accessibility, console, HTTP, and overflow regressions', async () => {
    const { evaluateMatrixResult } = await loadModule()
    expect(evaluateMatrixResult({
      status: 500,
      error: '',
      finalUrl: 'chrome-error://chromewebdata/',
      finalPathname: '',
      storageState: 'admin.json',
      path: '/admin/dashboard',
      consoleErrors: ['boom'],
      horizontalOverflow: 20,
      domNodes: 5_000,
      maxDomNodes: 4_000,
      documentLanguage: 'en',
      documentDirection: 'ltr',
      expectedLanguage: 'ar',
      expectedDirection: 'rtl',
      accessibilityViolations: ['button-name'],
    })).toEqual({
      passed: false,
      reasons: [
        'HTTP 500',
        'invalid final URL chrome-error://chromewebdata/',
        'authenticated route escaped to (empty)',
        '1 console error(s)',
        'horizontal overflow 20px',
        'DOM nodes 5000 exceed budget 4000',
        'document language en',
        'document direction ltr',
        '1 serious/critical accessibility violation(s)',
      ],
    })
  })

  it('includes actionable diagnostics for failed matrix cases', async () => {
    const { markdown } = await loadModule()
    const report = markdown([{
      engine: 'webkit',
      viewport: 'desktop',
      role: 'public',
      path: '/en/docs',
      passed: false,
      reasons: ['1 console error(s)'],
      error: '',
      consoleErrors: ['hydration failed'],
      accessibilityViolations: [],
      domNodes: 3_100,
      maxDomNodes: 4_000,
    }])
    expect(report).toContain('## Failure details')
    expect(report).toContain('### webkit / desktop / public / /en/docs')
    expect(report).toContain('- Console: hydration failed')
    expect(report).toContain('| webkit | desktop | /en/docs | 3100 | 4000 |')
  })
})
