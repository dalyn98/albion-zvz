import { compareStrings } from '@/lib/sort-strings'

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

export const SHOP_CATALOG_SORT_MODES = ['flat', 'type', 'name'] as const
export type ShopCatalogSortMode = (typeof SHOP_CATALOG_SORT_MODES)[number]
export const DEFAULT_SHOP_CATALOG_SORT_MODE: ShopCatalogSortMode = 'flat'

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

export function normalizeShopCatalogSortMode(
  value: ShopCatalogSortMode | string | readonly string[] | null | undefined,
): ShopCatalogSortMode {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'type' || raw === 'name' ? raw : DEFAULT_SHOP_CATALOG_SORT_MODE
}

function tierRank(tier: number | null | undefined): number {
  return typeof tier === 'number' && Number.isFinite(tier) ? tier : -1
}

function compareTierDesc(a: ShopCatalogSortable, b: ShopCatalogSortable): number {
  return tierRank(b.tier) - tierRank(a.tier)
}

function compareEnchantDesc(a: ShopCatalogSortable, b: ShopCatalogSortable): number {
  return b.enchant - a.enchant
}

function compareCategory(a: ShopCatalogSortable, b: ShopCatalogSortable): number {
  return categoryRank(a.category) - categoryRank(b.category)
}

function compareName(a: ShopCatalogSortable, b: ShopCatalogSortable): number {
  const aName = a.nameKo ?? a.name_ko ?? ''
  const bName = b.nameKo ?? b.name_ko ?? ''
  return compareStrings(aName, bName)
}

function compareId(a: ShopCatalogSortable, b: ShopCatalogSortable): number {
  return compareStrings(a.id, b.id)
}

export function compareShopCatalogOrder(
  a: ShopCatalogSortable,
  b: ShopCatalogSortable,
  sortMode: ShopCatalogSortMode = DEFAULT_SHOP_CATALOG_SORT_MODE,
): number {
  const mode = normalizeShopCatalogSortMode(sortMode)

  if (mode === 'type') {
    return (
      compareCategory(a, b) ||
      compareTierDesc(a, b) ||
      compareEnchantDesc(a, b) ||
      compareName(a, b) ||
      compareId(a, b)
    )
  }

  if (mode === 'name') {
    return (
      compareName(a, b) ||
      compareTierDesc(a, b) ||
      compareEnchantDesc(a, b) ||
      compareCategory(a, b) ||
      compareId(a, b)
    )
  }

  return (
    compareTierDesc(a, b) ||
    compareEnchantDesc(a, b) ||
    compareCategory(a, b) ||
    compareName(a, b) ||
    compareId(a, b)
  )
}
