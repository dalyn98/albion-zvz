import { describe, expect, it } from 'vitest'
import { getRewrittenUrl, isRewrite } from 'next/experimental/testing/server'
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

function forwardedPathname(response: Response): string | null {
  return response.headers.get('x-middleware-request-x-pathname')
}

function forwardedHeaderKeys(response: Response): string[] {
  return (response.headers.get('x-middleware-override-headers') ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
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
})
