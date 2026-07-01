import { describe, expect, it } from 'vitest'
import {
  compareShopCatalogOrder,
  normalizeShopCatalogSortMode,
} from './category-order'

describe('compareShopCatalogOrder', () => {
  it('sorts shop items by tier, enchant, category order, then name', () => {
    const rows = [
      { id: '4', tier: 8, enchant: 2, category: 'weapon', nameKo: '저티어 인챈트' },
      { id: '3', tier: 8, enchant: 3, category: 'armor', nameKo: '심판관 아머' },
      { id: '2', tier: 8, enchant: 3, category: 'weapon', nameKo: '할로우폴' },
      { id: '1', tier: 7, enchant: 3, category: 'weapon', nameKo: '페이스브레이커' },
      { id: '5', tier: null, enchant: 4, category: 'weapon', nameKo: '티어 없음' },
    ]

    rows.sort(compareShopCatalogOrder)

    expect(rows.map((row) => row.id)).toEqual(['2', '3', '4', '1', '5'])
  })

  it('sorts shop items by item type before flat when requested', () => {
    const rows = [
      { id: 'cape-8', tier: 8, enchant: 3, category: 'cape', nameKo: '고티어 망토' },
      { id: 'weapon-6', tier: 6, enchant: 0, category: 'weapon', nameKo: '저티어 무기' },
      { id: 'armor-7', tier: 7, enchant: 1, category: 'armor', nameKo: '중간 갑옷' },
      { id: 'weapon-8', tier: 8, enchant: 0, category: 'weapon', nameKo: '고티어 무기' },
    ]

    rows.sort((a, b) => compareShopCatalogOrder(a, b, 'type'))

    expect(rows.map((row) => row.id)).toEqual([
      'weapon-8',
      'weapon-6',
      'armor-7',
      'cape-8',
    ])
  })

  it('sorts shop items by name before flat when requested', () => {
    const rows = [
      { id: 'z', tier: 8, enchant: 3, category: 'weapon', nameKo: '할로우폴' },
      { id: 'a', tier: 4, enchant: 0, category: 'food', nameKo: '가지 파이' },
      { id: 'm', tier: 7, enchant: 2, category: 'armor', nameKo: '심판관 아머' },
    ]

    rows.sort((a, b) => compareShopCatalogOrder(a, b, 'name'))

    expect(rows.map((row) => row.id)).toEqual(['a', 'm', 'z'])
  })
})

describe('normalizeShopCatalogSortMode', () => {
  it('defaults unknown or empty sort values to flat', () => {
    expect(normalizeShopCatalogSortMode(null)).toBe('flat')
    expect(normalizeShopCatalogSortMode('')).toBe('flat')
    expect(normalizeShopCatalogSortMode('unknown')).toBe('flat')
    expect(normalizeShopCatalogSortMode(['name', 'type'])).toBe('name')
  })
})
