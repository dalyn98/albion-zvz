import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}))

import {
  searchTrackedItems,
  getEntryBySuffix,
  getTrackedItemIndexSize,
} from './inventory-name-search'

describe('inventory-name-search index shape', () => {
  it('builds a non-empty index spanning weapons and armor', () => {
    expect(getTrackedItemIndexSize()).toBeGreaterThan(50)
  })
})

describe('searchTrackedItems', () => {
  it('returns empty for empty queries', () => {
    expect(searchTrackedItems('')).toEqual([])
    expect(searchTrackedItems('   ')).toEqual([])
  })

  it('finds items by Korean partial name (tier prefix stripped)', () => {
    const results = searchTrackedItems('인페르날')
    expect(results.length).toBeGreaterThan(0)
    // Tier prefix should already be removed.
    expect(results.every((r) => !r.displayKo.startsWith('장로의'))).toBe(true)
    expect(results.every((r) => !r.displayKo.startsWith('숙련자의'))).toBe(true)
  })

  it('finds items by English partial name (case-insensitive)', () => {
    const results = searchTrackedItems('infernal')
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => /INFERNO/.test(r.sampleItemId))).toBe(true)
  })

  it('normalizes spaces in the query (e.g. "인페르날 스태프" === "인페르날스태프")', () => {
    const a = searchTrackedItems('인페르날 스태프')
    const b = searchTrackedItems('인페르날스태프')
    expect(a.map((r) => r.baseSuffix).sort()).toEqual(b.map((r) => r.baseSuffix).sort())
  })

  it('caps result count by the limit argument', () => {
    const results = searchTrackedItems('T8', 5)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it('excludes cape and bag entries from search results', () => {
    const results = searchTrackedItems('T8', 200)
    expect(results.every((r) => r.slot !== 'cape' && r.slot !== 'bag')).toBe(true)
  })

  it('results carry slot/material/displayName', () => {
    const results = searchTrackedItems('infernal')
    const first = results[0]
    expect(first).toBeDefined()
    expect(first.slot).toBeDefined()
    expect(first.baseSuffix).toBeTruthy()
    expect(first.sampleItemId.startsWith('T')).toBe(true)
  })
})

describe('getEntryBySuffix', () => {
  it('returns null for unknown suffix', () => {
    expect(getEntryBySuffix('DEFINITELY_NOT_AN_ITEM_XYZ')).toBeNull()
  })

  it('round-trips: searched result.baseSuffix → getEntryBySuffix returns same item', () => {
    const results = searchTrackedItems('infernal', 5)
    expect(results.length).toBeGreaterThan(0)
    const suffix = results[0].baseSuffix
    const entry = getEntryBySuffix(suffix)
    expect(entry).not.toBeNull()
    expect(entry?.baseSuffix).toBe(suffix)
    expect(entry?.sampleItemId).toBe(results[0].sampleItemId)
  })

  it('returned entry does not leak internal searchKey fields', () => {
    const results = searchTrackedItems('infernal', 1)
    const entry = getEntryBySuffix(results[0].baseSuffix)
    expect(entry).not.toBeNull()
    expect(entry as object).not.toHaveProperty('searchKeyKo')
    expect(entry as object).not.toHaveProperty('searchKeyEn')
  })
})
