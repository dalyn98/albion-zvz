import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { restoreShopCartDraft, type ShopCartDraft } from './shop-cart-draft'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('shop cart draft restoration', () => {
  it('keeps valid lines while explaining removed, clamped, and repriced items', () => {
    const draft: ShopCartDraft = {
      version: 1,
      lines: [
        { inventoryId: 'same', quantity: 2, quotedUnitPoints: 100 },
        { inventoryId: 'clamped', quantity: 8, quotedUnitPoints: 200 },
        { inventoryId: 'repriced', quantity: 1, quotedUnitPoints: 300 },
        { inventoryId: 'gone', quantity: 1, quotedUnitPoints: 400 },
      ],
    }

    const restored = restoreShopCartDraft(draft, [
      { id: 'same', stock: 3, pointPrice: 100 },
      { id: 'clamped', stock: 4, pointPrice: 200 },
      { id: 'repriced', stock: 2, pointPrice: 350 },
    ])

    expect(restored.lines.map((line) => [line.inventoryId, line.quantity])).toEqual([
      ['same', 2],
      ['clamped', 4],
      ['repriced', 1],
    ])
    expect(restored.changes).toEqual({
      removedIds: ['gone'],
      clampedIds: ['clamped'],
      repricedIds: ['repriced'],
    })
  })
})

describe('shop and craft operation surfaces', () => {
  it('persists the cart and commits only a reviewed snapshot', () => {
    const catalog = source('src/components/ShopCatalog.tsx')
    const action = source('src/app/actions/shop-member.ts')
    expect(catalog).toContain('sessionStorage')
    expect(catalog).toContain('orderReviewOpen')
    expect(catalog).toContain('reviewedOrderLines')
    expect(catalog).toMatch(/setOrderReviewOpen\(true\)[\s\S]*commitReviewedOrder[\s\S]*submitShopOrder/)
    expect(catalog).toMatch(/reviewShopOrder[\s\S]*setOrderReviewOpen\(true\)/)
    expect(action).toContain('expectedUnitPoints')
    expect(action).toMatch(/expectedUnitPoints[\s\S]*!== unit/)
  })

  it('blocks inventory import while unresolved names remain', () => {
    const importer = source('src/components/ShopImportForm.tsx')
    expect(importer).toContain('hasUnresolvedNames')
    expect(importer).toContain('resolveBeforeCommit')
  })

  it('keeps a visible bulk craft receipt after processing', () => {
    const tasks = source('src/components/AdminCraftTasksList.tsx')
    expect(tasks).toContain('bulkReceipt')
    expect(tasks).toContain('bulkReceiptTitle')
  })
})
