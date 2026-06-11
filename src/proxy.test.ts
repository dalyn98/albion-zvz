import { describe, expect, it } from 'vitest'
import { getRewrittenUrl, isRewrite } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { config, proxy } from './proxy'

const PUBLIC_MARKETING_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=86400'

function forwardedPathname(response: Response): string | null {
  return response.headers.get('x-middleware-request-x-pathname')
}

function forwardedSeoLocale(response: Response): string | null {
  return response.headers.get('x-middleware-request-x-seo-locale')
}

function forwardedHeaderKeys(response: Response): string[] {
  return (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
}

function expectPublicMarketingCache(response: Response) {
  expect(response.headers.get('cache-control')).toBe(PUBLIC_MARKETING_CACHE_CONTROL)
  expect(response.headers.get('cdn-cache-control')).toBe(PUBLIC_MARKETING_CACHE_CONTROL)
  expect(response.headers.get('vercel-cdn-cache-control')).toBe(PUBLIC_MARKETING_CACHE_CONTROL)
}

function expectNoPublicMarketingCache(response: Response) {
  expect(response.headers.get('cdn-cache-control')).toBeNull()
  expect(response.headers.get('vercel-cdn-cache-control')).toBeNull()
}

describe('proxy pathname forwarding', () => {
  it('forwards shared event detail links to RootLayout as the current request path', async () => {
    const response = await proxy(
      new NextRequest('https://menhera.albion-guildmanager.com/events/event-1'),
    )

    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/events/event-1')
    expect(forwardedHeaderKeys(response)).toContain('x-pathname')
    expect(response.headers.get('x-pathname')).toBeNull()
  })

  it('keeps nested event operational pages classified by their nested path', async () => {
    const response = await proxy(
      new NextRequest('https://menhera.albion-guildmanager.com/events/event-1/report'),
    )

    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/events/event-1/report')
  })

  it('forwards canonical marketing rewrites using the internal public route', async () => {
    const response = await proxy(new NextRequest('https://albion-guildmanager.com/'))

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe('https://albion-guildmanager.com/public/landing')
    expect(forwardedPathname(response)).toBe('/public/landing')
    expectPublicMarketingCache(response)
  })

  it('adds CDN cache headers only to canonical public marketing rewrites', async () => {
    for (const pathname of ['/', '/features', '/pricing', '/faq', '/docs']) {
      const response = await proxy(
        new NextRequest(`https://albion-guildmanager.com${pathname}`),
      )

      expect(isRewrite(response)).toBe(true)
      expectPublicMarketingCache(response)
    }

    const guildResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/g/menhera'),
    )
    const demoResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo'),
    )

    expectNoPublicMarketingCache(guildResponse)
    expectNoPublicMarketingCache(demoResponse)
  })

  it('rewrites canonical feature SEO pages to the internal public route', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/features/auto-regear'),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager.com/public/features/auto-regear',
    )
    expect(forwardedPathname(response)).toBe('/public/features/auto-regear')
  })

  it('rewrites locale-prefixed feature SEO pages while preserving the clean pathname', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/ko/features/auto-regear'),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager.com/public/features/auto-regear',
    )
    expect(forwardedPathname(response)).toBe('/ko/features/auto-regear')
    expect(forwardedSeoLocale(response)).toBe('ko')
    expect(forwardedHeaderKeys(response)).toContain('x-seo-locale')
  })

  it('rewrites clean feature SEO pages on localhost for local QA', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/features/auto-regear', {
        headers: { host: 'localhost:3000' },
      }),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'http://localhost:3000/public/features/auto-regear',
    )
    expect(forwardedPathname(response)).toBe('/public/features/auto-regear')
  })

  it('rewrites clean feature SEO pages on Vercel previews', async () => {
    const response = await proxy(
      new NextRequest(
        'https://albion-guildmanager-git-main-dalyn8690.vercel.app/features',
        { headers: { host: 'albion-guildmanager-git-main-dalyn8690.vercel.app' } },
      ),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager-git-main-dalyn8690.vercel.app/public/features',
    )
    expect(forwardedPathname(response)).toBe('/public/features')
  })

  it('redirects direct public feature URLs to the clean canonical URL', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/public/features/auto-regear?from=preview'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/features/auto-regear?from=preview',
    )
  })

  it('redirects direct public guild profile URLs to the clean canonical URL', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/public/g/menhera?from=discord'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/g/menhera?from=discord',
    )
  })

  it('redirects tenant-host direct public member activity URLs to the root canonical URL', async () => {
    const response = await proxy(
      new NextRequest('https://menhera.albion-guildmanager.com/public/u/share-token'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/u/share-token',
    )
  })

  it('rewrites clean public member activity links to the internal public route', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/u/share-token'),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager.com/public/u/share-token',
    )
    expect(forwardedPathname(response)).toBe('/public/u/share-token')
  })

  it('rewrites tenant battle group links to the public guild battle report', async () => {
    const response = await proxy(
      new NextRequest(
        'https://menhera.albion-guildmanager.com/battles/multi?server=east&ids=1,2',
        { headers: { host: 'menhera.albion-guildmanager.com' } },
      ),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://menhera.albion-guildmanager.com/public/g/menhera/battles/multi?server=east&ids=1,2',
    )
    expect(forwardedPathname(response)).toBe('/public/g/menhera/battles/multi')
  })

  it('rewrites root guild battle group links to the same public report route', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/g/menhera/battles/multi?server=east&ids=1,2'),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager.com/public/g/menhera/battles/multi?server=east&ids=1,2',
    )
    expect(forwardedPathname(response)).toBe('/public/g/menhera/battles/multi')
  })

  it('rewrites clean guild profile links on localhost for local QA', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/g/menhera', {
        headers: { host: 'localhost:3000' },
      }),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe('http://localhost:3000/public/g/menhera')
    expect(forwardedPathname(response)).toBe('/public/g/menhera')
  })

  it('rewrites clean guild profile links on Vercel previews', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager-git-main-dalyn8690.vercel.app/g/menhera', {
        headers: { host: 'albion-guildmanager-git-main-dalyn8690.vercel.app' },
      }),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager-git-main-dalyn8690.vercel.app/public/g/menhera',
    )
    expect(forwardedPathname(response)).toBe('/public/g/menhera')
  })

  it('redirects legacy demo event pages to the focused events scenario', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/events/evt-1?from=old'),
    )

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/demo?scenario=events',
    )
  })

  it('redirects legacy demo stats and regear pages to their focused scenarios', async () => {
    const statsResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/battles'),
    )
    const regearResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/regear/rg-1'),
    )

    expect(statsResponse.status).toBe(308)
    expect(statsResponse.headers.get('location')).toBe(
      'https://albion-guildmanager.com/demo?scenario=stats',
    )
    expect(regearResponse.status).toBe(308)
    expect(regearResponse.headers.get('location')).toBe(
      'https://albion-guildmanager.com/demo?scenario=regear',
    )
  })

  it('keeps selected demo utility pages renderable', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/loot-audit'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/demo/loot-audit')
  })

  it('redirects unapproved old demo utility pages to the single demo surface', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/inventory'),
    )

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://albion-guildmanager.com/demo')
  })

  it('keeps static assets and the Sentry tunnel out of the proxy matcher', () => {
    expect(config.matcher[0]).toContain('.*\\..*')
    expect(config.matcher[0]).toContain('monitoring')
    expect(config.matcher[0]).toContain('robots.txt')
    expect(config.matcher[0]).toContain('sitemap.xml')
    expect(config.matcher).toContain('/api/auth/:path*')
  })
})
