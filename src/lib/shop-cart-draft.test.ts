import { describe, expect, it } from 'vitest'
import {
  parseShopCartDraft,
  restoreShopCartDraft,
  type ShopCartDraft,
} from './shop-cart-draft'

const snapshot = {
  id: 'inventory-off-page',
  uniqueName: 'T8_MAIN_SWORD',
  enchant: 1,
  quality: 1,
  stock: 3,
  nameKo: '검',
  category: 'weapon',
  tier: 8,
  pointPrice: 120,
  priceWarning: null,
  displayName: 'T8.1 Sword',
  localizedName: 'Sword',
  originalName: 'Sword',
} as const

describe('shop cart draft restore', () => {
  it('preserves a snapshotted line that is outside the current server page', () => {
    const draft: ShopCartDraft = {
      version: 1,
      lines: [{
        inventoryId: snapshot.id,
        quantity: 2,
        quotedUnitPoints: 120,
        itemSnapshot: snapshot,
      }],
    }

    const restored = restoreShopCartDraft(draft, [], { preserveMissingWithSnapshot: true })

    expect(restored.lines).toEqual(draft.lines)
    expect(restored.changes.removedIds).toEqual([])
  })

  it('still removes an unavailable line when the full catalog was loaded', () => {
    const draft: ShopCartDraft = {
      version: 1,
      lines: [{
        inventoryId: snapshot.id,
        quantity: 2,
        quotedUnitPoints: 120,
        itemSnapshot: snapshot,
      }],
    }

    expect(restoreShopCartDraft(draft, []).changes.removedIds).toEqual([snapshot.id])
  })

  it('keeps the item snapshot through session-storage serialization', () => {
    const draft: ShopCartDraft = {
      version: 1,
      lines: [{
        inventoryId: snapshot.id,
        quantity: 1,
        quotedUnitPoints: snapshot.pointPrice,
        itemSnapshot: snapshot,
      }],
    }

    expect(parseShopCartDraft(JSON.stringify(draft))).toEqual(draft)
  })
})
