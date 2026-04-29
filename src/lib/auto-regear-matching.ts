// Auto-regear ↔ tracked battles 매칭. 한 이벤트의 battle_started_at 주변
// 시간창에서 tenant_battle_records 를 찾아 albion_battle_id 집합을 돌려준다.
//
// killboard_events 는 이 albion_battle_id 와 정확 매칭 (`.in('battle_id', ...)`) 으로
// 필터링되므로, 솔로 갱크/던전/딴 전투 사망은 자동으로 제외된다. low-engagement
// 컷도 동일하게 적용 — 통계 모듈과 일관된 기준.
//
// 시간창 선택:
//   - lower bound: battle_started_at - 15min (호스트가 직전에 마킹 못한 경우 보호)
//   - upper bound: battle_started_at + 60min (멀티 얼라이언스 분리 시 후속 부분 전투 포함)
// 경계값은 매직 넘버지만 일반 ZvZ 5-30분 + 분리 전투 고려한 합리적 default.
//
// legacy NULL battle_id (마이그 096 이전 sync) 행은 정확 매칭에서 제외. 마이그
// 적용 후 sync 된 모든 행은 battle_id 채워져 있으므로 운영 영향 없음.
//
// 관련 메모: feedback_albion_zvz_achievement_rules.md (규칙 1, /battles 판정 규칙)

import type { SupabaseClient } from '@supabase/supabase-js'
import { isHighEngagement } from '@/lib/low-engagement-cut'

export const MATCH_WINDOW_BEFORE_MS = 15 * 60 * 1000
export const MATCH_WINDOW_AFTER_MS = 60 * 60 * 1000

export interface MatchedTrackedBattle {
  albionBattleId: number
  startedAtIso: string
  // Albion `/battles` API 가 보고하는 실제 전투 종료 시각. 자동 리기어가
  // "킬보드 indexing 완료" 게이트로 사용 (events.battle_started_at 은 호스트
  // 버튼이라 부정확).
  endedAtIso: string
  homeTeamSize: number
  // 자동 리기어가 "블랙존 한정" 가드를 적용하기 위해 함께 노출.
  clusterName: string | null
}

interface TenantBattleRow {
  started_at: string
  home_kills: number
  home_deaths: number
  home_team_size: number
  battle_records:
    | {
        albion_battle_id: number | string | null
        cluster_name: string | null
        ended_at: string | null
      }
    | Array<{
        albion_battle_id: number | string | null
        cluster_name: string | null
        ended_at: string | null
      }>
    | null
}

// PostgREST 가 bigint 를 string 으로 직렬화할 수 있어 number 로 정규화.
// 정수 안전 범위를 넘는 값은 거부 (`Number.isSafeInteger`) — bigint 가 string 으로
// 와도 알비온 BattleId 는 안전 범위 안에 들어온다.
function normalizeAlbionBattleId(raw: number | string | null): number | null {
  if (raw === null) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(n) ? n : null
}

// 한 이벤트의 battle_started_at 주변에서 tracked battle 후보를 찾는다.
// low-engagement 컷 통과한 것만 반환. 빈 배열 = 자동 리기어 0건 발생해야 함.
export async function findTrackedBattleIdsForEvent(
  db: SupabaseClient,
  guildId: string,
  battleStartedAtIso: string,
): Promise<MatchedTrackedBattle[]> {
  const battleMs = Date.parse(battleStartedAtIso)
  if (!Number.isFinite(battleMs)) return []
  const lowerIso = new Date(battleMs - MATCH_WINDOW_BEFORE_MS).toISOString()
  const upperIso = new Date(battleMs + MATCH_WINDOW_AFTER_MS).toISOString()

  const { data, error } = await db
    .from('tenant_battle_records')
    .select(
      'started_at, home_kills, home_deaths, home_team_size, battle_records!inner(albion_battle_id, cluster_name, ended_at)',
    )
    .eq('guild_id', guildId)
    .gte('started_at', lowerIso)
    .lte('started_at', upperIso)
  if (error) {
    throw new Error(`tenant_battle_records query failed: ${error.message}`)
  }

  const out: MatchedTrackedBattle[] = []
  for (const row of (data ?? []) as TenantBattleRow[]) {
    if (
      !isHighEngagement({
        homeKills: row.home_kills,
        homeDeaths: row.home_deaths,
        homeTeamSize: row.home_team_size,
      })
    ) {
      continue
    }
    const br = Array.isArray(row.battle_records) ? row.battle_records[0] : row.battle_records
    if (!br) continue
    const albionBattleId = normalizeAlbionBattleId(br.albion_battle_id)
    if (albionBattleId === null) continue
    // ended_at 은 schema 상 NOT NULL 이라 항상 존재. 방어적으로 fallback.
    const endedAtIso = br.ended_at ?? row.started_at
    out.push({
      albionBattleId,
      startedAtIso: row.started_at,
      endedAtIso,
      homeTeamSize: row.home_team_size,
      clusterName: br.cluster_name ?? null,
    })
  }
  return out
}
