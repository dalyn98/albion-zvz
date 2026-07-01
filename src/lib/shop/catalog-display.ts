interface ShopTierEnchantLabelInput {
  tier: number | null | undefined
  enchant: number | null | undefined
}

function normalizeEnchant(enchant: number | null | undefined): number | null {
  return typeof enchant === 'number' && Number.isFinite(enchant) ? enchant : null
}

export function formatShopTierEnchantLabel(item: ShopTierEnchantLabelInput): string {
  const enchant = normalizeEnchant(item.enchant)
  if (item.tier != null) return `${item.tier}.${enchant ?? 0}`
  if (enchant == null) return '-'
  return enchant === 0 ? '0' : `+${enchant}`
}
