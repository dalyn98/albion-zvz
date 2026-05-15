// 클라이언트/서버 공용 인벤토리 타입·상수.
//
// `inventory.ts` 가 `log` (server-only) 를 import 하므로, 클라이언트 컴포넌트
// (예: AdminInventoryGearPanel) 가 `GEAR_SLOTS` 같은 값을 직접 import 하면
// server-only 체인이 클라 번들로 끌려와 빌드 실패. 그래서 순수 타입·상수·정규식
// 분류기는 별도 파일로 분리해 양쪽이 깨끗하게 공유.

import type { EnchantLevel } from './inventory-catalog'

// ────────────────────────────────────────────────────────────
// Gear slot categorization
// ────────────────────────────────────────────────────────────

export const GEAR_SLOTS = [
  'weapon',
  'head',
  'armor',
  'shoes',
  'offhand',
  'cape',
  'bag',
  'other',
] as const

export type GearSlot = (typeof GEAR_SLOTS)[number]

// 갑옷류 부위에서만 의미 있음. 무기·보조·망토·가방·기타는 null.
export type GearArmorMaterial = 'PLATE' | 'LEATHER' | 'CLOTH'

export interface GearCategorization {
  slot: GearSlot
  armorMaterial: GearArmorMaterial | null
  tier: number | null
}

const WEAPON_RE = /^T(\d+)_(?:2H|MAIN)_/
const OFFHAND_RE = /^T(\d+)_OFF_/
// `\b` 는 `_` 가 word char 라 SET1·KEEPER·AVALON 같은 접미사 앞에서 boundary
// 가 안 잡힌다. `(?:_|$)` 로 명시적으로 접미사 또는 끝 매칭.
const ARMOR_PIECE_RE = /^T(\d+)_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)(?:_|$)/
const CAPE_RE = /^T(\d+)_(?:CAPEITEM|CAPE)(?:_|$)/
const BAG_RE = /^T(\d+)_BAG(?:_|$)/
// 채집·생활 도구 (곡괭이/도끼/낫/스키닝/돌망치/낚싯대/추적기/시즈해머).
// `T{n}_2H_TOOL_*` 는 WEAPON_RE 에 먼저 잡혀버려서 위쪽에서 분기시켜야 한다.
const TOOL_RE = /^T(\d+)_2H_TOOL_/

export function categorizeGearItem(itemId: string): GearCategorization {
  const id = itemId.split('@')[0]
  const tool = id.match(TOOL_RE)
  if (tool) {
    return { slot: 'other', armorMaterial: null, tier: Number(tool[1]) }
  }
  const armor = id.match(ARMOR_PIECE_RE)
  if (armor) {
    const slotMap: Record<string, GearSlot> = {
      HEAD: 'head',
      ARMOR: 'armor',
      SHOES: 'shoes',
    }
    return {
      slot: slotMap[armor[2]] ?? 'other',
      armorMaterial: armor[3] as GearArmorMaterial,
      tier: Number(armor[1]),
    }
  }
  const weapon = id.match(WEAPON_RE)
  if (weapon) {
    return { slot: 'weapon', armorMaterial: null, tier: Number(weapon[1]) }
  }
  const off = id.match(OFFHAND_RE)
  if (off) {
    return { slot: 'offhand', armorMaterial: null, tier: Number(off[1]) }
  }
  const cape = id.match(CAPE_RE)
  if (cape) {
    return { slot: 'cape', armorMaterial: null, tier: Number(cape[1]) }
  }
  const bag = id.match(BAG_RE)
  if (bag) {
    return { slot: 'bag', armorMaterial: null, tier: Number(bag[1]) }
  }
  // Fallback: pull tier if present, slot 'other'
  const tierMatch = id.match(/^T(\d+)_/)
  return {
    slot: 'other',
    armorMaterial: null,
    tier: tierMatch ? Number(tierMatch[1]) : null,
  }
}

// 베이스 아이템 단위 카탈로그 행. 인챈트 @0~@4 별 수량을 한 묶음으로 보관해
// 그리드 카드 1장 = 베이스 1개 매핑. DB 에 row 가 없는 인챈트는 0 으로 채움.
export interface InventoryGearBaseRow {
  baseItemId: string
  slot: GearSlot
  tier: number
  armorMaterial: GearArmorMaterial | null
  quantities: Record<EnchantLevel, number>
}
