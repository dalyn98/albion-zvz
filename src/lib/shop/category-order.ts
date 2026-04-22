// 상점 노출 순서: 인게임 장비 창 순서(무기 → 방어구 → 소모품)에 맞춰 정렬.
// 동일 카테고리 안에서는 호출측이 이미 name_ko 로 정렬해둔다는 가정 하에
// 안정 정렬을 이용해 2차 정렬을 피한다.

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
