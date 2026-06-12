import { describe, expect, it } from 'vitest'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { POST } from './route'

describe('POST /api/auth/logout', () => {
  it('clears the app session without forcing the next Discord consent screen', async () => {
    const response = await POST(new Request('https://menhera.example.test/api/auth/logout'))
    const setCookies = response.headers.getSetCookie()

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('https://menhera.example.test/')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(setCookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=;`))).toBe(true)
    expect(setCookies.some((cookie) => cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'))).toBe(true)
  })
})
