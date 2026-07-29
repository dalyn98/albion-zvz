// 멤버 상세 화면 (Discord 연동/미연동 양쪽) 공통의 killboard_events 행 집계 로직.
// - `fetchMemberDetail` (Discord 연동 멤버) — `members-admin-detail.ts`
// - `getAlbionMemberDetail` (미연동 Albion 멤버) — `members-admin-detail.ts`
// 두 함수 모두 같은 row → (fame, observed weapon usage, kill_history) 변환을 하므로
// 순수 함수로 분리해 단위 테스트 가능하게 보관.

import {
  findTrackedBattleKey,
  isWithinTrackedWindow,
  type TrackedBattles,
} from '@/lib/tracked-kills'
import {
  resolveObservedWeaponUsage,
  type ObservedWeaponFact,
  type ObservedWeaponUsage,
} from '@/lib/observed-weapon-usage'

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
// observedWeaponUsage/killHistory 는 상세 화면이 그대로 사용한다.
export interface KillboardAggregation {
  killFame: number
  deathFame: number
  observedWeaponUsage: ObservedWeaponUsage
  killHistory: MemberKillEvent[]
}

// 한 멤버의 killboard_events 행들을 tracked window 안의 것만 추려 fame/무기/킬
// 타임라인으로 압축. tracked 외 (1:1 갱킹 등) 행은 모두 제외.
//
// - killFame/deathFame: tracked 행의 fame 합계. role 이 killer/victim 인 것만 집계.
// - observedWeaponUsage: 공통 resolver 가 멤버+무기군+전투별 한 번만 집계한다.
//   sampleItemId 는 아이콘 렌더용이며 가장 최근 관측 원본 Type 으로 갱신한다.
// - killHistory: 최신순 정렬, 상위 50개로 제한 (UI 가 스크롤 없이 훑을 수 있는 양).
export function aggregateKillboardRows(
  rows: ReadonlyArray<KillboardRow>,
  trackedBattles: TrackedBattles,
  options: {
    memberId?: string | null
    observedWeaponWindowStart?: string | null
  } = {},
): KillboardAggregation {
  let killFame = 0
  let deathFame = 0
  const observedWeaponFacts: ObservedWeaponFact[] = []
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
    if (
      mainHandType &&
      battleKey &&
      (!options.observedWeaponWindowStart ||
        row.occurred_at >= options.observedWeaponWindowStart)
    ) {
      observedWeaponFacts.push({
        memberId: options.memberId ?? 'single-member',
        battleId: battleKey,
        itemType: mainHandType,
        observedAt: row.occurred_at,
      })
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

  return {
    killFame,
    deathFame,
    observedWeaponUsage: resolveObservedWeaponUsage(observedWeaponFacts, 10),
    killHistory: killHistory.slice(0, 50),
  }
}
