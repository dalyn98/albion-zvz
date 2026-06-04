import { describe, expect, it } from 'vitest'
import { normalizePublicImageUrl, PUBLIC_IMAGE_URL_MAX_LENGTH } from './public-image-url'

describe('normalizePublicImageUrl', () => {
  it('keeps absolute https URLs and drops fragments', () => {
    expect(normalizePublicImageUrl(' https://example.com/banner.png?size=large#preview ')).toBe(
      'https://example.com/banner.png?size=large',
    )
  })

  it('rejects empty and oversized values', () => {
    expect(normalizePublicImageUrl('')).toBeNull()
    expect(normalizePublicImageUrl('   ')).toBeNull()
    expect(normalizePublicImageUrl(`https://example.com/${'a'.repeat(PUBLIC_IMAGE_URL_MAX_LENGTH)}`)).toBeNull()
  })

  it('rejects non-https and non-absolute URLs', () => {
    expect(normalizePublicImageUrl('http://example.com/banner.png')).toBeNull()
    expect(normalizePublicImageUrl('javascript:alert(1)')).toBeNull()
    expect(normalizePublicImageUrl('data:image/svg+xml,<svg></svg>')).toBeNull()
    expect(normalizePublicImageUrl('//example.com/banner.png')).toBeNull()
    expect(normalizePublicImageUrl('/banner.png')).toBeNull()
  })

  it('rejects credentialed URLs', () => {
    expect(normalizePublicImageUrl('https://user:password@example.com/banner.png')).toBeNull()
  })
})
