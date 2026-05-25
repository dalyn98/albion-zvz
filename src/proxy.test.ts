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
})
