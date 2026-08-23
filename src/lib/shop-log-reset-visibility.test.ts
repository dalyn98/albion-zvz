import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const shopPageSource = readFileSync(
  'src/app/(app-shell)/admin/dashboard/shop/page.tsx',
  'utf8',
)

describe('shop log reset visibility', () => {
  it('exposes the existing destructive reset on the log sync view only to inventory managers', () => {
    expect(shopPageSource).toContain('ShopResetPanelLazy as ShopResetPanel')
    expect(shopPageSource).toContain('{canResetShop && <ShopResetPanel />}')
    expect(shopPageSource).toMatch(
      /const canRecoverShop\s*=\s*session\.isAdmin \|\| sessionHas\(session, CAP\.INVENTORY_MANAGE\)/,
    )
  })
})
