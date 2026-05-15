// 길드 재고 그리드용 정적 장비 카탈로그.
//
// albion-items.json (Albion 전체 아이템 메타) 에서 장비 슬롯이 잡히는 베이스
// 아이템 (T4~T8) 만 추출. 인챈트 변형 (@N) 은 카드 안에서 mini-bar 로 노출
// 하기 때문에 카탈로그는 베이스 단위로만 보관한다.
//
// 두 가지 제외 메커니즘을 사용한다:
//  1) 슬롯 단위 (`EXCLUDED_GRID_SLOTS`): 망토·가방. cape 는 도시 보너스라
//     짐 별도 관리, bag 은 단일 슬롯이라 의미 없음.
//  2) 개별 아이템 패턴 (`EXCLUDED_GRID_ITEM_PATTERNS`): 운영상 의미 없는
//     레거시 아티팩트. 카테고리 자체는 weapon 으로 살려둬서 과거 빌드/킬
//     기록 처리에는 영향 안 주고 그리드에서만 숨긴다.
//
// 결과는 모듈 로드 시 한 번 계산되어 캐시된다 (~1400 entries).

import items from '@/data/albion-items.json'
import {
  categorizeGearItem,
  type GearArmorMaterial,
  type GearSlot,
} from './inventory-types'

export interface GearCatalogEntry {
  baseItemId: string
  slot: GearSlot
  tier: number
  armorMaterial: GearArmorMaterial | null
}

export type EnchantLevel = 0 | 1 | 2 | 3 | 4

export const ENCHANT_LEVELS: readonly EnchantLevel[] = [0, 1, 2, 3, 4] as const

export const TIER_LEVELS = [4, 5, 6, 7, 8] as const
export type TierLevel = (typeof TIER_LEVELS)[number]

const EXCLUDED_GRID_SLOTS: ReadonlySet<GearSlot> = new Set(['cape', 'bag'])

// 그리드에서만 숨기는 개별 아이템 패턴 (도메인 분류는 그대로 유지).
// 블랙 핸즈 (T*_2H_IRONGAUNTLETS_HELL): 운영상 안 쓰는 레거시 아티팩트.
const EXCLUDED_GRID_ITEM_PATTERNS: readonly RegExp[] = [
  /^T\d+_2H_IRONGAUNTLETS_HELL$/,
]

interface BundledItem {
  u: string
}

let CATALOG_CACHE: GearCatalogEntry[] | null = null

export function getGearCatalog(): readonly GearCatalogEntry[] {
  if (CATALOG_CACHE) return CATALOG_CACHE
  const ITEMS = items as BundledItem[]
  const out: GearCatalogEntry[] = []
  for (const item of ITEMS) {
    const uid = item.u
    if (uid.includes('@')) continue
    if (EXCLUDED_GRID_ITEM_PATTERNS.some((re) => re.test(uid))) continue
    const cat = categorizeGearItem(uid)
    if (cat.slot === 'other') continue
    if (EXCLUDED_GRID_SLOTS.has(cat.slot)) continue
    if (cat.tier == null) continue
    if (cat.tier < 4 || cat.tier > 8) continue
    out.push({
      baseItemId: uid,
      slot: cat.slot,
      tier: cat.tier,
      armorMaterial: cat.armorMaterial,
    })
  }
  CATALOG_CACHE = out
  return out
}
