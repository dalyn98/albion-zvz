import { describe, expect, it } from 'vitest'
import { compareShopCatalogOrder } from './category-order'

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
})
