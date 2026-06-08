import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  recordClientSeoAttributionEvent: vi.fn(),
}))

vi.mock('@/lib/seo-attribution', () => ({
  SEO_SESSION_COOKIE: 'agm_seo_session',
  recordClientSeoAttributionEvent: mocks.recordClientSeoAttributionEvent,
}))

import { POST } from './route'

function request(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('https://albion-guildmanager.com/api/marketing/attribution', {
    method: 'POST',
    headers: {
      host: 'albion-guildmanager.com',
      origin: 'https://albion-guildmanager.com',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/marketing/attribution', () => {
  beforeEach(() => {
    mocks.recordClientSeoAttributionEvent.mockReset()
    mocks.recordClientSeoAttributionEvent.mockResolvedValue({
      ok: true,
      visitorId: '00000000-0000-4000-8000-000000000001',
    })
  })

  it('rejects cross-origin tracking attempts before touching storage', async () => {
    const response = await POST(
      request(
        { eventType: 'landing_view', path: '/features/auto-regear' },
        { origin: 'https://evil.example' },
      ),
    )

    expect(response.status).toBe(403)
    expect(mocks.recordClientSeoAttributionEvent).not.toHaveBeenCalled()
  })

  it('rejects unsupported client event types', async () => {
    const response = await POST(
      request({ eventType: 'bot_install_start', path: '/features/auto-regear' }),
    )

    expect(response.status).toBe(400)
    expect(mocks.recordClientSeoAttributionEvent).not.toHaveBeenCalled()
  })

  it('records allowlisted feature-page events and sets the HttpOnly session cookie', async () => {
    const payload = {
      eventType: 'landing_view',
      path: '/en/features/auto-regear?utm_source=google',
      referrer: 'https://www.google.com/search?q=albion',
    }

    const response = await POST(request(payload))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.recordClientSeoAttributionEvent).toHaveBeenCalledWith(
      expect.any(NextRequest),
      payload,
    )
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('agm_seo_session=00000000-0000-4000-8000-000000000001')
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
  })
})
