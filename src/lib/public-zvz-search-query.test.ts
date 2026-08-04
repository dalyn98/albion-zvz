import { describe, expect, it } from 'vitest'
import {
  normalizePublicZvzEntitySearchQuery,
  PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH,
} from './public-zvz-search-query'

describe('normalizePublicZvzEntitySearchQuery', () => {
  it('trims and collapses whitespace without changing the visible name', () => {
    expect(normalizePublicZvzEntitySearchQuery('  V A   G A  ')).toBe('V A G A')
  })

  it('rejects empty, one-character, non-string, and oversized input', () => {
    expect(normalizePublicZvzEntitySearchQuery('')).toBeNull()
    expect(normalizePublicZvzEntitySearchQuery('A')).toBeNull()
    expect(normalizePublicZvzEntitySearchQuery(null)).toBeNull()
    expect(
      normalizePublicZvzEntitySearchQuery('A'.repeat(PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH + 1)),
    ).toBeNull()
  })
})
