import { describe, expect, it } from 'vitest'
import { getRewrittenUrl, isRewrite } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { config, proxy } from './proxy'

const PUBLIC_MARKETING_CACHE_CONTROL =
  'public, s-maxage=3600, stale-while-revalidate=86400'
const PUBLIC_BATTLELOG_CACHE_CONTROL =
  'public, s-maxage=60, stale-while-revalidate=300'

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

function expectPublicBattlelogCache(response: Response) {
  expect(response.headers.get('cache-control')).toBe(PUBLIC_BATTLELOG_CACHE_CONTROL)
  expect(response.headers.get('cdn-cache-control')).toBe(PUBLIC_BATTLELOG_CACHE_CONTROL)
  expect(response.headers.get('vercel-cdn-cache-control')).toBe(PUBLIC_BATTLELOG_CACHE_CONTROL)
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

  it('keeps tenant root as the app-shell guild home', async () => {
    const response = await proxy(
      new NextRequest('https://menhera.albion-guildmanager.com/', {
        headers: { host: 'menhera.albion-guildmanager.com' },
      }),
    )

    expect(isRewrite(response)).toBe(false)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/')
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

  it('rewrites the public ZvZ board with a short battlelog cache policy', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/zvz-battles?server=east'),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'https://albion-guildmanager.com/public/zvz-battles?server=east',
    )
    expect(forwardedPathname(response)).toBe('/public/zvz-battles')
    expectPublicBattlelogCache(response)
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

  it('rewrites locale-prefixed docs pages while preserving the clean pathname', async () => {
    const homeResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/en/docs'),
    )
    const detailResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/ja/docs/regear/auto'),
    )

    expect(isRewrite(homeResponse)).toBe(true)
    expect(getRewrittenUrl(homeResponse)).toBe(
      'https://albion-guildmanager.com/public/docs',
    )
    expect(forwardedPathname(homeResponse)).toBe('/en/docs')
    expect(forwardedSeoLocale(homeResponse)).toBe('en')
    expectPublicMarketingCache(homeResponse)

    expect(isRewrite(detailResponse)).toBe(true)
    expect(getRewrittenUrl(detailResponse)).toBe(
      'https://albion-guildmanager.com/public/docs/regear/auto',
    )
    expect(forwardedPathname(detailResponse)).toBe('/ja/docs/regear/auto')
    expect(forwardedSeoLocale(detailResponse)).toBe('ja')
    expectPublicMarketingCache(detailResponse)
  })

  it('rewrites locale-prefixed static marketing pages with a stable locale cache key', async () => {
    const homeResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/ja'),
    )
    const pricingResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/en/pricing'),
    )

    expect(isRewrite(homeResponse)).toBe(true)
    expect(getRewrittenUrl(homeResponse)).toBe(
      'https://albion-guildmanager.com/public/landing',
    )
    expect(forwardedPathname(homeResponse)).toBe('/ja')
    expect(forwardedSeoLocale(homeResponse)).toBe('ja')
    expectPublicMarketingCache(homeResponse)

    expect(isRewrite(pricingResponse)).toBe(true)
    expect(getRewrittenUrl(pricingResponse)).toBe(
      'https://albion-guildmanager.com/public/pricing',
    )
    expect(forwardedPathname(pricingResponse)).toBe('/en/pricing')
    expect(forwardedSeoLocale(pricingResponse)).toBe('en')
    expectPublicMarketingCache(pricingResponse)
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

  it('rewrites clean marketing pages on localhost and Vercel previews for QA', async () => {
    const localPricingResponse = await proxy(
      new NextRequest('http://localhost:3000/pricing', {
        headers: { host: 'localhost:3000' },
      }),
    )
    const localDocsResponse = await proxy(
      new NextRequest('http://localhost:3000/docs/admin/logs', {
        headers: { host: 'localhost:3000' },
      }),
    )
    const previewFaqResponse = await proxy(
      new NextRequest('https://albion-guildmanager-git-main-dalyn8690.vercel.app/faq', {
        headers: { host: 'albion-guildmanager-git-main-dalyn8690.vercel.app' },
      }),
    )
    const localRootResponse = await proxy(
      new NextRequest('http://localhost:3000/', {
        headers: { host: 'localhost:3000' },
      }),
    )

    expect(isRewrite(localPricingResponse)).toBe(true)
    expect(getRewrittenUrl(localPricingResponse)).toBe('http://localhost:3000/public/pricing')
    expect(forwardedPathname(localPricingResponse)).toBe('/public/pricing')
    expectPublicMarketingCache(localPricingResponse)

    expect(isRewrite(localDocsResponse)).toBe(true)
    expect(getRewrittenUrl(localDocsResponse)).toBe(
      'http://localhost:3000/public/docs/admin/logs',
    )
    expect(forwardedPathname(localDocsResponse)).toBe('/public/docs/admin/logs')
    expectPublicMarketingCache(localDocsResponse)

    expect(isRewrite(previewFaqResponse)).toBe(true)
    expect(getRewrittenUrl(previewFaqResponse)).toBe(
      'https://albion-guildmanager-git-main-dalyn8690.vercel.app/public/faq',
    )
    expect(forwardedPathname(previewFaqResponse)).toBe('/public/faq')
    expectPublicMarketingCache(previewFaqResponse)

    expect(isRewrite(localRootResponse)).toBe(true)
    expect(getRewrittenUrl(localRootResponse)).toBe('http://localhost:3000/public/landing')
    expect(forwardedPathname(localRootResponse)).toBe('/public/landing')
    expectPublicMarketingCache(localRootResponse)
  })

  it('rewrites the public ZvZ board on localhost with the short battlelog cache policy', async () => {
    const response = await proxy(
      new NextRequest('http://localhost:3000/zvz-battles?server=east', {
        headers: { host: 'localhost:3000' },
      }),
    )

    expect(isRewrite(response)).toBe(true)
    expect(getRewrittenUrl(response)).toBe(
      'http://localhost:3000/public/zvz-battles?server=east',
    )
    expect(forwardedPathname(response)).toBe('/public/zvz-battles')
    expectPublicBattlelogCache(response)
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

  it('redirects direct public ZvZ board URLs to the clean canonical URL', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/public/zvz-battles?server=west'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/zvz-battles?server=west',
    )
  })

  it('redirects tenant-host clean public battle board URLs to the root canonical URL', async () => {
    const response = await proxy(
      new NextRequest('https://menhera.albion-guildmanager.com/zvz-battles?server=east', {
        headers: { host: 'menhera.albion-guildmanager.com' },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/zvz-battles?server=east',
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
    expectPublicMarketingCache(response)
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
    expectPublicMarketingCache(response)
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

  it('keeps real demo event detail pages renderable', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/events/evt-1?from=old'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/demo/events/evt-1')
  })

  it('keeps top-level demo stats and approval pages plus real details renderable', async () => {
    const statsResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/battles'),
    )
    const approvalsResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/regear'),
    )
    const regearResponse = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/regear/rg-1'),
    )

    expect(statsResponse.status).toBe(200)
    expect(statsResponse.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(statsResponse)).toBe('/demo/battles')

    expect(approvalsResponse.status).toBe(200)
    expect(approvalsResponse.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(approvalsResponse)).toBe('/demo/regear')

    expect(regearResponse.status).toBe(200)
    expect(regearResponse.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(regearResponse)).toBe('/demo/regear/rg-1')
  })

  it('keeps selected demo utility pages renderable', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/loot-audit'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/demo/loot-audit')
  })

  it('keeps product-relevant demo utility pages renderable', async () => {
    const response = await proxy(
      new NextRequest('https://albion-guildmanager.com/demo/inventory'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(forwardedPathname(response)).toBe('/demo/inventory')
  })

  it('keeps static assets and the Sentry tunnel out of the proxy matcher', () => {
    expect(config.matcher[0]).toContain('.*\\..*')
    expect(config.matcher[0]).toContain('monitoring')
    expect(config.matcher[0]).toContain('robots.txt')
    expect(config.matcher[0]).toContain('sitemap.xml')
    expect(config.matcher).toContain('/api/auth/:path*')
  })
})
