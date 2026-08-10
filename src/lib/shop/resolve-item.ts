// 상자 로그의 아이템명을 Albion UniqueName 으로 변환한다.
//
// 해결 순서:
//   1. 관리자가 설정한 shop_name_overrides (item_name_raw → unique_name)
//   2. 번들 사전 src/data/albion-items.json 의 locale 별 이름 일치
//   3. 매칭 실패 시 null — 관리자 UI 에서 수동 매핑하도록 유도
//
// 알비온 locale 별 아이템명에는 티어 접두사/접미사가 포함되므로 인챈트/품질은
// 상자 로그의 별도 컬럼을 그대로 사용한다. 티어는 UniqueName 의 T{N}_ 프리픽스에서 파싱.

import items from '@/data/albion-items.json'
import type { Locale } from '@/i18n/locales'

interface BundledItem {
  u: string
  c: string
  e?: string
  k?: string
  j?: string
  z?: string
  d?: string
  de?: string
  dj?: string
  dz?: string
  l?: Partial<Record<Locale, string>>
}

const EXTRA_RESOLVABLE_ITEMS: BundledItem[] = [
  {
    u: 'UNIQUE_MOUNT_BAT_PERSONAL',
    c: 'mount',
    e: 'spectral bat unique_mount_bat_personal',
    k: '유령의 박쥐 스펙트럴 배트',
    d: '유령의 박쥐',
    de: 'Spectral Bat',
  },
  {
    u: 'UNIQUE_MOUNT_BASTION_CRYSTAL',
    c: 'mount',
    e: 'crystal roving bastion unique_mount_bastion_crystal',
    k: '크리스탈 방랑하는 요새 크리스탈 로빙 바스티온 바스티온',
    d: '크리스탈 방랑하는 요새',
    de: 'Crystal Roving Bastion',
  },
  {
    u: 'UNIQUE_MOUNT_BASTION_GOLD',
    c: 'mount',
    e: 'gold roving bastion unique_mount_bastion_gold',
    k: '골드 방랑하는 요새 골드 로빙 바스티온 바스티온',
    d: '골드 방랑하는 요새',
    de: 'Gold Roving Bastion',
  },
  {
    u: 'UNIQUE_MOUNT_MORGANA_RAVEN_ADC',
    c: 'mount',
    e: 'morgana raven unique_mount_morgana_raven_adc',
    k: '모르가나의 까마귀 모르가나 레이븐',
    d: '모르가나의 까마귀',
    de: 'Morgana Raven',
  },
  {
    u: 'UNIQUE_MOUNT_BLACK_PANTHER_ADC',
    c: 'mount',
    e: 'black panther unique_mount_black_panther_adc',
    k: '블랙 팬서 흑표범',
    d: '블랙 팬서',
    de: 'Black Panther',
  },
  {
    u: 'UNIQUE_HIDEOUT',
    c: 'other',
    e: 'hideout construction kit unique_hideout',
    k: '은신처 건설키트 은신처 건설 키트 하이드아웃',
    d: '은신처 건설키트',
    de: 'Hideout Construction Kit',
  },
]

const ITEMS = [...(items as BundledItem[]), ...EXTRA_RESOLVABLE_ITEMS]

const LOCALIZED_NAME_FIELDS = ['e', 'k', 'j', 'z', 'd', 'de', 'dj', 'dz'] as const

const BY_LOCALIZED_NAME = new Map<string, BundledItem[]>()
for (const it of ITEMS) {
  for (const field of LOCALIZED_NAME_FIELDS) {
    const name = it[field]
    if (!name) continue
    addLocalizedItemName(name, it)
  }
  for (const name of Object.values(it.l ?? {})) {
    if (name) addLocalizedItemName(name, it)
  }
}

const BY_UNIQUE = new Map<string, BundledItem>()
for (const it of ITEMS) BY_UNIQUE.set(it.u, it)
const BY_UNIQUE_NORMALIZED = new Map<string, BundledItem>()
for (const it of ITEMS) BY_UNIQUE_NORMALIZED.set(normalizeItemLookupKey(it.u), it)

export interface ResolvedItem {
  uniqueName: string
  category: string
  nameKo: string
  tier: number | null
}

export function tierFromUniqueName(uniqueName: string): number | null {
  const m = uniqueName.match(/^T(\d)_/)
  return m ? Number(m[1]) : null
}

export function resolveKoItem(
  rawName: string,
  overrides?: Map<string, string>,
): ResolvedItem | null {
  return resolveAlbionItem(rawName, overrides)
}

export function resolveAlbionItem(
  rawName: string,
  overrides?: Map<string, string>,
): ResolvedItem | null {
  const trimmed = rawName.trim()
  if (!trimmed) return null
  const lookupKey = normalizeItemLookupKey(trimmed)

  const overrideUnique = overrides?.get(trimmed)
  if (overrideUnique) {
    const item = BY_UNIQUE.get(overrideUnique)
    if (item) {
      return {
        uniqueName: item.u,
        category: item.c,
        nameKo: item.d ?? item.k ?? item.de ?? item.e ?? item.u,
        tier: tierFromUniqueName(item.u),
      }
    }
    // override 가 가리키는 UniqueName 이 번들에 없어도 최소 정보는 반환.
    return {
      uniqueName: overrideUnique,
      category: 'unknown',
      nameKo: trimmed,
      tier: tierFromUniqueName(overrideUnique),
    }
  }

  const directUnique = BY_UNIQUE_NORMALIZED.get(lookupKey)
  if (directUnique) return toResolvedItem(directUnique, directUnique.u)
  const directBaseUnique = BY_UNIQUE_NORMALIZED.get(
    normalizeItemLookupKey(trimmed.split('@', 1)[0] ?? ''),
  )
  if (directBaseUnique) return toResolvedItem(directBaseUnique, directBaseUnique.u)

  const candidates = BY_LOCALIZED_NAME.get(lookupKey)
  if (!candidates || candidates.length === 0) return null
  // 동일 표시명이 여러 UniqueName 에 매핑되는 경우는 스킨 변형 등 드문 케이스.
  // 가장 높은 티어를 선호 (장로의 > 마스터의 ...). 필요하면 관리자가 override 로 재지정.
  const ranked = [...candidates].sort((a, b) => {
    const ta = tierFromUniqueName(a.u) ?? 0
    const tb = tierFromUniqueName(b.u) ?? 0
    return tb - ta
  })
  return toResolvedItem(ranked[0], ranked[0].u)
}

function addLocalizedItemName(name: string, item: BundledItem): void {
  const key = normalizeItemLookupKey(name)
  if (!key) return
  const arr = BY_LOCALIZED_NAME.get(key)
  if (arr) {
    if (!arr.some((existing) => existing.u === item.u)) arr.push(item)
    return
  }
  BY_LOCALIZED_NAME.set(key, [item])
}

function normalizeItemLookupKey(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

function toResolvedItem(chosen: BundledItem, uniqueName: string): ResolvedItem {
  return {
    uniqueName,
    category: chosen.c,
    nameKo: chosen.d ?? chosen.k ?? chosen.de ?? chosen.e ?? uniqueName,
    tier: tierFromUniqueName(uniqueName),
  }
}
