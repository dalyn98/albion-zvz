import { describe, expect, it } from 'vitest'
import { HTTP_SECURITY_HEADERS } from './http-security-headers'

describe('HTTP security headers', () => {
  const headers = Object.fromEntries(
    HTTP_SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]),
  )

  it('prevents framing, MIME sniffing, and unnecessary browser capabilities', () => {
    expect(headers).toMatchObject({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    })
  })

  it('uses a compatibility-safe CSP that protects document-level sinks', () => {
    expect(headers['content-security-policy']).toBe(
      "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    )
    expect(headers['content-security-policy']).not.toContain('script-src')
    expect(headers['content-security-policy']).not.toContain('style-src')
  })

  it('does not define duplicate response header keys', () => {
    const keys = HTTP_SECURITY_HEADERS.map(({ key }) => key.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })
})
