// 확정 engagement 또는 아직 projection 되지 않은 legacy 전투의 공식 통계
// 시간창 + 이벤트 인덱스. 업적/통계/리기어에 집계할 killboard_events 를 이
// 모집단으로 제한한다.
//
// 매칭 우선순위:
//   1. engagement 는 (event_id, role) 링크로만 정확 매칭.
//   2. projection 전 legacy 전투는 battle_id 정확 매칭.
//   3. battle_id 가 NULL 인 legacy 행만 시간창 폴백.
// 따라서 한 raw battle 안의 개입/기타 이벤트가 확정 engagement 통계에 섞이거나,
// 여러 engagement 중 임의의 결과를 물려받지 않는다.
//
// 관련 메모: feedback_albion_zvz_achievement_rules.md (규칙 1)

import type { getAdminClient } from '@/lib/supabase-admin'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import { isMissingRpcError, type SupabaseRpcErrorLike } from '@/lib/supabase-rpc-errors'

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
  // 공식 통계 단위 UUID. engagement 면 engagement.id, legacy 면
  // tenant_battle_records.id.
  statUnitId?: string
  // true 면 raw battle 전체가 아니라 자동 분리된 확정 engagement.
  isEngagement?: boolean
}

// byBattleId 는 후보 조회용/legacy 정확 매칭용이다. 공식 engagement 이벤트는
// 반드시 byEventKey 를 먼저 통과해야 하며, officialBattleIds 에 포함된 battle 은
// 링크가 없으면 byBattleId 로 폴백하지 않는다.
export interface TrackedBattles {
  windows: TrackedBattleWindow[]
  byBattleId: Map<number, TrackedBattleWindow>
  byEventKey?: Map<string, TrackedBattleWindow>
  officialBattleIds?: Set<number>
}

// battle_records.ended_at 은 정확한 종료 시각. 시간창 폴백을 위한 padding —
// battle_id 매칭이 안 되는 legacy 행에서만 의미가 있다. 새 데이터는 battle_id
// 정확 매칭이라 padding 영향을 받지 않는다.
const WINDOW_PADDING_MS = 15 * 60 * 1000
const MEMBER_BATTLE_PARTICIPATIONS_PAGE_SIZE = 1000

export interface FetchTrackedBattleWindowsOptions {
  // legacy 분리 매치업만 기존 토글에 따라 묶는다. 공식 engagement 는 이미
  // 하나의 판정 단위이므로 이 옵션과 무관하게 다시 묶지 않는다.
  bundleSplits?: boolean
}

type BattleStatUnitRow = {
  stat_unit_id: string
  battle_record_id: string
  started_at: string
  ended_at: string
  outcome: string
  albion_battle_id: number | string | null
  main_opponent_team_size: number | null
  is_engagement: boolean
}

type BattleStatEventRow = {
  stat_unit_id: string
  event_id: number | string
  role: string
  started_at: string
}

export async function fetchTrackedBattleWindows(
  db: Db,
  guildId: string,
  sinceIso?: string | null,
  options?: FetchTrackedBattleWindowsOptions,
): Promise<TrackedBattles> {
  const unitRows = await selectPagedRowsOrThrow<BattleStatUnitRow>({
    label: 'tracked battle windows',
    buildQuery: () => {
      let q = db
        .from('guild_battle_stat_units')
        .select(
          'stat_unit_id, battle_record_id, started_at, ended_at, outcome, albion_battle_id, main_opponent_team_size, is_engagement',
        )
        .eq('guild_id', guildId)
      if (sinceIso) q = q.gte('started_at', sinceIso)
      return q
        .order('started_at', { ascending: true })
        .order('stat_unit_id', { ascending: true }) as unknown as SupabasePagedQuery<BattleStatUnitRow>
    },
  })

  const eventRows = await selectPagedRowsOrThrow<BattleStatEventRow>({
    label: 'tracked battle engagement events',
    buildQuery: () => {
      let q = db
        .from('guild_battle_stat_events')
        .select('stat_unit_id, event_id, role, started_at')
        .eq('guild_id', guildId)
      if (sinceIso) q = q.gte('started_at', sinceIso)
      return q
        .order('started_at', { ascending: true })
        .order('event_id', { ascending: true })
        .order('role', { ascending: true }) as unknown as SupabasePagedQuery<BattleStatEventRow>
    },
  })

  return buildTrackedBattles(unitRows, eventRows, options?.bundleSplits === true)
}

function buildTrackedBattles(
  unitRows: ReadonlyArray<BattleStatUnitRow>,
  eventRows: ReadonlyArray<BattleStatEventRow>,
  bundleLegacy: boolean,
): TrackedBattles {
  const officialRows = unitRows.filter((row) => row.is_engagement)
  const legacyRows = unitRows.filter((row) => !row.is_engagement)
  const selectedLegacyRows = bundleLegacy
    ? bundleLegacyStatUnits(legacyRows)
    : legacyRows
  const windows: TrackedBattleWindow[] = []
  const byBattleId = new Map<number, TrackedBattleWindow>()
  const byStatUnitId = new Map<string, TrackedBattleWindow>()
  const byEventKey = new Map<string, TrackedBattleWindow>()
  const officialBattleIds = new Set<number>()

  for (const row of [...officialRows, ...selectedLegacyRows]) {
    const startMs = Date.parse(row.started_at)
    const endMs = Date.parse(row.ended_at)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue
    const albionBattleId = normalizeBattleId(row.albion_battle_id)
    const window: TrackedBattleWindow = {
      startedAtMs: startMs - WINDOW_PADDING_MS,
      endedAtMs: endMs + WINDOW_PADDING_MS,
      rawStartedAt: row.started_at,
      outcome: row.outcome,
      albionBattleId,
      statUnitId: row.stat_unit_id,
      isEngagement: row.is_engagement,
    }
    windows.push(window)
    byStatUnitId.set(row.stat_unit_id, window)
    if (albionBattleId !== null) {
      byBattleId.set(albionBattleId, window)
      if (row.is_engagement) officialBattleIds.add(albionBattleId)
    }
  }

  for (const row of eventRows) {
    const key = battleEventKey(row.event_id, row.role)
    const window = byStatUnitId.get(row.stat_unit_id)
    if (key && window?.isEngagement) byEventKey.set(key, window)
  }

  windows.sort((a, b) => a.startedAtMs - b.startedAtMs)
  return { windows, byBattleId, byEventKey, officialBattleIds }
}

function bundleLegacyStatUnits(
  rows: ReadonlyArray<BattleStatUnitRow>,
): BattleStatUnitRow[] {
  const canonicalByBattleRecord = new Map<string, BattleStatUnitRow>()
  for (const row of rows) {
    const current = canonicalByBattleRecord.get(row.battle_record_id)
    if (
      !current ||
      (row.main_opponent_team_size ?? 0) >
        (current.main_opponent_team_size ?? 0)
    ) {
      canonicalByBattleRecord.set(row.battle_record_id, row)
    }
  }
  return Array.from(canonicalByBattleRecord.values())
}

function normalizeBattleId(value: number | string | null): number | null {
  const normalized =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.length > 0
        ? Number(value)
        : null
  return normalized !== null && Number.isFinite(normalized) ? normalized : null
}

function battleEventKey(
  eventId: number | string | null | undefined,
  role: string | null | undefined,
): string | null {
  if (
    eventId === null ||
    eventId === undefined ||
    (role !== 'killer' && role !== 'victim')
  ) {
    return null
  }
  const normalizedEventId = String(eventId).trim()
  return normalizedEventId ? `${normalizedEventId}:${role}` : null
}

// killboard_events 행 한 건이 tracked battle 에 속하는지 판정.
// battle_id 가 있으면 정확 매칭, 없으면 시간창 폴백.
export function isWithinTrackedWindow(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
  eventId?: number | string | null,
  role?: string | null,
): boolean {
  return findTrackedWindow(
    occurredAtIso,
    battleId,
    tracked,
    eventId,
    role,
  ) !== null
}

// 이벤트의 battle_started_at 과 (선택) battle_id 로 매칭되는 tracked window 의
// outcome 을 돌려준다. 없으면 null (공개 전투로 집계된 배틀이 없어 승/패 판정 불가).
export function findTrackedOutcome(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
  eventId?: number | string | null,
  role?: string | null,
): string | null {
  return findTrackedWindow(
    occurredAtIso,
    battleId,
    tracked,
    eventId,
    role,
  )?.outcome ?? null
}

// 행이 속한 tracked battle 의 그룹핑 키. "1전투당 한 번" 집계가 필요할 때 이 키로
// Set 을 만든다. 우선순위: albionBattleId(precise) → rawStartedAt(legacy fallback).
export function findTrackedBattleKey(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
  eventId?: number | string | null,
  role?: string | null,
): string | null {
  const w = findTrackedWindow(occurredAtIso, battleId, tracked, eventId, role)
  if (!w) return null
  return trackedWindowKey(w)
}

function findTrackedWindow(
  occurredAtIso: string | null,
  battleId: number | null,
  tracked: TrackedBattles,
  eventId?: number | string | null,
  role?: string | null,
): TrackedBattleWindow | null {
  const eventKey = battleEventKey(eventId, role)
  if (eventKey) {
    const exact = tracked.byEventKey?.get(eventKey)
    if (exact) return exact
  }

  if (battleId !== null && Number.isFinite(battleId)) {
    // 이미 공식 engagement 로 projection 된 raw battle 은 exact event link가
    // 없는 개입/기타 이벤트를 battle_id 만으로 되살리지 않는다.
    if (tracked.officialBattleIds?.has(battleId)) return null
    return tracked.byBattleId.get(battleId) ?? null
  }

  if (!occurredAtIso) return null
  // event identity가 있는데 exact link가 없으면 legacy 창만 폴백 대상으로 삼는다.
  const candidates = eventKey
    ? tracked.windows.filter((window) => !window.isEngagement)
    : tracked.windows
  return findTrackedWindowByTime(occurredAtIso, candidates)
}

function trackedWindowKey(window: TrackedBattleWindow): string {
  if (window.statUnitId) {
    return `${window.isEngagement ? 'engagement' : 'legacy'}:${window.statUnitId}`
  }
  return window.albionBattleId !== null
    ? `albion:${window.albionBattleId}`
    : `time:${window.rawStartedAt}`
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
  K extends {
    event_id?: number | string | null
    role: string | null
    occurred_at: string | null
    battle_id: number | null
  },
>(
  kills: ReadonlyArray<K>,
  tracked: TrackedBattles,
): MemberBattleOutcome[] {
  if (tracked.windows.length === 0 || kills.length === 0) return []
  // window 의 rawStartedAt 을 키로 집계. 같은 시각의 다른 battle_id 두 개가
  // 충돌하는 케이스는 거의 없지만, 안전을 위해 albionBattleId 우선 키 사용.
  const agg = new Map<string, MemberBattleOutcome>()
  for (const k of kills) {
    const w = findTrackedWindow(
      k.occurred_at,
      k.battle_id,
      tracked,
      k.event_id,
      k.role,
    )
    if (!w) continue
    const key = trackedWindowKey(w)
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

type BattleParticipationRpcArgs = {
  p_guild_id: string
  p_albion_player_id?: string | null
  p_discord_id?: string | null
}

export async function fetchMemberBattleParticipations(
  db: Db,
  guildId: string,
  sinceIso?: string | null,
): Promise<ParticipationsResult> {
  const { rows, error } = await loadBattleParticipationRows(db, 'member_battle_participations', {
    p_guild_id: guildId,
  })

  if (error) {
    throw new Error(`Failed to load member battle participations: ${error.message}`)
  }

  return buildParticipationsResult(rows, sinceIso)
}

export async function fetchMemberBattleParticipationsForMember(
  db: Db,
  guildId: string,
  target: { albionPlayerId?: string | null; discordId?: string | null },
  sinceIso?: string | null,
): Promise<ParticipationsResult> {
  const albionPlayerId = target.albionPlayerId?.trim() || null
  const discordId = target.discordId?.trim() || null
  if (!albionPlayerId && !discordId) return emptyParticipationsResult()

  const rpcName = 'member_battle_participations_for_member'
  const { rows, error } = await loadBattleParticipationRows(db, rpcName, {
    p_guild_id: guildId,
    p_albion_player_id: albionPlayerId,
    p_discord_id: discordId,
  })

  if (!error) {
    return buildParticipationsResult(rows, sinceIso)
  }

  if (!isMissingRpcError(error, rpcName)) {
    throw new Error(`Failed to load member battle participations: ${error.message}`)
  }

  const allParticipations = await fetchMemberBattleParticipations(db, guildId, sinceIso)
  if (albionPlayerId) {
    return pickSingleMemberParticipations(allParticipations, albionPlayerId)
  }
  return allParticipations
}

async function loadBattleParticipationRows(
  db: Db,
  rpcName: string,
  args: BattleParticipationRpcArgs,
): Promise<{ rows: BattleParticipationRow[]; error: null } | { rows: []; error: SupabaseRpcErrorLike }> {
  const rows: BattleParticipationRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await db
      .rpc(rpcName, args)
      .order('raw_started_at', { ascending: true })
      .order('albion_player_id', { ascending: true, nullsFirst: false })
      .order('discord_id', { ascending: true, nullsFirst: false })
      .range(from, from + MEMBER_BATTLE_PARTICIPATIONS_PAGE_SIZE - 1)

    if (error) {
      return { rows: [], error }
    }

    const page = (data ?? []) as BattleParticipationRow[]
    rows.push(...page)

    if (page.length < MEMBER_BATTLE_PARTICIPATIONS_PAGE_SIZE) break
    from += MEMBER_BATTLE_PARTICIPATIONS_PAGE_SIZE
  }

  return { rows, error: null }
}

function buildParticipationsResult(
  rows: ReadonlyArray<BattleParticipationRow>,
  sinceIso?: string | null,
): ParticipationsResult {
  const byAlbionPlayerId = new Map<string, Map<string, string>>()
  const discordByAlbionPlayerId = new Map<string, string>()
  const sinceMs = sinceIso ? Date.parse(sinceIso) : null
  for (const row of rows) {
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

function emptyParticipationsResult(): ParticipationsResult {
  return {
    byAlbionPlayerId: new Map(),
    discordByAlbionPlayerId: new Map(),
  }
}

function pickSingleMemberParticipations(
  result: ParticipationsResult,
  albionPlayerId: string,
): ParticipationsResult {
  const byAlbionPlayerId = new Map<string, Map<string, string>>()
  const inner = result.byAlbionPlayerId.get(albionPlayerId)
  if (inner) byAlbionPlayerId.set(albionPlayerId, inner)

  const discordByAlbionPlayerId = new Map<string, string>()
  const discordId = result.discordByAlbionPlayerId.get(albionPlayerId)
  if (discordId) discordByAlbionPlayerId.set(albionPlayerId, discordId)

  return { byAlbionPlayerId, discordByAlbionPlayerId }
}

// killboard 기반 battles 와 raw_battle.players 기반 participation 집합을 합쳐
// 최종 MemberBattleOutcome 배열을 만든다. killboard 에 기록이 없는 참여(0k0d) 는
// killCount=0, deathCount=0, hadDeath=false 로 추가. 같은 startedAt 이 양쪽 다
// 있으면 killboard 쪽을 우선 (더 풍부한 정보).
//
// tracked 인자: ZvZ 분류가 이미 적용된 windows. participations RPC 는
// 컷 미적용이므로 여기서 tracked.windows 의 rawStartedAt 집합과 교집합만 유지
// 해야 멤버별 집계도 일관된다 (killBattles 는 이미 groupMemberKillsByBattle 가
// tracked 로 필터링했으므로 안전).
export function mergeMemberBattles(
  killBattles: ReadonlyArray<MemberBattleOutcome>,
  memberParticipations: ReadonlyMap<string, string> | undefined,
  tracked: TrackedBattles,
): MemberBattleOutcome[] {
  // tracked.windows 가 진실 — bundleSplits=true 일 때 main_opponent canonical
  // outcome 을 들고 있고, 그 외 케이스에서도 ZvZ 분류가 적용된 결과다.
  // RPC 의 outcome 은 매치업 분리 row 들 중 임의의 한 개 (순서 보장 없음) 라
  // 일관성을 위해 windows 측을 우선 채택. windows 에 없는 rawStartedAt 은
      // ZvZ 분류 제외 → skip.
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
