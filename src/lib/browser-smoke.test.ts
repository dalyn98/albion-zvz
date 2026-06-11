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
      { label: 'demo /demo/regear', requiresAuth: false },
      { label: 'demo /demo/stats', requiresAuth: false },
      { label: 'demo /demo/members', requiresAuth: false },
      { label: 'demo /demo/shop', requiresAuth: false },
    ])
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

  it('detects raw i18n keys and unresolved placeholders without flagging domains', async () => {
    const { detectRawI18nTokens } = await loadBrowserSmokeModule()

    expect(
      detectRawI18nTokens('shopCatalog.cart.quoteRequired {count} albion-guildmanager.com node.js'),
    ).toEqual(['shopCatalog.cart.quoteRequired', '{count}'])
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
    expect(markdown).toContain('쿠키와 storageState 내용은 보고서에 기록하지 않습니다.')
  })
})
