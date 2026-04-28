// Albion item ID → 제작 보너스를 주는 로열 시.
//
// 출처: Albion Wiki "Local Production Bonus" + 검증된 가이드.
// 5개 로열 시(Bridgewatch / Lymhurst / Martlock / Fort Sterling / Thetford) +
// Caerleon 의 카테고리 보너스 매핑. Brecilien(포션) 은 이번 범위에서 제외.
//
// 중요: 방어구는 부위(HEAD/ARMOR/SHOES) × 재료(PLATE/LEATHER/CLOTH) 조합별로
// 도시가 다르다. 풀 플레이트 셋도 헬멧→FS, 체스트→BW, 슈즈→ML 로 흩어짐.

import { extractWeaponCategory } from './weapon-category'
import type { BuildSnapshot, SlotKey } from '@/types'

export type CraftCity =
  | 'bridgewatch'
  | 'lymhurst'
  | 'martlock'
  | 'fortsterling'
  | 'thetford'
  | 'caerleon'

export const CRAFT_CITIES: readonly CraftCity[] = [
  'bridgewatch',
  'lymhurst',
  'martlock',
  'fortsterling',
  'thetford',
  'caerleon',
] as const

// Weapon family → 도시. extractWeaponCategory() 결과로 직접 lookup.
// 매핑되지 않은 카테고리는 STAFF_SUFFIX fallback 후 null 반환.
const WEAPON_CITY: Record<string, CraftCity> = {
  // ── Bridgewatch (크로스보우 / 단검 / 커스드 스태프)
  CROSSBOW: 'bridgewatch',
  HEAVYCROSSBOW: 'bridgewatch',
  LIGHTCROSSBOW: 'bridgewatch',
  CROSSBOWLARGE: 'bridgewatch',
  BOLTCASTERS: 'bridgewatch',
  WEEPINGREPEATER: 'bridgewatch',
  ENERGYSHAPER: 'bridgewatch',
  DAGGER: 'bridgewatch',
  DAGGERPAIR: 'bridgewatch',
  CLAWS: 'bridgewatch',
  RAPIER: 'bridgewatch',
  BLOODLETTER: 'bridgewatch',
  DEATHGIVERS: 'bridgewatch',
  BLACKHANDS: 'bridgewatch',
  CURSEDSTAFF: 'bridgewatch',
  GREATCURSEDSTAFF: 'bridgewatch',
  DEMONICSTAFF: 'bridgewatch',
  LIFECURSESTAFF: 'bridgewatch',
  SHADOWCALLER: 'bridgewatch',
  CURSEDSKULL: 'bridgewatch',
  DAMNATIONSTAFF: 'bridgewatch',

  // ── Lymhurst (소드 / 보우 / 아케인 스태프)
  SWORD: 'lymhurst',
  CLAYMORE: 'lymhurst',
  DUALSWORD: 'lymhurst',
  CLEAVER: 'lymhurst',
  CARVINGSWORD: 'lymhurst',
  KINGMAKER: 'lymhurst',
  CLAREWEN: 'lymhurst',
  GALATINEPAIR: 'lymhurst',
  BOW: 'lymhurst',
  LONGBOW: 'lymhurst',
  WARBOW: 'lymhurst',
  WHISPERINGBOW: 'lymhurst',
  WAILINGBOW: 'lymhurst',
  BADONHILL: 'lymhurst',
  MISTPIERCER: 'lymhurst',
  ARCANESTAFF: 'lymhurst',
  GREATARCANESTAFF: 'lymhurst',
  ENIGMATICSTAFF: 'lymhurst',
  OCCULTSTAFF: 'lymhurst',
  MALEVOLENTLOCUS: 'lymhurst',
  LOCUSPOCUS: 'lymhurst',

  // ── Martlock (액스 / 쿼터스태프 / 프로스트 스태프) — 오프핸드는 OFF_RE 처리
  AXE: 'martlock',
  BATTLEAXE: 'martlock',
  GREATAXE: 'martlock',
  HALBERD: 'martlock',
  HALBERDAXE: 'martlock',
  INFERNALSCYTHE: 'martlock',
  REALMBREAKER: 'martlock',
  CARRIONCALLER: 'martlock',
  BEARPAWS: 'martlock',
  QUARTERSTAFF: 'martlock',
  IRONCLADEDSTAFF: 'martlock',
  DOUBLEBLADEDSTAFF: 'martlock',
  BLACKMONKSTAVE: 'martlock',
  STAFFOFBALANCE: 'martlock',
  GRAVEGUARD: 'martlock',
  FROSTSTAFF: 'martlock',
  GREATFROSTSTAFF: 'martlock',
  GLACIALSTAFF: 'martlock',
  HOARFROSTSTAFF: 'martlock',
  ICICLESTAFF: 'martlock',
  PERMAFROSTPRISM: 'martlock',
  CHILLHOWL: 'martlock',

  // ── Fort Sterling (해머 / 스피어 / 홀리 스태프)
  HAMMER: 'fortsterling',
  POLEHAMMER: 'fortsterling',
  GREATHAMMER: 'fortsterling',
  TOMBHAMMER: 'fortsterling',
  FORGEHAMMERS: 'fortsterling',
  GROVEKEEPER: 'fortsterling',
  HANDOFJUSTICE: 'fortsterling',
  SPEAR: 'fortsterling',
  PIKE: 'fortsterling',
  GLAIVE: 'fortsterling',
  HERONSPEAR: 'fortsterling',
  TRINITYSPEAR: 'fortsterling',
  SPIRITHUNTER: 'fortsterling',
  HOLYSTAFF: 'fortsterling',
  GREATHOLYSTAFF: 'fortsterling',
  DIVINESTAFF: 'fortsterling',
  FALLENSTAFF: 'fortsterling',
  REDEMPTIONSTAFF: 'fortsterling',
  LIFETOUCHSTAFF: 'fortsterling',

  // ── Thetford (메이스 / 네이처 스태프 / 파이어 스태프)
  MACE: 'thetford',
  HEAVYMACE: 'thetford',
  MORNINGSTAR: 'thetford',
  BEDROCKMACE: 'thetford',
  CAMLANNMACE: 'thetford',
  INCUBUSMACE: 'thetford',
  NATURESTAFF: 'thetford',
  GREATNATURESTAFF: 'thetford',
  WILDSTAFF: 'thetford',
  RAMPANTSTAFF: 'thetford',
  BLIGHTSTAFF: 'thetford',
  IRONROOTSTAFF: 'thetford',
  FIRESTAFF: 'thetford',
  GREATFIRESTAFF: 'thetford',
  INFERNOSTAFF: 'thetford',
  WILDFIRESTAFF: 'thetford',
  BLAZINGSTAFF: 'thetford',
  BRIMSTONESTAFF: 'thetford',

  // ── Caerleon (워글러브)
  GLOVES: 'caerleon',
  BRAWLERGLOVES: 'caerleon',
  BATTLEGLOVES: 'caerleon',
  HELLFIREHAND: 'caerleon',
  RAVENSTRIKE: 'caerleon',
  SPIKEDGAUNTLETS: 'caerleon',
  FISTSOFAVALON: 'caerleon',
  CRYPTCANDLE: 'caerleon',
  ROCKMAGNETS: 'caerleon',
}

// 새 아티팩트 변형이 추가돼도 어미가 같으면 도시는 동일하므로, 직접 매핑 미스 시
// suffix 로 fallback. (예: 미래 신무기 "BURNING_DOOMSTAFF" 도 FIRESTAFF 어미가 아님
// → null 반환. 이건 의도된 보수적 동작.)
const STAFF_SUFFIX: ReadonlyArray<readonly [string, CraftCity]> = [
  ['FIRESTAFF', 'thetford'],
  ['HOLYSTAFF', 'fortsterling'],
  ['FROSTSTAFF', 'martlock'],
  ['ARCANESTAFF', 'lymhurst'],
  ['CURSEDSTAFF', 'bridgewatch'],
  ['NATURESTAFF', 'thetford'],
] as const

// 방어구: 부위 × 재료 → 도시.
const ARMOR_CITY: Record<string, CraftCity> = {
  HEAD_PLATE: 'fortsterling',
  HEAD_LEATHER: 'lymhurst',
  HEAD_CLOTH: 'thetford',
  ARMOR_PLATE: 'bridgewatch',
  ARMOR_LEATHER: 'thetford',
  ARMOR_CLOTH: 'fortsterling',
  SHOES_PLATE: 'martlock',
  SHOES_LEATHER: 'lymhurst',
  SHOES_CLOTH: 'bridgewatch',
}

const ARMOR_RE = /^T\d+_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)\b/
const OFF_RE = /^T\d+_OFF_/
const CAPE_RE = /^T\d+_(CAPE|CAPEITEM)\b/
const BAG_RE = /^T\d+_BAG\b/

// 입력: 인챈트(@N) 가 붙은 itemId 도 안전하게 처리.
// 매핑 안 되는 카테고리(마운트/포션/푸드/툴/T1-2 잡템 등) 은 null 반환 → 배지 미표시.
export function getCraftBonusCity(
  itemId: string | null | undefined,
): CraftCity | null {
  if (!itemId) return null
  const id = itemId.split('@')[0]

  // 1) 무기 (MAIN/2H 슬롯)
  const weapon = extractWeaponCategory(id)
  if (weapon) {
    const direct = WEAPON_CITY[weapon]
    if (direct) return direct
    for (const [suffix, city] of STAFF_SUFFIX) {
      if (weapon.endsWith(suffix)) return city
    }
    return null
  }

  // 2) 방어구 (HEAD/ARMOR/SHOES × PLATE/LEATHER/CLOTH)
  const armor = id.match(ARMOR_RE)
  if (armor) {
    const key = `${armor[1]}_${armor[2]}`
    return ARMOR_CITY[key] ?? null
  }

  // 3) 보조무기 (방패/토치/북 등) — 모두 Martlock
  if (OFF_RE.test(id)) return 'martlock'

  // 4) 망토 — Caerleon
  if (CAPE_RE.test(id)) return 'caerleon'

  // 5) 가방 — Caerleon
  if (BAG_RE.test(id)) return 'caerleon'

  return null
}

// 한 task 가 도시 보너스를 받는 슬롯들의 도시 집합.
// 같은 도시가 여러 슬롯에 걸치면 한 번만 카운트.
export function getTaskCities(snapshot: BuildSnapshot | null): Set<CraftCity> {
  const out = new Set<CraftCity>()
  if (!snapshot) return out
  const slots: readonly SlotKey[] = [
    'weapon',
    'head',
    'armor',
    'shoes',
    'offhand',
    'cape',
  ]
  for (const slot of slots) {
    const item = snapshot[slot]
    const city = getCraftBonusCity(item?.id)
    if (city) out.add(city)
  }
  return out
}
