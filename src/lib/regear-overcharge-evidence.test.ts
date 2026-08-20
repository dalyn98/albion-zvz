import { describe, expect, it } from 'vitest'
import {
  allowedRegearEvidenceMime,
  isAllowedRegearEvidenceMime,
} from './regear-helpers'

describe('OC regear evidence uploads', () => {
  it('requires a GIF in the primary evidence slot for overcharge claims', () => {
    expect([...allowedRegearEvidenceMime('overcharge', 'primary')]).toEqual(['image/gif'])
    expect(isAllowedRegearEvidenceMime('overcharge', 'primary', 'image/gif')).toBe(true)
    expect(isAllowedRegearEvidenceMime('overcharge', 'primary', 'image/png')).toBe(false)
  })

  it('keeps death evidence and the optional secondary slot on static images', () => {
    expect(isAllowedRegearEvidenceMime('death', 'primary', 'image/webp')).toBe(true)
    expect(isAllowedRegearEvidenceMime('death', 'primary', 'image/gif')).toBe(false)
    expect(isAllowedRegearEvidenceMime('overcharge', 'secondary', 'image/jpeg')).toBe(true)
    expect(isAllowedRegearEvidenceMime('overcharge', 'secondary', 'image/gif')).toBe(false)
  })
})
