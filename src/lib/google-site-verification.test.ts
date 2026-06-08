import { describe, expect, it } from 'vitest'
import { normalizeGoogleSiteVerificationToken } from './google-site-verification'

describe('google site verification token normalization', () => {
  it('accepts a raw token', () => {
    expect(normalizeGoogleSiteVerificationToken('abc_123-XYZ')).toBe('abc_123-XYZ')
  })

  it('extracts the content value when Search Console meta tag is pasted', () => {
    expect(
      normalizeGoogleSiteVerificationToken(
        '<meta name="google-site-verification" content="abc_123-XYZ" />',
      ),
    ).toBe('abc_123-XYZ')
  })

  it('rejects empty or malformed input', () => {
    expect(normalizeGoogleSiteVerificationToken('')).toBeNull()
    expect(normalizeGoogleSiteVerificationToken('<script>alert(1)</script>')).toBeNull()
  })
})
