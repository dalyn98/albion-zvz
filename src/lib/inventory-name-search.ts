// 길드 재고 추적 등록용 베이스 아이템 검색 인덱스.
//
// 마이그 124 의 guild_tracked_inventory_items 는 base_suffix 단위로 추적한다.
// 사용자는 "갤러틴 페어", "전사의 투구" 같은 한국어 베이스명만 입력하고,
// 시스템이 매칭되는 base_suffix 를 찾아준다 (예: "2H_GALATINEPAIR",
// "HEAD_PLATE_SET1"). 매치 후 T4~T8 다섯 장 카드가 그리드에 자동 노출.
//
// 인덱스는 모듈 로드 시 한 번 빌드되고 캐시된다. albion-items.json 에서
// 갑옷/무기/보조무기 그룹만 추출하고 망토/가방/채집도구/블랙핸즈 등은 제외
// (현재 그리드에서 이미 숨긴 것들과 동일 정책).
//
// 베이스명 도출:
//   - 한국어:  "장로의 갤러틴 페어" → "갤러틴 페어"
//   - 영어:    "elder's galatine pair" → "galatine pair"
//   - 일본어:  "ガラティーンペア（老熟）" → "ガラティーンペア"
// T8 엔트리를 canonical 로 잡고 거기서 prefix/suffix 만 떼낸다.
//
// 검색 키는 공백·기호 제거 후 lower-case 로 정규화한다 ("갤러틴페어" /
// "갤러틴 페어" 둘 다 매칭).

import items from '@/data/albion-items.json'
import {
  categorizeGearItem,
  type GearArmorMaterial,
  type GearSlot,
} from './inventory'

interface BundledItem {
  u: string
  c: string
  e: string
  k: string
  j: string
}

export interface TrackedItemSearchEntry {
  baseSuffix: string
  // T8 또는 그 다음 가장 상위 티어의 itemId. 카드 아이콘·자동완성 미리보기에 사용.
  sampleItemId: string
  slot: GearSlot
  armorMaterial: GearArmorMaterial | null
  // 표시명 (검색 결과 라벨용). 베이스명만 (티어 prefix/suffix 떼낸 형태).
  displayKo: string
  displayEn: string
  displayJa: string
}

interface IndexedEntry extends TrackedItemSearchEntry {
  searchKeyKo: string
  searchKeyEn: string
  searchKeyJa: string
}

// 한국어 티어 prefix.
const KO_TIER_PREFIXES: readonly string[] = [
  '숙련자의 ',
  '전문가의 ',
  '마스터의 ',
  '그랜드 마스터의 ',
  '장로의 ',
]

// 영어 티어 prefix.
const EN_TIER_PREFIXES: readonly string[] = [
  "adept's ",
  "expert's ",
  "master's ",
  "grandmaster's ",
  "elder's ",
]

// 일본어 티어 suffix (괄호 안에 들어감). 정규식으로 한 번에 제거.
const JA_TIER_SUFFIX_RE = /（(?:名人|達人|マスター|グランドマスター|老熟)）$/

function stripKoTier(name: string): string {
  for (const p of KO_TIER_PREFIXES) {
    if (name.startsWith(p)) return name.slice(p.length)
  }
  return name
}

function stripEnTier(name: string): string {
  const lower = name.toLowerCase()
  for (const p of EN_TIER_PREFIXES) {
    if (lower.startsWith(p)) return name.slice(p.length)
  }
  return name
}

function stripJaTier(name: string): string {
  return name.replace(JA_TIER_SUFFIX_RE, '')
}

// 검색 키 정규화 — 공백/구두점/특수문자 제거 + lower-case. "갤러틴 페어" 와
// "갤러틴페어" 가 같은 키로 매칭되게 한다.
function normalizeSearchKey(s: string): string {
  return s.toLowerCase().replace(/[\s'·.,()（）-]/g, '')
}

// 그리드에서 숨기는 패턴과 동일. inventory-catalog.ts 의 정책과 일치 시킴.
const EXCLUDED_PATTERNS: readonly RegExp[] = [
  /^T\d+_2H_IRONGAUNTLETS_HELL$/, // 블랙 핸즈
]

function shouldIndex(item: BundledItem): boolean {
  const cat = categorizeGearItem(item.u)
  if (cat.slot === 'other') return false
  if (cat.slot === 'cape' || cat.slot === 'bag') return false
  if (EXCLUDED_PATTERNS.some((re) => re.test(item.u))) return false
  return true
}

let INDEX: IndexedEntry[] | null = null

function buildIndex(): IndexedEntry[] {
  const ITEMS = items as BundledItem[]
  // suffix → 후보 (티어 가장 높은 거 채택)
  const candidates = new Map<string, BundledItem>()
  for (const item of ITEMS) {
    if (item.u.includes('@')) continue
    if (!shouldIndex(item)) continue
    const tierMatch = item.u.match(/^T(\d+)_/)
    if (!tierMatch) continue
    const tier = Number(tierMatch[1])
    if (tier < 4 || tier > 8) continue

    const suffix = item.u.replace(/^T\d+_/, '')
    const existing = candidates.get(suffix)
    if (!existing) {
      candidates.set(suffix, item)
    } else {
      const existingTier = Number(existing.u.match(/^T(\d+)_/)?.[1] ?? 0)
      if (tier > existingTier) candidates.set(suffix, item)
    }
  }

  const out: IndexedEntry[] = []
  for (const [suffix, item] of candidates) {
    const cat = categorizeGearItem(item.u)
    if (cat.tier == null) continue
    const displayKo = stripKoTier(item.k ?? '')
    const displayEn = stripEnTier(item.e ?? '')
    const displayJa = stripJaTier(item.j ?? '')
    out.push({
      baseSuffix: suffix,
      sampleItemId: item.u,
      slot: cat.slot,
      armorMaterial: cat.armorMaterial,
      displayKo,
      displayEn,
      displayJa,
      searchKeyKo: normalizeSearchKey(displayKo),
      searchKeyEn: normalizeSearchKey(displayEn),
      searchKeyJa: normalizeSearchKey(displayJa),
    })
  }
  return out
}

function getIndex(): readonly IndexedEntry[] {
  if (!INDEX) INDEX = buildIndex()
  return INDEX
}

// suffix → entry (정확 매칭 한 건). 추적된 base_suffix 를 그리드에 매핑할 때 사용.
export function getEntryBySuffix(
  suffix: string,
): TrackedItemSearchEntry | null {
  for (const e of getIndex()) {
    if (e.baseSuffix === suffix) {
      const { searchKeyKo: _ko, searchKeyEn: _en, searchKeyJa: _ja, ...rest } = e
      void _ko
      void _en
      void _ja
      return rest
    }
  }
  return null
}

// 사용자 입력 검색. 부분 일치 (substring) 로 한·일·영 모두 검사.
// 결과는 Korean 표시명 알파벳순으로 안정 정렬.
export function searchTrackedItems(
  query: string,
  limit = 30,
): TrackedItemSearchEntry[] {
  const normalized = normalizeSearchKey(query)
  if (normalized.length < 1) return []
  const matches: TrackedItemSearchEntry[] = []
  for (const e of getIndex()) {
    if (
      e.searchKeyKo.includes(normalized) ||
      e.searchKeyEn.includes(normalized) ||
      e.searchKeyJa.includes(normalized)
    ) {
      const { searchKeyKo: _ko, searchKeyEn: _en, searchKeyJa: _ja, ...rest } = e
      void _ko
      void _en
      void _ja
      matches.push(rest)
      if (matches.length >= limit * 2) break
    }
  }
  matches.sort((a, b) => a.displayKo.localeCompare(b.displayKo, 'ko'))
  return matches.slice(0, limit)
}

// 디버그/테스트용: 인덱스 전체 크기.
export function getTrackedItemIndexSize(): number {
  return getIndex().length
}
