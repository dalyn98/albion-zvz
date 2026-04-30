// Albion 무기 카테고리 → 패밀리 그룹.
//
// extractWeaponCategory() 가 돌려주는 카테고리 코드 (예: HEAVYMACE, GREATFIRESTAFF)
// 를 더 큰 단위인 패밀리 (mace, fire, ...) 로 묶기 위한 룩업. 길드 재고
// 그리드 정렬에서 "같은 무기군은 한 묶음" 을 보장하는 데 사용.
//
// 코드는 destiny-board 4단 트리의 leaf branch 와 그 sub-tree 형제들을
// 한 family 로 묶는다. 룩업에 없는 신규 코드는 'misc' 로 떨어져 정렬 끝쪽.

const FAMILY_BY_CATEGORY: Record<string, string> = {
  // 검 (전사)
  SWORD: 'sword',
  CARVINGSWORD: 'sword',
  CLEAVER: 'sword',
  KINGMAKER: 'sword',
  CLAYMORE: 'sword',
  DUALSWORD: 'sword',
  DUALSCIMITAR: 'sword',
  SCIMITAR: 'sword',
  CLAREWEN: 'sword',
  GALATINEPAIR: 'sword',

  // 도끼
  AXE: 'axe',
  BATTLEAXE: 'axe',
  HALBERDAXE: 'axe',
  REALMBREAKER: 'axe',
  GREATAXE: 'axe',
  DUALAXE: 'axe',
  SCYTHE: 'axe',
  HALBERD: 'axe',
  INFERNALSCYTHE: 'axe',
  CARRIONCALLER: 'axe',
  BEARPAWS: 'axe',

  // 메이스
  MACE: 'mace',
  HEAVYMACE: 'mace',
  MORNINGSTAR: 'mace',
  INCUBUSMACE: 'mace',
  CAMLANNMACE: 'mace',
  FLAIL: 'mace',
  DUALMACE: 'mace',
  ROCKMACE: 'mace',
  BEDROCKMACE: 'mace',

  // 해머
  HAMMER: 'hammer',
  GREATHAMMER: 'hammer',
  POLEHAMMER: 'hammer',
  GROVEKEEPER: 'hammer',
  HANDOFJUSTICE: 'hammer',
  DUALHAMMER: 'hammer',
  RAM: 'hammer',
  TOMBHAMMER: 'hammer',
  FORGEHAMMERS: 'hammer',

  // 창
  SPEAR: 'spear',
  GLAIVE: 'spear',
  HARPOON: 'spear',
  HERONSPEAR: 'spear',
  TRINITYSPEAR: 'spear',
  PIKE: 'spear',
  SPEAR_LANCE: 'spear',
  TRIDENT: 'spear',
  SPIRITHUNTER: 'spear',

  // 쿼터스태프
  QUARTERSTAFF: 'quarterstaff',
  IRONCLADEDSTAFF: 'quarterstaff',
  BLACKMONKSTAVE: 'quarterstaff',
  ROCKSTAFF: 'quarterstaff',
  GRAVEGUARD: 'quarterstaff',
  COMBATSTAFF: 'quarterstaff',
  DOUBLEBLADEDSTAFF: 'quarterstaff',
  STAFFOFBALANCE: 'quarterstaff',

  // 단검 (헌터)
  DAGGER: 'dagger',
  RAPIER: 'dagger',
  BLOODLETTER: 'dagger',
  DEATHGIVERS: 'dagger',
  DAGGER_KATAR: 'dagger',
  DAGGERPAIR: 'dagger',
  CLAWS: 'dagger',
  CLAWPAIR: 'dagger',
  BLACKHANDS: 'dagger',
  IRONGAUNTLETS: 'dagger',
  DUALSICKLE: 'dagger',
  TWINSCYTHE: 'dagger',

  // 활
  BOW: 'bow',
  WHISPERINGBOW: 'bow',
  MISTPIERCER: 'bow',
  LONGBOW: 'bow',
  WARBOW: 'bow',
  WAILINGBOW: 'bow',
  BADONHILL: 'bow',

  // 석궁
  CROSSBOW: 'crossbow',
  HEAVYCROSSBOW: 'crossbow',
  LIGHTCROSSBOW: 'crossbow',
  '1HCROSSBOW': 'crossbow',
  BOLTCASTERS: 'crossbow',
  ENERGYSHAPER: 'crossbow',
  CROSSBOWLARGE: 'crossbow',
  DUALCROSSBOW: 'crossbow',
  REPEATINGCROSSBOW: 'crossbow',
  CROSSBOW_CANNON: 'crossbow',
  WEEPINGREPEATER: 'crossbow',

  // 파이어 스태프 (메이지)
  FIRESTAFF: 'fire',
  GREATFIRESTAFF: 'fire',
  INFERNOSTAFF: 'fire',
  WILDFIRESTAFF: 'fire',
  BLAZINGSTAFF: 'fire',
  BRIMSTONESTAFF: 'fire',
  FIRE_RINGPAIR: 'fire',

  // 프로스트 스태프
  FROSTSTAFF: 'frost',
  GREATFROSTSTAFF: 'frost',
  GLACIALSTAFF: 'frost',
  HOARFROSTSTAFF: 'frost',
  ICICLESTAFF: 'frost',
  ICEGAUNTLETS: 'frost',
  ICECRYSTAL: 'frost',
  PERMAFROSTPRISM: 'frost',
  CHILLHOWL: 'frost',

  // 아케인 스태프
  ARCANESTAFF: 'arcane',
  GREATARCANESTAFF: 'arcane',
  ENIGMATICSTAFF: 'arcane',
  ENIGMATICORB: 'arcane',
  ARCANE_RINGPAIR: 'arcane',
  OCCULTSTAFF: 'arcane',
  MALEVOLENTLOCUS: 'arcane',
  LOCUSPOCUS: 'arcane',

  // 커스드 스태프
  CURSEDSTAFF: 'cursed',
  GREATCURSEDSTAFF: 'cursed',
  DEMONICSTAFF: 'cursed',
  LIFECURSESTAFF: 'cursed',
  SHADOWCALLER: 'cursed',
  CURSEDSKULL: 'cursed',
  SKULLORB: 'cursed',
  DAMNATIONSTAFF: 'cursed',

  // 홀리 스태프 (와든)
  HOLYSTAFF: 'holy',
  GREATHOLYSTAFF: 'holy',
  DIVINESTAFF: 'holy',
  FALLENSTAFF: 'holy',
  REDEMPTIONSTAFF: 'holy',
  LIFETOUCHSTAFF: 'holy',

  // 네이처 스태프
  NATURESTAFF: 'nature',
  GREATNATURESTAFF: 'nature',
  WILDSTAFF: 'nature',
  RAMPANTSTAFF: 'nature',
  BLIGHTSTAFF: 'nature',
  IRONROOTSTAFF: 'nature',

  // 워글러브
  GLOVES: 'glove',
  BRAWLERGLOVES: 'glove',
  BATTLEGLOVES: 'glove',
  HELLFIREHAND: 'glove',
  KNUCKLES: 'glove',
  KNUCKLES_SET1: 'glove',
  KNUCKLES_SET2: 'glove',
  KNUCKLES_SET3: 'glove',
  RAVENSTRIKE: 'glove',
  SPIKEDGAUNTLETS: 'glove',
  FISTSOFAVALON: 'glove',
  CRYPTCANDLE: 'glove',
  ROCKMAGNETS: 'glove',

  // 셰이프시프터
  SHAPESHIFTER: 'shapeshifter',
  SHAPESHIFTER_SET1: 'shapeshifter',
  SHAPESHIFTER_SET2: 'shapeshifter',
  SHAPESHIFTER_SET3: 'shapeshifter',
}

// 디스티니 보드의 4 분할 (전사·헌터·메이지·와든) 순서를 따라 그리드에서
// 자연스럽게 흐르도록 한 family 의 정렬 인덱스. 룩업 미스는 끝(misc)으로.
const FAMILY_ORDER: readonly string[] = [
  'sword',
  'axe',
  'mace',
  'hammer',
  'spear',
  'quarterstaff',
  'dagger',
  'bow',
  'crossbow',
  'fire',
  'frost',
  'arcane',
  'cursed',
  'holy',
  'nature',
  'glove',
  'shapeshifter',
] as const

const FAMILY_RANK = new Map<string, number>(
  FAMILY_ORDER.map((f, i) => [f, i]),
)
const UNKNOWN_RANK = FAMILY_ORDER.length

export function getWeaponFamily(categoryCode: string | null): string | null {
  if (!categoryCode) return null
  return FAMILY_BY_CATEGORY[categoryCode] ?? null
}

// 정렬용 rank — 같은 family 는 같은 숫자, 미매핑은 모두 끝에 모인다.
export function getWeaponFamilyRank(categoryCode: string | null): number {
  const family = getWeaponFamily(categoryCode)
  if (!family) return UNKNOWN_RANK
  return FAMILY_RANK.get(family) ?? UNKNOWN_RANK
}
