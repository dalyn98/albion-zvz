import { describe, expect, it } from 'vitest'
import { extractPublicZvzSeasonNumber } from './public-zvz-season-label'

describe('extractPublicZvzSeasonNumber', () => {
  it.each([
    ['Season 33', 33],
    ['Albion Season #34', 34],
    ['시즌 35', 35],
  ])('extracts a configured season number from %s', (name, expected) => {
    expect(extractPublicZvzSeasonNumber(name)).toBe(expected)
  })

  it('keeps a custom configured label when no season number is present', () => {
    expect(extractPublicZvzSeasonNumber('Crystal Champions')).toBeNull()
  })
})
