export const SHOP_CANONICAL_QUALITY = 1

export function canonicalShopQuality(): number {
  return SHOP_CANONICAL_QUALITY
}

export function shopSkuKey(row: { uniqueName: string; enchant: number }): string {
  return `${row.uniqueName}|${row.enchant}`
}
