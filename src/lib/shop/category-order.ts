// 상점 노출 순서: 고티어/고인챈트를 먼저 보여주고, 같은 장비 등급 안에서는
// 인게임 장비 창 순서(무기 → 방어구 → 소모품)에 맞춰 정렬한다.

export const SHOP_CATEGORY_ORDER: readonly string[] = [
  'weapon',
  'offhand',
  'head',
  'armor',
  'shoes',
  'cape',
  'bag',
  'mount',
  'potion',
  'food',
]

const ORDER_INDEX: ReadonlyMap<string, number> = new Map(
  SHOP_CATEGORY_ORDER.map((c, i) => [c, i]),
)

// 번들에 없는 카테고리는 맨 뒤. null 은 그 뒤 — "기타" 취급.
export function categoryRank(category: string | null | undefined): number {
  if (!category) return SHOP_CATEGORY_ORDER.length + 1
  return ORDER_INDEX.get(category) ?? SHOP_CATEGORY_ORDER.length
}

interface ShopCatalogSortable {
  category: string | null | undefined
  tier: number | null | undefined
  enchant: number
  nameKo?: string
  name_ko?: string
  id: string
}

function tierRank(tier: number | null | undefined): number {
  return typeof tier === 'number' && Number.isFinite(tier) ? tier : -1
}

function compareName(a: ShopCatalogSortable, b: ShopCatalogSortable): number {
  const aName = a.nameKo ?? a.name_ko ?? ''
  const bName = b.nameKo ?? b.name_ko ?? ''
  return aName.localeCompare(bName, 'ko')
}

export function compareShopCatalogOrder(
  a: ShopCatalogSortable,
  b: ShopCatalogSortable,
): number {
  const tierDiff = tierRank(b.tier) - tierRank(a.tier)
  if (tierDiff !== 0) return tierDiff

  const enchantDiff = b.enchant - a.enchant
  if (enchantDiff !== 0) return enchantDiff

  const categoryDiff = categoryRank(a.category) - categoryRank(b.category)
  if (categoryDiff !== 0) return categoryDiff

  const nameDiff = compareName(a, b)
  if (nameDiff !== 0) return nameDiff

  return a.id.localeCompare(b.id)
}
