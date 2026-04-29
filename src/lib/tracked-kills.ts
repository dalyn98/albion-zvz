// tenant_battle_records 필터를 통과한 "진짜 전투" 의 시간창 + 정확 매칭 인덱스.
// 업적/통계 (리더보드, 내 홈, 멤버 상세 등) 에 집계할 killboard_events 를 이
// 트래킹 배틀들로 제한하는 용도. 1:1 갱킹/소규모 전투는 애초에 tenant_battle_records
// 에 못 들어오므로 자동으로 제외된다.
//
// 매칭 우선순위:
//   1. killboard_events.battle_id 가 있고 tracked battle_id 집합에 포함되면 정확 매칭.
//   2. battle_id 가 NULL (legacy: 마이그 096 이전에 sync 된 행) 이면 시간창 폴백.
// 시간창 폴백은 ±15분 padding 이라 동시간대 1:1 갱킹/소규모 전투의 킬이
// 트래킹 배틀로 잘못 흡수되는 bug 가 있었음 — battle_id 매칭으로 차단.
//
// 관련 메모: feedback_albion_zvz_achievement_rules.md (규칙 1)

import type { getAdminClient } from '@/lib/supabase-admin'
import { isHighEngagement } from '@/lib/low-engagement-cut'

type Db = ReturnType<typeof getAdminClient>

export interface TrackedBattleWindow {
  // 창 안/밖 판정용 (padding 포함). 시간창 폴백 매칭에 사용.
  startedAtMs: number
  endedAtMs: number
  // padding 제외한 원본 tenant_battle_records.started_at. 참여 일자/스트릭
  // 집계에 사용 — padding 은 매칭용이라 날짜 산정에는 쓰지 않는다.
  rawStartedAt: string
  // tenant_battle_records.outcome — 'win' | 'loss' | 'tie'. 승/패 집계에 사용.
  outcome: string
  // Albion gameinfo BattleId. battle_records.albion_battle_id 에서 옴.
  // killboard_events.battle_id (마이그 096) 와 정확 매칭에 사용. 마이그 이전
  // legacy 데이터에서는 NULL 일 수 있어 그 경우 시간창 폴백.
  albionBattleId: number | null
}

// fetchTrackedBattleWindows 의 반환 — windows 외에 byBattleId 룩업 Map 을 미리
// 만들어 caller 가 재계산하지 않게 한다. byBattleId 는 albionBattleId 가 NOT NULL
// 인 window 만 등록.
export interface TrackedBattles {
  windows: TrackedBattleWindow[]
  byBattleId: Map<number, TrackedBattleWindow>
}

// battle_records.ended_at 은 정확한 종료 시각. 시간창 폴백을 위한 padding —
// battle_id 매칭이 안 되는 legacy 행에서만 의미가 있다. 새 데이터는 battle_id
// 정확 매칭이라 padding 영향을 받지 않는다.
const WINDOW_PADDING_MS = 15 * 60 * 1000

export interface FetchTrackedBattleWindowsOptions {
  // 'true' 면 같은 albion_battle_id 의 매치업 분리 row 들을 1개의 window 로 묶어
  // 통계/업적의 outcome / engagement 판정을 main_opponent (가장 큰 force) 매치업
  // 기준으로 결정. tracked.windows 는 albion_battle_id 당 1개씩만 포함되며,
  // tracked.byBattleId 도 그 canonical row 만 가진다. 호출자(stats/achievements
  // 류) 가 길드별 `bundle_split_battles_in_stats` flag 값을 읽어 넘긴다. 'false'
  // (기본) 면 legacy: row 당 window 1개.
  bundleSplits?: boolean
}

export async function fetchTrackedBattleWindows(
  db: Db,
  guildId: string,
  sinceIso?: string | null,
  options?: FetchTrackedBattleWindowsOptions,
): Promise<TrackedBattles> {
  // home_kills/deaths/team_size 는 low-engagement 컷 평가용. raw 적재는 그대로
  // 두고 windows 단계에서만 hide — 통계/업적/킬로그 모든 집계에서 자동 제외.
  // main_opponent_team_size 는 bundleSplits=true 일 때 canonical row 선정용.
  let q = db
    .from('tenant_battle_records')
    .select(
      'started_at, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size, battle_records!inner(ended_at, albion_battle_id)',
    )
    .eq('guild_id', guildId)
  if (sinceIso) q = q.gte('started_at', sinceIso)

  const { data } = await q
  type Row = {
    started_at: string
    outcome: string
    home_kills: number
    home_deaths: number
    home_team_size: number
    main_opponent_team_size: number | null
    battle_records:
      | { ended_at: string | null; albion_battle_id: number | string | null }
      | { ended_at: string | null; albion_battle_id: number | string | null }[]
      | null
  }
  const rows = (data ?? []) as Row[]

  if (options?.bundleSplits) {
    return buildBundledTrackedBattles(rows)
  }

  const windows: TrackedBattleWindow[] = []
  const byBattleId = new Map<number, TrackedBattleWindow>()
  for (const row of rows) {
    const br = Array.isArray(row.battle_records) ? row.battle_records[0] : row.battle_records
    if (!br?.ended_at) continue
    if (
      !isHighEngagement({
        homeKills: row.home_kills,
        homeDeaths: row.home_deaths,
        homeTeamSize: row.home_team_size,
      })
    ) {
      continue
    }
    const startMs = Date.parse(row.started_at)
    const endMs = Date.parse(br.ended_at)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    // PostgREST 가 bigint 를 string 으로 직렬화할 수 있어 number 로 정규화.
    const rawBattleId = br.albion_battle_id
    const albionBattleId =
      typeof rawBattleId === 'number'
        ? rawBattleId
        : typeof rawBattleId === 'string' && rawBattleId.length > 0
          ? Number(rawBattleId)
          : null
    const window: TrackedBattleWindow = {
      startedAtMs: startMs - WINDOW_PADDING_MS,
      endedAtMs: endMs + WINDOW_PADDING_MS,
      rawStartedAt: row.started_at,
      outcome: row.outcome,
      albionBattleId: albionBattleId !== null && Number.isFinite(albionBattleId) ? albionBattleId : null,
    }
    windows.push(window)
    if (window.albionBattleId !== null) {
      byBattleId.set(window.albionBattleId, window)
    }
  }
  windows.sort((a, b) => a.startedAtMs - b.startedAtMs)
  return { windows, byBattleId }
}

// bundleSplits=true 분기 — 같은 albion_battle_id 안의 row 들을 묶어
// 1 window/1 byBattleId entry 로 변환. canonical row 는 main_opponent_team_size
// 가 가장 큰 row (가장 큰 상대 force 와의 매치업). engagement 컷은 묶음 K/D
// 합산에 max(home_team_size) 로 재평가. albion_battle_id 가 NULL 인 legacy row
// 는 묶을 키가 없어 row 별 독립 window 로 유지 (시간창 폴백 매칭이 살아있도록).
function buildBundledTrackedBattles(
  rows: ReadonlyArray<{
    started_at: string
    outcome: string
    home_kills: number
    home_deaths: number
    home_team_size: number
    main_opponent_team_size: number | null
    battle_records:
      | { ended_at: string | null; albion_battle_id: number | string | null }
      | { ended_at: string | null; albion_battle_id: number | string | null }[]
      | null
  }>,
): TrackedBattles {
  type RowGroup = {
    canonical: (typeof rows)[number]
    canonicalMainSize: number
    canonicalEndedAt: string
    homeKillsSum: number
    homeDeathsSum: number
    homeTeamSizeMax: number
  }
  const grouped = new Map<number, RowGroup>()
  const looseWindows: TrackedBattleWindow[] = []

  for (const row of rows) {
    const br = Array.isArray(row.battle_records) ? row.battle_records[0] : row.battle_records
    if (!br?.ended_at) continue
    const rawBattleId = br.albion_battle_id
    const albionBattleId =
      typeof rawBattleId === 'number'
        ? rawBattleId
        : typeof rawBattleId === 'string' && rawBattleId.length > 0
          ? Number(rawBattleId)
          : null
    if (albionBattleId === null || !Number.isFinite(albionBattleId)) {
      // legacy NULL: 묶을 키가 없으니 row 별로 처리 (engagement 컷은 row 단위).
      if (
        !isHighEngagement({
          homeKills: row.home_kills,
          homeDeaths: row.home_deaths,
          homeTeamSize: row.home_team_size,
        })
      ) {
        continue
      }
      const startMs = Date.parse(row.started_at)
      const endMs = Date.parse(br.ended_at)
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
      looseWindows.push({
        startedAtMs: startMs - WINDOW_PADDING_MS,
        endedAtMs: endMs + WINDOW_PADDING_MS,
        rawStartedAt: row.started_at,
        outcome: row.outcome,
        albionBattleId: null,
      })
      continue
    }

    const mainSize = row.main_opponent_team_size ?? 0
    const existing = grouped.get(albionBattleId)
    if (!existing) {
      grouped.set(albionBattleId, {
        canonical: row,
        canonicalMainSize: mainSize,
        canonicalEndedAt: br.ended_at,
        homeKillsSum: row.home_kills ?? 0,
        homeDeathsSum: row.home_deaths ?? 0,
        homeTeamSizeMax: row.home_team_size ?? 0,
      })
      continue
    }
    existing.homeKillsSum += row.home_kills ?? 0
    existing.homeDeathsSum += row.home_deaths ?? 0
    if ((row.home_team_size ?? 0) > existing.homeTeamSizeMax) {
      existing.homeTeamSizeMax = row.home_team_size ?? 0
    }
    if (mainSize > existing.canonicalMainSize) {
      existing.canonical = row
      existing.canonicalMainSize = mainSize
      existing.canonicalEndedAt = br.ended_at
    }
  }

  const windows: TrackedBattleWindow[] = []
  const byBattleId = new Map<number, TrackedBattleWindow>()

  for (const [albionBattleId, group] of grouped) {
    if (
      !isHighEngagement({
        homeKills: group.homeKillsSum,
        homeDeaths: group.homeDeathsSum,
        homeTeamSize: group.homeTeamSizeMax,
      })
    ) {
      continue
    }
    const startMs = Date.parse(group.canonical.started_at)
    const endMs = Date.parse(group.canonicalEndedAt)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    const window: TrackedBattleWindow = {
      startedAtMs: startMs - WINDOW_PADDING_MS,
      endedAtMs: endMs + WINDOW_PADDING_MS,
      rawStartedAt: group.canonical.started_at,
      outcome: group.canonical.outcome,
      albionBattleId,
    }
    windows.push(window)
    byBattleId.set(albionBattleId, window)
  }

  windows.push(...looseWindows)
  windows.sort((a, b) => a.startedAtMs - b.startedAtMs)
  return { windows, byBattleId }
}

// killboard_events 행 한 건이 tracked battle 에 속하는지 판정.
// battle_id 가 있으면 정확 매칭, 없으면 시간창 폴백.
export function isWithinTrackedWindow(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
): boolean {
  return findTrackedWindow(occurredAtIso, battleId, tracked) !== null
}

// 이벤트의 battle_started_at 과 (선택) battle_id 로 매칭되는 tracked window 의
// outcome 을 돌려준다. 없으면 null (공개 전투로 집계된 배틀이 없어 승/패 판정 불가).
export function findTrackedOutcome(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
): string | null {
  return findTrackedWindow(occurredAtIso, battleId, tracked)?.outcome ?? null
}

// 행이 속한 tracked battle 의 그룹핑 키. "1전투당 한 번" 집계가 필요할 때 이 키로
// Set 을 만든다. 우선순위: albionBattleId(precise) → rawStartedAt(legacy fallback).
export function findTrackedBattleKey(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
): string | null {
  const w = findTrackedWindow(occurredAtIso, battleId, tracked)
  if (!w) return null
  return w.albionBattleId !== null ? `albion:${w.albionBattleId}` : `time:${w.rawStartedAt}`
}

function findTrackedWindow(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
): TrackedBattleWindow | null {
  // Authoritative match — kill 의 battle_id 가 있으면 그걸 우선 신뢰.
  // 시간창 안에 들어와도 다른 battle_id 면 그건 다른 전투의 이벤트라 집계 X.
  if (battleId !== null && Number.isFinite(battleId)) {
    return tracked.byBattleId.get(battleId) ?? null
  }
  // Legacy NULL: 시간창 폴백 (마이그 096 이전 sync 된 killboard_events 행).
  if (!occurredAtIso) return null
  return findTrackedWindowByTime(occurredAtIso, tracked.windows)
}

function findTrackedWindowByTime(
  occurredAtIso: string,
  windows: ReadonlyArray<TrackedBattleWindow>,
): TrackedBattleWindow | null {
  if (windows.length === 0) return null
  const t = Date.parse(occurredAtIso)
  if (!Number.isFinite(t)) return null
  // 첫 번째로 startedAtMs > t 인 인덱스. 그 바로 앞까지가 후보.
  let lo = 0
  let hi = windows.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (windows[mid].startedAtMs <= t) lo = mid + 1
    else hi = mid
  }
  // 후보는 [0, lo) 내의 창들. 하지만 overlap 이 있을 수 있어 인접 몇 개만
  // 스캔하면 충분하다 — 모두 훑지 않아도 되도록 최근 20개로 상한.
  const start = Math.max(0, lo - 20)
  for (let i = start; i < lo; i++) {
    if (t <= windows[i].endedAtMs) return windows[i]
  }
  return null
}

// 멤버의 killboard 이벤트를 트래킹 배틀 단위로 묶어 "참여한 배틀" 목록으로
// 반환. 트래킹 외 킬은 무시 (1:1 갱킹 등). 참여 배틀 하나에 복수 킬/데스가
// 있으면 합산.
//
// 설계 의도: 업적/통계의 진짜 소스는 killboard + tenant_battle_records + raw_battle.players.
// 과거에는 events.battle_started_at 으로 참여를 판정했지만 자동시작 등으로
// 시각이 어긋나 매칭 실패 → 0 통계가 빈발.
//
// 0k0d 참여자는 killboard 에 흔적이 없으므로 이 함수만으로는 잡히지 않는다.
// 완전한 participation 집합을 얻으려면 mergeMemberBattles 로 raw_battle.players
// 기반 참여자(fetchMemberBattleParticipations 결과) 와 합쳐야 한다.
export interface MemberBattleOutcome {
  // padding 제외 원본 started_at (일자 기준 스트릭 등에 사용).
  startedAt: string
  outcome: string
  hadDeath: boolean
  killCount: number
  deathCount: number
}

export function groupMemberKillsByBattle<
  K extends { role: string | null; occurred_at: string | null; battle_id: number | null },
>(
  kills: ReadonlyArray<K>,
  tracked: TrackedBattles,
): MemberBattleOutcome[] {
  if (tracked.windows.length === 0 || kills.length === 0) return []
  // window 의 rawStartedAt 을 키로 집계. 같은 시각의 다른 battle_id 두 개가
  // 충돌하는 케이스는 거의 없지만, 안전을 위해 albionBattleId 우선 키 사용.
  const agg = new Map<string, MemberBattleOutcome>()
  for (const k of kills) {
    const w = findTrackedWindow(k.occurred_at, k.battle_id, tracked)
    if (!w) continue
    const key = w.albionBattleId !== null ? `albion:${w.albionBattleId}` : `time:${w.rawStartedAt}`
    let entry = agg.get(key)
    if (!entry) {
      entry = {
        startedAt: w.rawStartedAt,
        outcome: w.outcome,
        hadDeath: false,
        killCount: 0,
        deathCount: 0,
      }
      agg.set(key, entry)
    }
    if (k.role === 'killer') entry.killCount += 1
    else if (k.role === 'victim') {
      entry.deathCount += 1
      entry.hadDeath = true
    }
  }
  return Array.from(agg.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

// battle_records.raw_battle.players ↔ albion_guild_members 매칭 결과를 멤버별로 그룹.
// member_battle_participations RPC (마이그 093) 가 (discord_id, albion_player_id,
// raw_started_at, outcome) 을 돌려주면 이 함수가 albion_player_id →
// (raw_started_at → outcome) 맵으로 재정리. mergeMemberBattles 에서 killboard
// 기반 battles 와 합치는 재료.
//
// albion_player_id 키 이유: Phase 4 부터 미연동 (Discord 가입 안 한) Albion
// 멤버도 통계 모집단에 포함된다. discord_id 는 nullable 이라 키로 못 씀.
// 호출 측은 (1) leaderboard — 모든 멤버, (2) member detail — 본인의
// guild_avatars.albion_player_id 로 lookup.
//
// 0k0d 멤버도 raw_battle.players 에 있으면 여기 잡힘 → participation 집계에서
// 누락 안 됨.
export interface BattleParticipationRow {
  discord_id: string | null
  albion_player_id: string | null
  raw_started_at: string | null
  outcome: string | null
}

export interface ParticipationsResult {
  // albion_player_id → (raw_started_at → outcome). 통계 집계의 주 키.
  byAlbionPlayerId: Map<string, Map<string, string>>
  // 보조 룩업: albion_player_id → discord_id (linked 인 경우만). 미연동 멤버는
  // 키 자체가 없다.
  discordByAlbionPlayerId: Map<string, string>
}

export async function fetchMemberBattleParticipations(
  db: Db,
  guildId: string,
  sinceIso?: string | null,
): Promise<ParticipationsResult> {
  const { data } = await db.rpc('member_battle_participations', { p_guild_id: guildId })
  const byAlbionPlayerId = new Map<string, Map<string, string>>()
  const discordByAlbionPlayerId = new Map<string, string>()
  const sinceMs = sinceIso ? Date.parse(sinceIso) : null
  for (const row of (data ?? []) as BattleParticipationRow[]) {
    if (!row.albion_player_id || !row.raw_started_at) continue
    if (sinceMs !== null) {
      const t = Date.parse(row.raw_started_at)
      if (!Number.isFinite(t) || t < sinceMs) continue
    }
    let inner = byAlbionPlayerId.get(row.albion_player_id)
    if (!inner) {
      inner = new Map<string, string>()
      byAlbionPlayerId.set(row.albion_player_id, inner)
    }
    inner.set(row.raw_started_at, row.outcome ?? '')
    if (row.discord_id) {
      discordByAlbionPlayerId.set(row.albion_player_id, row.discord_id)
    }
  }
  return { byAlbionPlayerId, discordByAlbionPlayerId }
}

// killboard 기반 battles 와 raw_battle.players 기반 participation 집합을 합쳐
// 최종 MemberBattleOutcome 배열을 만든다. killboard 에 기록이 없는 참여(0k0d) 는
// killCount=0, deathCount=0, hadDeath=false 로 추가. 같은 startedAt 이 양쪽 다
// 있으면 killboard 쪽을 우선 (더 풍부한 정보).
//
// tracked 인자: low-engagement 컷이 이미 적용된 windows. participations RPC 는
// 컷 미적용이므로 여기서 tracked.windows 의 rawStartedAt 집합과 교집합만 유지
// 해야 멤버별 집계도 일관된다 (killBattles 는 이미 groupMemberKillsByBattle 가
// tracked 로 필터링했으므로 안전).
export function mergeMemberBattles(
  killBattles: ReadonlyArray<MemberBattleOutcome>,
  memberParticipations: ReadonlyMap<string, string> | undefined,
  tracked: TrackedBattles,
): MemberBattleOutcome[] {
  // tracked.windows 가 진실 — bundleSplits=true 일 때 main_opponent canonical
  // outcome 을 들고 있고, 그 외 케이스에서도 engagement 컷이 적용된 결과다.
  // RPC 의 outcome 은 매치업 분리 row 들 중 임의의 한 개 (순서 보장 없음) 라
  // 일관성을 위해 windows 측을 우선 채택. windows 에 없는 rawStartedAt 은
  // engagement 컷 제외 → skip.
  const trackedOutcomeByRawStart = new Map<string, string>()
  for (const w of tracked.windows) trackedOutcomeByRawStart.set(w.rawStartedAt, w.outcome)
  const byStart = new Map<string, MemberBattleOutcome>()
  for (const b of killBattles) byStart.set(b.startedAt, b)
  if (memberParticipations) {
    for (const [rawStart] of memberParticipations) {
      const canonicalOutcome = trackedOutcomeByRawStart.get(rawStart)
      if (canonicalOutcome === undefined) continue
      if (!byStart.has(rawStart)) {
        byStart.set(rawStart, {
          startedAt: rawStart,
          outcome: canonicalOutcome,
          hadDeath: false,
          killCount: 0,
          deathCount: 0,
        })
      }
    }
  }
  return Array.from(byStart.values()).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}
