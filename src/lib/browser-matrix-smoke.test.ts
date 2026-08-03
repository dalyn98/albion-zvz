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
      expect.objectContaining({ engine: 'webkit', role: 'member', path: '/me' }),
      expect.objectContaining({ engine: 'firefox', role: 'admin', path: '/admin/dashboard' }),
      expect.objectContaining({ engine: 'chromium', viewport: 'mobile', path: '/features' }),
    ]))
  })

  it('fails serious accessibility, console, HTTP, and overflow regressions', async () => {
    const { evaluateMatrixResult } = await loadModule()
    expect(evaluateMatrixResult({
      status: 500,
      error: '',
      consoleErrors: ['boom'],
      horizontalOverflow: 20,
      accessibilityViolations: ['button-name'],
    })).toEqual({
      passed: false,
      reasons: [
        'HTTP 500',
        '1 console error(s)',
        'horizontal overflow 20px',
        '1 serious/critical accessibility violation(s)',
      ],
    })
  })
})
