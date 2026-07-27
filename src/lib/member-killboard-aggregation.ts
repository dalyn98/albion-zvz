// 멤버 상세 화면 (Discord 연동/미연동 양쪽) 공통의 killboard_events 행 집계 로직.
// - `fetchMemberDetail` (Discord 연동 멤버) — `members-admin-detail.ts`
// - `getAlbionMemberDetail` (미연동 Albion 멤버) — `members-admin-detail.ts`
// 두 함수 모두 같은 row → (fame, weapon_breakdown, kill_history) 변환을 하므로
// 순수 함수로 분리해 단위 테스트 가능하게 보관.

import { extractWeaponCategory } from '@/lib/weapon-category'
import {
  findTrackedBattleKey,
  isWithinTrackedWindow,
  type TrackedBattles,
} from '@/lib/tracked-kills'

// killboard_events 한 행. select() 컬럼 그대로의 shape.
export interface KillboardRow {
  event_id: number | string | null
  role: string | null
  fame: number | null
  item_power: number | null
  occurred_at: string | null
  equipment: Record<string, { Type?: string } | null> | null
  opponent_name: string | null
  opponent_guild: string | null
  opponent_alliance: string | null
  battle_id: number | null
}

// 멤버가 사용한 무기군 카운트. 무기군(extractWeaponCategory) 단위로 집계해
// 티어/인챈트/품질/아티팩트 변형이 같이 묶인다. count 는 "해당 무기군을 들고
// 참여한 배틀 수" (한 배틀에서 같은 무기로 여러 킬을 내도 1로 집계).
export interface WeaponCount {
  weapon_id: string | null
  weapon_name: string
  count: number
}

// 멤버 상세 화면 "최근 킬/데스" 타임라인용. tracked 창 안의 이벤트만 들어옴.
export interface MemberKillEvent {
  event_id: string
  role: 'killer' | 'victim'
  opponent_name: string | null
  opponent_guild: string | null
  opponent_alliance: string | null
  fame: number
  item_power: number | null
  occurred_at: string
}

// killboard_events 집계 결과 — fame 합계는 caller 의 KillboardStats 에 합쳐넣고,
// weaponBreakdown/killHistory 는 상세 화면이 그대로 사용한다.
export interface KillboardAggregation {
  killFame: number
  deathFame: number
  weaponBreakdown: WeaponCount[]
  killHistory: MemberKillEvent[]
}

// 한 멤버의 killboard_events 행들을 tracked window 안의 것만 추려 fame/무기/킬
// 타임라인으로 압축. tracked 외 (1:1 갱킹 등) 행은 모두 제외.
//
// - killFame/deathFame: tracked 행의 fame 합계. role 이 killer/victim 인 것만 집계.
// - weaponBreakdown: extractWeaponCategory 결과를 키로 모은 무기군별 참여 배틀 수.
//   `battleKey` 가 같은 (= 같은 tracked battle) 행끼리는 Set 으로 묶여 1회만 카운트.
//   sampleId 는 아이콘 렌더용 — 가장 최근 관측된 원본 Type 으로 갱신.
// - killHistory: 최신순 정렬, 상위 50개로 제한 (UI 가 스크롤 없이 훑을 수 있는 양).
export function aggregateKillboardRows(
  rows: ReadonlyArray<KillboardRow>,
  trackedBattles: TrackedBattles,
): KillboardAggregation {
  let killFame = 0
  let deathFame = 0
  const weaponAgg = new Map<string, { sampleId: string; battles: Set<string> }>()
  const killHistory: MemberKillEvent[] = []

  for (const row of rows) {
    if (!row.occurred_at) continue
    if (
      !isWithinTrackedWindow(
        row.occurred_at,
        row.battle_id,
        trackedBattles,
        row.event_id,
        row.role,
      )
    ) {
      continue
    }

    const fame = row.fame ?? 0
    if (row.role === 'killer') killFame += fame
    else if (row.role === 'victim') deathFame += fame

    const mainHandType = row.equipment?.MainHand?.Type
    const battleKey = findTrackedBattleKey(
      row.occurred_at,
      row.battle_id,
      trackedBattles,
      row.event_id,
      row.role,
    )
    if (mainHandType && battleKey) {
      const category = extractWeaponCategory(mainHandType)
      if (category) {
        let entry = weaponAgg.get(category)
        if (!entry) {
          entry = { sampleId: mainHandType, battles: new Set() }
          weaponAgg.set(category, entry)
        }
        entry.battles.add(battleKey)
        entry.sampleId = mainHandType
      }
    }

    if (row.role === 'killer' || row.role === 'victim') {
      killHistory.push({
        event_id: String(row.event_id ?? ''),
        role: row.role,
        opponent_name: row.opponent_name,
        opponent_guild: row.opponent_guild,
        opponent_alliance: row.opponent_alliance,
        fame: row.fame ?? 0,
        item_power: row.item_power,
        occurred_at: row.occurred_at,
      })
    }
  }

  killHistory.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))

  // 상위 10개로 cap — 길게 분포된 멤버도 카드가 끝없이 늘어나지 않도록.
  const weaponBreakdown: WeaponCount[] = Array.from(weaponAgg.entries())
    .map(([category, w]) => ({
      weapon_id: w.sampleId,
      weapon_name: category,
      count: w.battles.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    killFame,
    deathFame,
    weaponBreakdown,
    killHistory: killHistory.slice(0, 50),
  }
}
