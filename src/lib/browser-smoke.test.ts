import { describe, expect, it } from 'vitest'

async function loadBrowserSmokeModule() {
  return import(/* @vite-ignore */ new URL('../../scripts/browser-smoke.mjs', import.meta.url).href)
}

describe('browser-smoke script contract', () => {
  it('builds a public and demo route matrix by default', async () => {
    const { buildTargets, parseArgs } = await loadBrowserSmokeModule()
    const config = parseArgs([], {})

    expect(config.groups).toEqual(['public', 'demo'])
    expect(buildTargets(config).map((target: { label: string; requiresAuth: boolean }) => ({
      label: target.label,
      requiresAuth: target.requiresAuth,
    }))).toEqual([
      { label: 'public /features', requiresAuth: false },
      { label: 'public /pricing', requiresAuth: false },
      { label: 'public /faq', requiresAuth: false },
      { label: 'public /docs', requiresAuth: false },
      { label: 'public /privacy', requiresAuth: false },
      { label: 'public /terms', requiresAuth: false },
      { label: 'demo /demo', requiresAuth: false },
      { label: 'demo /demo/guide', requiresAuth: false },
      { label: 'demo /demo/settings?tab=guild', requiresAuth: false },
      { label: 'demo /demo/loot-audit', requiresAuth: false },
      { label: 'demo /demo/audit', requiresAuth: false },
      { label: 'demo /demo/craft', requiresAuth: false },
      { label: 'demo /demo/craft/queue', requiresAuth: false },
      { label: 'demo /demo/craft/my-tasks', requiresAuth: false },
      { label: 'demo /demo/craft/orders', requiresAuth: false },
      { label: 'demo /demo/shop', requiresAuth: false },
      { label: 'demo /demo/siphon', requiresAuth: false },
      { label: 'demo /demo/member-events', requiresAuth: false },
      { label: 'demo /demo/battles', requiresAuth: false },
      { label: 'demo /demo/events/evt-1', requiresAuth: false },
      { label: 'demo /demo/regear/rg-1', requiresAuth: false },
      { label: 'demo /demo/members/Eternia', requiresAuth: false },
      { label: 'demo /demo/me/requests', requiresAuth: false },
      { label: 'demo /demo/inventory', requiresAuth: false },
    ])
  })

  it('checks demo detail and legacy redirect destinations exactly', async () => {
    const { buildTargets, evaluateTargetSnapshot, parseArgs } = await loadBrowserSmokeModule()
    const targets = buildTargets(parseArgs(['--groups=demo'], {}))
    const byPath = new Map(targets.map((target: { path: string }) => [target.path, target]))

    expect(byPath.get('/demo/guide')).toMatchObject({
      expectedPathname: '/demo/guide',
      expectedSearch: '',
    })
    expect(byPath.get('/demo/settings?tab=guild')).toMatchObject({
      expectedPathname: '/demo/settings',
      expectedSearch: '?tab=guild',
    })
    expect(byPath.get('/demo/member-events')).toMatchObject({
      expectedPathname: '/demo/member-events',
      expectedSearch: '',
    })
    expect(byPath.get('/demo/inventory')).toMatchObject({
      expectedPathname: '/demo/inventory',
      expectedSearch: '',
    })
    expect(byPath.get('/demo/events/evt-1')).toMatchObject({
      expectedPathname: '/demo/events/evt-1',
      expectedSearch: '',
    })
    expect(byPath.get('/demo/regear/rg-1')).toMatchObject({
      expectedPathname: '/demo/regear/rg-1',
      expectedSearch: '',
      minTextLength: 350,
    })
    expect(byPath.get('/demo/members/Eternia')).toMatchObject({
      expectedPathname: '/demo/members/Eternia',
      expectedSearch: '',
    })
    expect(byPath.get('/demo/craft/queue')).toMatchObject({
      expectedPathname: '/demo/craft/queue',
      expectedSearch: '',
    })

    const result = evaluateTargetSnapshot(byPath.get('/demo/member-events'), {
      status: 200,
      finalUrl: 'https://albion-guildmanager.com/demo',
      bodyText: 'x'.repeat(600),
      consoleErrors: [],
      failedRequests: [],
      usedStorageState: false,
      error: '',
    })

    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('unexpected final path: /demo')
  })

  it('marks member and admin routes as auth-required when selected', async () => {
    const { buildTargets, parseArgs } = await loadBrowserSmokeModule()
    const config = parseArgs(['--groups=member,admin'], {})

    expect(buildTargets(config).map((target: { label: string; authRole: string | null }) => ({
      label: target.label,
      authRole: target.authRole,
    }))).toEqual([
      { label: 'member /me', authRole: 'member' },
      { label: 'member /members', authRole: 'member' },
      { label: 'member /regear', authRole: 'member' },
      { label: 'member /shop?q=infernal&tier=8', authRole: 'member' },
      { label: 'admin /admin/dashboard', authRole: 'admin' },
      { label: 'admin /admin/dashboard/settings', authRole: 'admin' },
      { label: 'admin /admin/dashboard/audit', authRole: 'admin' },
      { label: 'admin /admin/dashboard/stats', authRole: 'admin' },
    ])
  })

  it('can opt into refreshing auth storage state before authenticated smoke checks', async () => {
    const { parseArgs } = await loadBrowserSmokeModule()

    expect(parseArgs(['--refresh-auth-session'], {}).refreshAuthSession).toBe(true)
    expect(parseArgs([], { SMOKE_REFRESH_AUTH_SESSION: '1' }).refreshAuthSession).toBe(true)
    expect(parseArgs([], {}).refreshAuthSession).toBe(false)
  })

  it('can enforce the mobile layout contract at a touch viewport', async () => {
    const { evaluateMobileSnapshot, parseArgs } = await loadBrowserSmokeModule()

    expect(parseArgs(['--mobile'], {}).mobile).toBe(true)
    expect(parseArgs([], { SMOKE_MOBILE: '1' }).mobile).toBe(true)
    expect(parseArgs([], {}).mobile).toBe(false)

    expect(evaluateMobileSnapshot({
      bodyScrollWidth: 390,
      documentScrollWidth: 390,
      viewportWidth: 390,
      zoomableFieldCount: 0,
      undersizedTouchTargets: [],
    })).toEqual({ passed: true, reasons: [] })

    expect(evaluateMobileSnapshot({
      bodyScrollWidth: 427,
      documentScrollWidth: 427,
      viewportWidth: 390,
      zoomableFieldCount: 2,
      undersizedTouchTargets: ['Footer link (15x15)'],
    })).toEqual({
      passed: false,
      reasons: [
        'horizontal overflow: 427px > 390px',
        '2 form field(s) below 16px',
        '1 required touch target(s) below 40px',
      ],
    })
  })

  it('detects raw i18n keys and unresolved placeholders without flagging domains', async () => {
    const { detectRawI18nTokens } = await loadBrowserSmokeModule()

    expect(
      detectRawI18nTokens(
        'shopCatalog.cart.quoteRequired publicPricing.title ctaPrimary {count} albion-guildmanager.com node.js',
      ),
    ).toEqual([
      'ctaPrimary',
      'publicPricing.title',
      'shopCatalog.cart.quoteRequired',
      '{count}',
    ])
  })

  it('ignores aborted client prefetch requests without hiding hard request failures', async () => {
    const { shouldIgnoreRequestFailure } = await loadBrowserSmokeModule()

    expect(
      shouldIgnoreRequestFailure('https://albion-guildmanager.com/demo', 'net::ERR_ABORTED'),
    ).toBe(true)
    expect(
      shouldIgnoreRequestFailure('https://albion-guildmanager.com/api/health', 'net::ERR_FAILED'),
    ).toBe(false)
  })

  it('fails auth routes when they render the login shell instead of the app screen', async () => {
    const { buildTargets, evaluateTargetSnapshot, parseArgs } = await loadBrowserSmokeModule()
    const [target] = buildTargets(parseArgs(['--groups=member'], {}))
    const result = evaluateTargetSnapshot(target, {
      status: 200,
      finalUrl: 'https://albion-guildmanager.com/me',
      bodyText: 'Albion Guild Manager\n\n드가자\n\nDiscord로 로그인\n내 길드에서 사용해보기\nMade By Monkku',
      consoleErrors: [],
      failedRequests: [],
      usedStorageState: true,
      error: '',
    })

    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('auth route rendered the login screen')
  })

  it('fails auth routes when rolling session refresh fails', async () => {
    const { buildTargets, evaluateTargetSnapshot, parseArgs } = await loadBrowserSmokeModule()
    const [target] = buildTargets(parseArgs(['--groups=member'], {}))
    const result = evaluateTargetSnapshot(target, {
      status: 200,
      finalUrl: 'https://albion-guildmanager.com/me',
      bodyText: 'x'.repeat(600),
      consoleErrors: [],
      failedRequests: [],
      usedStorageState: true,
      authRefreshError: 'auth session refresh failed: 401',
      error: '',
    })

    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('auth session refresh failed: 401')
  })

  it('formats markdown without leaking storage state contents', async () => {
    const { formatMarkdown } = await loadBrowserSmokeModule()
    const markdown = formatMarkdown({
      measuredAt: '2026-06-11T00:00:00.000Z',
      baseUrl: 'https://albion-guildmanager.com',
      groups: ['public'],
      includeTextExcerpts: false,
      results: [
        {
          label: 'public /features',
          passed: true,
          status: 200,
          finalUrl: 'https://albion-guildmanager.com/features',
          textLength: 1200,
          rawTokens: [],
          consoleErrors: [],
          failedRequests: [],
          reasons: [],
        },
      ],
    })

    expect(markdown).toContain('# Browser Smoke 검증')
    expect(markdown).toContain('| public /features | PASS | 200 | /features | 1200 | 0 | 0 | 0 |')
    expect(markdown).toContain('--refresh-auth-session')
    expect(markdown).toContain('쿠키와 storageState 내용은 보고서에 기록하지 않습니다.')
  })
})
