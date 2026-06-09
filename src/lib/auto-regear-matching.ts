// Auto-regear ↔ tracked battles 매칭. 한 이벤트의 battle_started_at 주변
// 시간창에서 tenant_battle_records 를 찾아 albion_battle_id 집합을 돌려준다.
//
// killboard_events 는 이 albion_battle_id 와 정확 매칭 (`.in('battle_id', ...)`) 으로
// 필터링되므로, 솔로 갱크/던전/딴 전투 사망은 자동으로 제외된다. tenant_battle_records
// insert 시 `buildProvisionalTenantRow` 가 `MATCHUP_MIN_SIZE = 10` 을 양쪽에 적용 —
// 홈/메인 상대 둘 다 10명 이상이어야 행이 생성되므로 갱크 행은 애초에 들어오지 않는다.
//
// **per-row low-engagement 컷은 적용하지 않는다**: 한 전투에 다중 알라이언스가 있을 때
// `tenant_battle_records` 는 main_opponent_force_key 별로 행이 분리되어 들어가서
// 한 행의 home_kills/home_deaths 가 "특정 상대와의 매치업" 만 잡는다. 다섯 진영 전투에서
// 우리 길드가 실제로 22 데스를 봐도 메인 상대 한 진영 행에는 1 데스만 잡혀
// `isLowEngagement` 컷에 걸려 자동 리기어가 누락되는 사례 발생 (2026-04-30 진단,
// 배틀 465454579). MATCHUP_MIN_SIZE 가 이미 갱크를 거른다.
//
// 시간창 선택:
//   - lower bound: battle_started_at - 15min (호스트가 직전에 마킹 못한 경우 보호)
//   - upper bound: battle_started_at + 4h (한 이벤트 동안 발생하는 모든 후속 전투 포함)
// 호스트가 "Started" 버튼을 실제 ZvZ 보다 1h 정도 일찍 누르고 이벤트가 2-3h 진행되는
// 일반 패턴을 커버. 이전 +60min 은 너무 좁아 14:50 시작 전투처럼 "이벤트 후반부"
// 가 자동 매칭에서 누락됐다 (2026-04-30 진단). cross-event 오염은 manual claim
// supersede 와 per-victim role_cap 으로 방어된다.
// AUTO_REGEAR_MATCH_TIMEOUT_MS (6h) 와도 정합 — 이벤트 종료 인정 시각 안에 든다.
//
// legacy NULL battle_id (마이그 096 이전 sync) 행은 정확 매칭에서 제외. 마이그
// 적용 후 sync 된 모든 행은 battle_id 채워져 있으므로 운영 영향 없음.
//
// 관련 메모: feedback_albion_zvz_achievement_rules.md (규칙 1, /battles 판정 규칙)

import type { SupabaseClient } from '@supabase/supabase-js'

export const MATCH_WINDOW_BEFORE_MS = 15 * 60 * 1000
export const MATCH_WINDOW_AFTER_MS = 4 * 60 * 60 * 1000

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

export interface TrackedBattleEventWindow {
  eventId: string
  battleStartedAtIso: string
}

interface EventWindow {
  eventId: string
  lowerMs: number
  upperMs: number
  lowerIso: string
  upperIso: string
}

// PostgREST 가 bigint 를 string 으로 직렬화할 수 있어 number 로 정규화.
// 정수 안전 범위를 넘는 값은 거부 (`Number.isSafeInteger`) — bigint 가 string 으로
// 와도 알비온 BattleId 는 안전 범위 안에 들어온다.
function normalizeAlbionBattleId(raw: number | string | null): number | null {
  if (raw === null) return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(n) ? n : null
}

function toEventWindow(input: TrackedBattleEventWindow): EventWindow | null {
  const battleMs = Date.parse(input.battleStartedAtIso)
  if (!Number.isFinite(battleMs)) return null
  const lowerMs = battleMs - MATCH_WINDOW_BEFORE_MS
  const upperMs = battleMs + MATCH_WINDOW_AFTER_MS
  return {
    eventId: input.eventId,
    lowerMs,
    upperMs,
    lowerIso: new Date(lowerMs).toISOString(),
    upperIso: new Date(upperMs).toISOString(),
  }
}

function rowToMatchedBattle(row: TenantBattleRow): MatchedTrackedBattle | null {
  const br = Array.isArray(row.battle_records) ? row.battle_records[0] : row.battle_records
  if (!br) return null
  const albionBattleId = normalizeAlbionBattleId(br.albion_battle_id)
  if (albionBattleId === null) return null
  return {
    albionBattleId,
    startedAtIso: row.started_at,
    endedAtIso: br.ended_at ?? row.started_at,
    homeTeamSize: row.home_team_size,
    clusterName: br.cluster_name ?? null,
  }
}

function addMatchedBattle(
  out: MatchedTrackedBattle[],
  seen: Set<number>,
  row: TenantBattleRow,
): void {
  const matched = rowToMatchedBattle(row)
  if (!matched || seen.has(matched.albionBattleId)) return
  seen.add(matched.albionBattleId)
  out.push(matched)
}

// 한 이벤트의 battle_started_at 주변에서 tracked battle 후보를 찾는다.
// per-row low-engagement 컷은 적용하지 않음 (위 주석 참조).
// 같은 albion_battle_id 가 다중 매치업으로 여러 행에 들어갈 수 있어 dedupe 한다.
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
      'started_at, home_team_size, battle_records!inner(albion_battle_id, cluster_name, ended_at)',
    )
    .eq('guild_id', guildId)
    .gte('started_at', lowerIso)
    .lte('started_at', upperIso)
  if (error) {
    throw new Error(`tenant_battle_records query failed: ${error.message}`)
  }

  const seen = new Set<number>()
  const out: MatchedTrackedBattle[] = []
  for (const row of (data ?? []) as TenantBattleRow[]) {
    addMatchedBattle(out, seen, row)
  }
  return out
}

export async function findTrackedBattleIdsForEvents(
  db: SupabaseClient,
  guildId: string,
  events: readonly TrackedBattleEventWindow[],
): Promise<Map<string, MatchedTrackedBattle[]>> {
  const windows = events.map(toEventWindow).filter((value): value is EventWindow => value !== null)
  const result = new Map<string, MatchedTrackedBattle[]>()
  for (const window of windows) result.set(window.eventId, [])
  if (windows.length === 0) return result

  const lowerIso = windows.reduce((min, window) => window.lowerIso < min ? window.lowerIso : min, windows[0].lowerIso)
  const upperIso = windows.reduce((max, window) => window.upperIso > max ? window.upperIso : max, windows[0].upperIso)

  const { data, error } = await db
    .from('tenant_battle_records')
    .select(
      'started_at, home_team_size, battle_records!inner(albion_battle_id, cluster_name, ended_at)',
    )
    .eq('guild_id', guildId)
    .gte('started_at', lowerIso)
    .lte('started_at', upperIso)
  if (error) {
    throw new Error(`tenant_battle_records query failed: ${error.message}`)
  }

  const seenByEvent = new Map<string, Set<number>>()
  for (const window of windows) seenByEvent.set(window.eventId, new Set<number>())
  for (const row of (data ?? []) as TenantBattleRow[]) {
    const startedMs = Date.parse(row.started_at)
    if (!Number.isFinite(startedMs)) continue
    for (const window of windows) {
      if (startedMs < window.lowerMs || startedMs > window.upperMs) continue
      addMatchedBattle(
        result.get(window.eventId) ?? [],
        seenByEvent.get(window.eventId) ?? new Set<number>(),
        row,
      )
    }
  }
  return result
}
