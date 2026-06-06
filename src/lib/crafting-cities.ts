// Albion item ID → 제작 보너스를 주는 로열 시.
//
// 출처: Albion Wiki "Local Production Bonus" + 검증된 가이드.
// 5개 로열 시(Bridgewatch / Lymhurst / Martlock / Fort Sterling / Thetford) +
// Caerleon 의 카테고리 보너스 매핑. Brecilien(포션) 은 이번 범위에서 제외.
//
// 중요: 방어구는 부위(HEAD/ARMOR/SHOES) × 재료(PLATE/LEATHER/CLOTH) 조합별로
// 도시가 다르다. 풀 플레이트 셋도 헬멧→FS, 체스트→BW, 슈즈→ML 로 흩어짐.

import { extractWeaponCategory } from './weapon-category'
import type { BuildSnapshot } from '@/types'
import {
  CRAFT_REGEAR_SLOTS_WITH_CAPE,
  type CraftRegearSlot,
} from './regear-craft-slots'

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

// Tailwind 클래스는 컴파일 타임에 정적 분석되어야 purge 되지 않으므로 도시별
// 스타일을 정적 매핑으로 한곳에서 관리. CraftQueueClient / 집계 카드가 공유.
export const CITY_BADGE_STYLE: Record<CraftCity, string> = {
  bridgewatch: 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  lymhurst: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
  martlock: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40',
  fortsterling: 'bg-slate-400/15 text-slate-200 border-slate-400/40',
  thetford: 'bg-violet-500/15 text-violet-200 border-violet-500/40',
  caerleon: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
}

// Weapon family → 도시. extractWeaponCategory() 결과로 직접 lookup.
// 매핑되지 않은 카테고리는 STAFF_SUFFIX fallback 후 null 반환.
//
// 카테고리 이름은 extractWeaponCategory 가 artifact suffix(_AVALON/_HELL/_KEEPER/
// _MORGANA/_UNDEAD/_CRYSTAL/_DEMON) 를 떼어낸 결과 기준이다. 예를 들어
// T8_2H_DUALCROSSBOW_HELL 은 "DUALCROSSBOW" 로 lookup. 신규 아티팩트가 추가될 때
// 빠지면 카드의 도시 배지가 안 뜨므로 항목별 family 트리를 보고 채워야 한다.
//
// SHAPESHIFTER 패밀리(Bloodmoon/Prowling/Rootbound/Primal Staff) 는 Caerleon 보너스
// (사용자 확인). 4 종 모두 Caerleon 매핑.
const WEAPON_CITY: Record<string, CraftCity> = {
  // ── Bridgewatch (크로스보우 / 단검 / 커스드 스태프)
  CROSSBOW: 'bridgewatch',
  HEAVYCROSSBOW: 'bridgewatch',
  LIGHTCROSSBOW: 'bridgewatch',
  CROSSBOWLARGE: 'bridgewatch',
  '1HCROSSBOW': 'bridgewatch',
  DUALCROSSBOW: 'bridgewatch',
  REPEATINGCROSSBOW: 'bridgewatch',
  CROSSBOW_CANNON: 'bridgewatch',
  BOLTCASTERS: 'bridgewatch',
  WEEPINGREPEATER: 'bridgewatch',
  ENERGYSHAPER: 'bridgewatch',
  DAGGER: 'bridgewatch',
  DAGGERPAIR: 'bridgewatch',
  DAGGER_KATAR: 'bridgewatch',
  DUALSICKLE: 'bridgewatch',
  TWINSCYTHE: 'bridgewatch',
  CLAWS: 'bridgewatch',
  CLAWPAIR: 'bridgewatch',
  RAPIER: 'bridgewatch',
  BLOODLETTER: 'bridgewatch',
  DEATHGIVERS: 'bridgewatch',
  BLACKHANDS: 'bridgewatch',
  IRONGAUNTLETS: 'bridgewatch',
  CURSEDSTAFF: 'bridgewatch',
  GREATCURSEDSTAFF: 'bridgewatch',
  DEMONICSTAFF: 'bridgewatch',
  LIFECURSESTAFF: 'bridgewatch',
  SHADOWCALLER: 'bridgewatch',
  CURSEDSKULL: 'bridgewatch',
  SKULLORB: 'bridgewatch',
  DAMNATIONSTAFF: 'bridgewatch',

  // ── Lymhurst (소드 / 보우 / 아케인 스태프)
  SWORD: 'lymhurst',
  CLAYMORE: 'lymhurst',
  DUALSWORD: 'lymhurst',
  DUALSCIMITAR: 'lymhurst',
  SCIMITAR: 'lymhurst',
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
  ENIGMATICORB: 'lymhurst',
  ARCANE_RINGPAIR: 'lymhurst',
  OCCULTSTAFF: 'lymhurst',
  MALEVOLENTLOCUS: 'lymhurst',
  LOCUSPOCUS: 'lymhurst',

  // ── Martlock (액스 / 쿼터스태프 / 프로스트 스태프) — 오프핸드는 OFF_RE 처리
  AXE: 'martlock',
  BATTLEAXE: 'martlock',
  GREATAXE: 'martlock',
  DUALAXE: 'martlock',
  SCYTHE: 'martlock',
  HALBERD: 'martlock',
  HALBERDAXE: 'martlock',
  INFERNALSCYTHE: 'martlock',
  REALMBREAKER: 'martlock',
  CARRIONCALLER: 'martlock',
  BEARPAWS: 'martlock',
  QUARTERSTAFF: 'martlock',
  COMBATSTAFF: 'martlock',
  IRONCLADEDSTAFF: 'martlock',
  DOUBLEBLADEDSTAFF: 'martlock',
  BLACKMONKSTAVE: 'martlock',
  ROCKSTAFF: 'martlock',
  STAFFOFBALANCE: 'martlock',
  GRAVEGUARD: 'martlock',
  FROSTSTAFF: 'martlock',
  GREATFROSTSTAFF: 'martlock',
  GLACIALSTAFF: 'martlock',
  HOARFROSTSTAFF: 'martlock',
  ICICLESTAFF: 'martlock',
  ICEGAUNTLETS: 'martlock',
  ICECRYSTAL: 'martlock',
  PERMAFROSTPRISM: 'martlock',
  CHILLHOWL: 'martlock',

  // ── Fort Sterling (해머 / 스피어 / 홀리 스태프)
  HAMMER: 'fortsterling',
  POLEHAMMER: 'fortsterling',
  GREATHAMMER: 'fortsterling',
  DUALHAMMER: 'fortsterling',
  RAM: 'fortsterling',
  TOMBHAMMER: 'fortsterling',
  FORGEHAMMERS: 'fortsterling',
  GROVEKEEPER: 'fortsterling',
  HANDOFJUSTICE: 'fortsterling',
  SPEAR: 'fortsterling',
  SPEAR_LANCE: 'fortsterling',
  PIKE: 'fortsterling',
  GLAIVE: 'fortsterling',
  HARPOON: 'fortsterling',
  TRIDENT: 'fortsterling',
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
  FLAIL: 'thetford',
  DUALMACE: 'thetford',
  ROCKMACE: 'thetford',
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
  FIRE_RINGPAIR: 'thetford',

  // ── Caerleon (워글러브 + 셰이프시프터 스태프)
  GLOVES: 'caerleon',
  KNUCKLES: 'caerleon',
  KNUCKLES_SET1: 'caerleon',
  KNUCKLES_SET2: 'caerleon',
  KNUCKLES_SET3: 'caerleon',
  BRAWLERGLOVES: 'caerleon',
  BATTLEGLOVES: 'caerleon',
  HELLFIREHAND: 'caerleon',
  RAVENSTRIKE: 'caerleon',
  SPIKEDGAUNTLETS: 'caerleon',
  FISTSOFAVALON: 'caerleon',
  CRYPTCANDLE: 'caerleon',
  ROCKMAGNETS: 'caerleon',
  SHAPESHIFTER: 'caerleon',
  SHAPESHIFTER_SET1: 'caerleon',
  SHAPESHIFTER_SET2: 'caerleon',
  SHAPESHIFTER_SET3: 'caerleon',
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

// `\b` 는 underscore 가 word char 라 `_PLATE_SET1` 같은 패턴에서 매칭 실패한다
// (`E` 와 `_` 둘 다 word char → 경계 없음). 끝 또는 `_` 로 명시적 구분.
const ARMOR_RE = /^T\d+_(HEAD|ARMOR|SHOES)_(PLATE|LEATHER|CLOTH)(?:_|$)/
const OFF_RE = /^T\d+_OFF_/
const CAPE_RE = /^T\d+_(?:CAPE|CAPEITEM)(?:_|$)/
const BAG_RE = /^T\d+_BAG(?:_|$)/

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
export function getTaskCities(
  snapshot: BuildSnapshot | null,
  includedSlots: readonly CraftRegearSlot[] = CRAFT_REGEAR_SLOTS_WITH_CAPE,
): Set<CraftCity> {
  const out = new Set<CraftCity>()
  if (!snapshot) return out
  for (const slot of includedSlots) {
    const item = snapshot[slot]
    const city = getCraftBonusCity(item?.id)
    if (city) out.add(city)
  }
  return out
}
