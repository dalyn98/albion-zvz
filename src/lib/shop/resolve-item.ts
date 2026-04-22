// 상자 로그의 한글 아이템명을 Albion UniqueName 으로 변환한다.
//
// 해결 순서:
//   1. 관리자가 설정한 shop_name_overrides (item_name_raw → unique_name)
//   2. 번들 사전 src/data/albion-items.json 의 k (korean name) 일치
//   3. 매칭 실패 시 null — 관리자 UI 에서 수동 매핑하도록 유도
//
// 한글명에는 티어 접두사 ("마스터의", "전문가의", ...) 가 이미 포함되므로
// 인챈트/품질은 상자 로그의 별도 컬럼을 그대로 사용한다. 티어는 UniqueName
// 의 T{N}_ 프리픽스에서 파싱.

import items from '@/data/albion-items.json'

interface BundledItem {
  u: string
  c: string
  // `k` 는 소문자 정규화된 한글명 (도시명 등 라틴 문자 포함 시 lookup 일관성 때문).
  // `d` 는 표시용 원문 — 대소문자/띄어쓰기 그대로.
  k: string
  d: string
}

const ITEMS = items as BundledItem[]

// BY_KO 의 키는 lowercase — resolve 쪽에서도 lowercase 로 조회한다.
// 로그 원본이 "장로의 Lymhurst 망토" 처럼 대문자로 와도 "장로의 lymhurst 망토"
// 번들 엔트리와 매칭되어야 하기 때문.
const BY_KO = new Map<string, BundledItem[]>()
for (const it of ITEMS) {
  const arr = BY_KO.get(it.k)
  if (arr) arr.push(it)
  else BY_KO.set(it.k, [it])
}

const BY_UNIQUE = new Map<string, BundledItem>()
for (const it of ITEMS) BY_UNIQUE.set(it.u, it)

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
  const trimmed = rawName.trim()
  if (!trimmed) return null
  // overrides 는 로그 원문 키 그대로 맞추고, 번들 조회는 lowercase.
  const lookupKey = trimmed.toLowerCase()

  const overrideUnique = overrides?.get(trimmed)
  if (overrideUnique) {
    const item = BY_UNIQUE.get(overrideUnique)
    if (item) {
      return {
        uniqueName: item.u,
        category: item.c,
        nameKo: item.d,
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

  const candidates = BY_KO.get(lookupKey)
  if (!candidates || candidates.length === 0) return null
  // 동일 한글명이 여러 UniqueName 에 매핑되는 경우는 스킨 변형 등 드문 케이스.
  // 가장 높은 티어를 선호 (장로의 > 마스터의 ...). 필요하면 관리자가 override 로 재지정.
  const ranked = [...candidates].sort((a, b) => {
    const ta = tierFromUniqueName(a.u) ?? 0
    const tb = tierFromUniqueName(b.u) ?? 0
    return tb - ta
  })
  const chosen = ranked[0]
  return {
    uniqueName: chosen.u,
    category: chosen.c,
    nameKo: chosen.d,
    tier: tierFromUniqueName(chosen.u),
  }
}
