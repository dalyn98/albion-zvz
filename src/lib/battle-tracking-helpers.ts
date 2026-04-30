// tenant_battle_records / battle_records row 빌더. server action 파일('use server')
// 에서는 async export 만 허용되므로 동기 헬퍼는 여기로 분리. cron route / action
// 파일 양쪽에서 import.

import {
  categorizeSize,
  collectInvolvedIds,
  computeOpposingForces,
  computeOutcome,
  computeSides,
  type AlbionBattle,
  type OpponentForce,
  type SidePerspective,
  type SizeCategory,
} from '@/lib/albion-battles'
import type { AlbionServer } from '@/lib/albion-gameinfo'

// 매치업 컷오프. small 시작점(10) 과 동일.
const MATCHUP_MIN_SIZE = 10

export interface TenantBattleRow {
  guild_id: string
  battle_record_id: string
  home_guild_id: string
  home_guild_name: string
  home_alliance_id: string | null
  home_alliance_name: string | null
  home_team_size: number
  home_kills: number
  home_deaths: number
  home_kill_fame: number
  // 상대측 전체 합산 (참고용 — 승패/총 페임 표시). UI 의 "v" 표기와 카테고리는
  // main_opponent_* 를 사용. main 만 보면 데이터가 비어 보이는 우려가 있어
  // 합산값도 함께 보존.
  opponent_team_size: number
  opponent_kills: number
  opponent_deaths: number
  opponent_kill_fame: number
  opponent_guild_names: string[]
  opponent_alliance_names: string[]
  primary_opponent_name: string | null
  // 주 상대 (mainOpponent) — alliance 또는 단독 길드 단위.
  main_opponent_force_key: string
  main_opponent_force_kind: 'alliance' | 'guild' | 'pending' | 'legacy'
  main_opponent_force_name: string
  main_opponent_alliance_id: string | null
  main_opponent_team_size: number
  main_opponent_kills: number
  main_opponent_deaths: number
  main_opponent_kill_fame: number
  // 매치업 분리 메타.
  match_index: number
  match_total: number
  is_provisional: boolean
  match_evaluated_at: string | null
  size_category: SizeCategory
  outcome: 'win' | 'loss' | 'tie'
  outcome_method: string
  started_at: string
}

export interface BattleRecordRow {
  albion_server: AlbionServer
  albion_battle_id: number
  started_at: string
  ended_at: string
  total_players: number
  total_kills: number
  total_fame: number
  cluster_name: string | null
  involved_guild_ids: string[]
  involved_alliance_ids: string[]
  raw_battle: AlbionBattle
}

// 매치업 K/D/Fame — force 단위로 home 과의 교전 페어만 필터링한 결과.
// home_* = 우리 길드원이 force 의 길드원을 상대로 발생시킨 페어만 집계.
// mainOpponent_* = force 의 길드원이 우리 길드원을 상대로 발생시킨 페어 집계.
// 양쪽 모두 killboard_events 의 fame 컬럼을 기준으로 합산해 raw_battle 의 길드
// 합산값(여러 force 와의 교전 합) 과 분리.
interface MatchupStats {
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  mainOppKills: number
  mainOppDeaths: number
  mainOppKillFame: number
}

// killboard_events 페어를 force 별로 필터링해 매치업 K/D/Fame 산출.
//   - role='killer' & opponent_guild ∈ force.guildNames → home 의 force 격파 (kill).
//   - role='victim' & opponent_guild ∈ force.guildNames → home 의 force 에 의한 사망 (death).
// fame: killer 페어의 fame 합 = home_kill_fame, victim 페어의 fame 합 = mainOpp_kill_fame
//       (victim 의 fame 컬럼은 죽은 우리 길드원의 가치 = 상대가 얻은 fame).
function statsFromPairs(pairs: KillboardPair[], force: OpponentForce): MatchupStats {
  const guildSet = new Set(force.guildNames)
  let homeKills = 0
  let homeDeaths = 0
  let homeKillFame = 0
  let mainOppKillFame = 0
  for (const p of pairs) {
    if (!p.opponentGuild || !guildSet.has(p.opponentGuild)) continue
    if (p.role === 'killer') {
      homeKills++
      homeKillFame += p.fame
    } else if (p.role === 'victim') {
      homeDeaths++
      mainOppKillFame += p.fame
    }
  }
  return {
    homeKills,
    homeDeaths,
    homeKillFame,
    mainOppKills: homeDeaths,
    mainOppDeaths: homeKills,
    mainOppKillFame,
  }
}

// killboard_events 가 없는 legacy 폴백 — raw_battle force 합산값을 그대로 사용.
// home 측은 force 별 분리가 불가능하므로 sides.home 의 합산값 (= 다른 force 와의
// 교전까지 포함) 을 그대로 둔다. 정확도 trade-off 를 받아들이는 1회성 백필 경로.
function statsFromRawForce(force: OpponentForce, sides: NonNullable<ReturnType<typeof computeSides>>): MatchupStats {
  return {
    homeKills: sides.home.kills,
    homeDeaths: sides.home.deaths,
    homeKillFame: sides.home.killFame,
    mainOppKills: force.kills,
    mainOppDeaths: force.deaths,
    mainOppKillFame: force.killFame,
  }
}

// 한 force 와의 매치업 row 1개를 만든다. 호출자는 force 단위로 호출하며
// match_index/match_total 과 매치업 stats 를 직접 지정.
function buildMatchupRow(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  sides: ReturnType<typeof computeSides>
  force: OpponentForce
  stats: MatchupStats
  matchIndex: number
  matchTotal: number
  evaluatedAt: string
}): TenantBattleRow | null {
  const sides = input.sides
  if (!sides) return null

  // 카테고리는 max(home, mainOpp) 기반 — 70 vs 150 → zerg.
  const scaleSize = Math.max(sides.home.teamSize, input.force.teamSize)
  const sizeCategory = categorizeSize(scaleSize)
  if (!sizeCategory) return null

  // 승패는 매치업 stats (force 와의 교전만) 기준. raw aggregate 가 아닌
  // 필터링된 fame 으로 비교하므로 같은 battle 의 서로 다른 force 와도 정확.
  const homeSide: SidePerspective = {
    ...sides.home,
    kills: input.stats.homeKills,
    deaths: input.stats.homeDeaths,
    killFame: input.stats.homeKillFame,
  }
  const forceSide: SidePerspective = {
    guildIds: input.force.guildIds,
    allianceIds: input.force.allianceId ? [input.force.allianceId] : [],
    teamSize: input.force.teamSize,
    kills: input.stats.mainOppKills,
    deaths: input.stats.mainOppDeaths,
    killFame: input.stats.mainOppKillFame,
    guildNames: input.force.guildNames,
    allianceNames: input.force.allianceId
      ? [input.battle.alliances?.[input.force.allianceId]?.name ?? input.force.forceName]
      : [],
    primaryGuildName: input.force.guildNames[0] ?? input.force.forceName,
  }
  const outcome = computeOutcome(homeSide, forceSide)

  return {
    guild_id: input.guildId,
    battle_record_id: input.battleRecordId,
    home_guild_id: input.homeGuildId,
    home_guild_name: sides.homeGuildName,
    home_alliance_id: sides.homeAllianceId,
    home_alliance_name: sides.homeAllianceName,
    home_team_size: sides.home.teamSize,
    // 매치업 K/D/Fame — force 와의 교전만 집계.
    home_kills: input.stats.homeKills,
    home_deaths: input.stats.homeDeaths,
    home_kill_fame: input.stats.homeKillFame,
    // 합산값은 그대로 (전체 상대 풀의 통계 — 페이지 hover 등에서 사용).
    opponent_team_size: sides.opponent.teamSize,
    opponent_kills: sides.opponent.kills,
    opponent_deaths: sides.opponent.deaths,
    opponent_kill_fame: sides.opponent.killFame,
    opponent_guild_names: sides.opponent.guildNames,
    opponent_alliance_names: sides.opponent.allianceNames,
    primary_opponent_name: input.force.forceName,
    main_opponent_force_key: input.force.forceKey,
    main_opponent_force_kind: input.force.forceKind,
    main_opponent_force_name: input.force.forceName,
    main_opponent_alliance_id: input.force.allianceId,
    main_opponent_team_size: input.force.teamSize,
    main_opponent_kills: input.stats.mainOppKills,
    main_opponent_deaths: input.stats.mainOppDeaths,
    main_opponent_kill_fame: input.stats.mainOppKillFame,
    match_index: input.matchIndex,
    match_total: input.matchTotal,
    is_provisional: false,
    match_evaluated_at: input.evaluatedAt,
    size_category: sizeCategory,
    outcome,
    outcome_method: 'fame_diff',
    started_at: input.startedAt,
  }
}

// Provisional row — battle 감지 즉시 저장. killboard_events 가 늦게 들어와
// 매치업 판정 불가하므로 mainOpp = "가장 큰 상대 force" 로 임시 채움. 카테고리/
// 사이즈는 임시값. 매 cron tick 마다 재평가되며 확정 시 update + 추가 매치업
// row insert.
//
// 컷오프 통과 조건:
//   1. 홈 사이즈 ≥ 10
//   2. mainOpp (= 가장 큰 force) 사이즈 ≥ 10
//   3. categorizeSize(max(home, mainOpp)) ≠ null (자동 만족)
// 미통과 시 null — 행 미저장.
export function buildProvisionalTenantRow(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  homeAllianceIdOverride?: string | null
}): TenantBattleRow | null {
  const sides = computeSides(input.battle, input.homeGuildId, input.homeAllianceIdOverride)
  if (!sides) return null
  if (sides.home.teamSize < MATCHUP_MIN_SIZE) return null

  const forces = computeOpposingForces(input.battle, input.homeGuildId, input.homeAllianceIdOverride)
  const mainForce = forces[0]
  if (!mainForce || mainForce.teamSize < MATCHUP_MIN_SIZE) return null

  const scaleSize = Math.max(sides.home.teamSize, mainForce.teamSize)
  const sizeCategory = categorizeSize(scaleSize)
  if (!sizeCategory) return null

  // outcome 은 임시로 main force 기준. 매치업 확정 시 갱신.
  const tempForceSide: SidePerspective = {
    guildIds: mainForce.guildIds,
    allianceIds: mainForce.allianceId ? [mainForce.allianceId] : [],
    teamSize: mainForce.teamSize,
    kills: mainForce.kills,
    deaths: mainForce.deaths,
    killFame: mainForce.killFame,
    guildNames: mainForce.guildNames,
    allianceNames: mainForce.allianceId
      ? [input.battle.alliances?.[mainForce.allianceId]?.name ?? mainForce.forceName]
      : [],
    primaryGuildName: mainForce.guildNames[0] ?? mainForce.forceName,
  }
  const outcome = computeOutcome(sides.home, tempForceSide)

  return {
    guild_id: input.guildId,
    battle_record_id: input.battleRecordId,
    home_guild_id: input.homeGuildId,
    home_guild_name: sides.homeGuildName,
    home_alliance_id: sides.homeAllianceId,
    home_alliance_name: sides.homeAllianceName,
    home_team_size: sides.home.teamSize,
    home_kills: sides.home.kills,
    home_deaths: sides.home.deaths,
    home_kill_fame: sides.home.killFame,
    opponent_team_size: sides.opponent.teamSize,
    opponent_kills: sides.opponent.kills,
    opponent_deaths: sides.opponent.deaths,
    opponent_kill_fame: sides.opponent.killFame,
    opponent_guild_names: sides.opponent.guildNames,
    opponent_alliance_names: sides.opponent.allianceNames,
    primary_opponent_name: mainForce.forceName,
    main_opponent_force_key: '__pending__',
    main_opponent_force_kind: 'pending',
    main_opponent_force_name: mainForce.forceName,
    main_opponent_alliance_id: mainForce.allianceId,
    main_opponent_team_size: mainForce.teamSize,
    main_opponent_kills: mainForce.kills,
    main_opponent_deaths: mainForce.deaths,
    main_opponent_kill_fame: mainForce.killFame,
    match_index: 1,
    match_total: 1,
    is_provisional: true,
    match_evaluated_at: null,
    size_category: sizeCategory,
    outcome,
    outcome_method: 'fame_diff',
    started_at: input.startedAt,
  }
}

// killboard_events 페어 입력 — opponent_guild 는 Albion 의 길드명(text). guildId
// 매핑은 raw_battle.guilds 에서 이름으로 역추적. fame 은 매치업 K/D/Fame 분리에
// 필요 (killer 페어의 fame = home_kill_fame 기여, victim 페어의 fame = mainOpp_kill_fame).
export interface KillboardPair {
  role: 'killer' | 'victim'
  opponentGuild: string | null
  fame: number
}

// 어떤 force 와 교전했는지 판정. 페어 ≥1 발견된 force 만 통과. mainOpp 컷오프
// (10) 미통과 force 는 제외.
function determineEngagedForces(
  battle: AlbionBattle,
  homeGuildId: string,
  pairs: KillboardPair[],
  homeAllianceIdOverride?: string | null,
): OpponentForce[] {
  const forces = computeOpposingForces(battle, homeGuildId, homeAllianceIdOverride)
  if (forces.length === 0) return []

  // opponent_guild 이름 set
  const engagedGuildNames = new Set<string>()
  for (const p of pairs) {
    if (p.opponentGuild) engagedGuildNames.add(p.opponentGuild)
  }

  const engaged: OpponentForce[] = []
  for (const force of forces) {
    if (force.teamSize < MATCHUP_MIN_SIZE) continue
    const hasPair = force.guildNames.some((name) => engagedGuildNames.has(name))
    if (hasPair) engaged.push(force)
  }
  return engaged
}

// 매치업 판정 후 최종 row 들 생성. killboardPairs 가 있으면 페어된 force 만
// 분리 row 생성. 페어 0건이면 빈 배열 (= placeholder 삭제 신호). 각 row 의
// K/D/Fame 은 force 별 페어 필터링으로 산출 → 같은 battle 의 다른 force 와의
// 교전이 한 row 에 섞이지 않음.
export function buildFinalMatchupRows(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  killboardPairs: KillboardPair[]
  evaluatedAt: string
  homeAllianceIdOverride?: string | null
}): TenantBattleRow[] {
  const sides = computeSides(input.battle, input.homeGuildId, input.homeAllianceIdOverride)
  if (!sides) return []
  if (sides.home.teamSize < MATCHUP_MIN_SIZE) return []

  const engaged = determineEngagedForces(
    input.battle,
    input.homeGuildId,
    input.killboardPairs,
    input.homeAllianceIdOverride,
  )
  if (engaged.length === 0) return []

  const total = engaged.length
  const rows: TenantBattleRow[] = []
  for (let i = 0; i < engaged.length; i++) {
    const force = engaged[i]
    const stats = statsFromPairs(input.killboardPairs, force)
    const row = buildMatchupRow({
      guildId: input.guildId,
      battleRecordId: input.battleRecordId,
      battle: input.battle,
      homeGuildId: input.homeGuildId,
      startedAt: input.startedAt,
      sides,
      force,
      stats,
      matchIndex: i + 1,
      matchTotal: total,
      evaluatedAt: input.evaluatedAt,
    })
    if (row) rows.push(row)
  }
  return rows
}

// 레거시 row backfill — 마이그 098 이전에 저장된 force_key='__legacy__' 행을
// 새 mainOpponent 모델로 변환. killboard_events 페어 ≥1 인 force 가 있으면
// 그것만 사용 (분리 매치업, K/D/Fame 도 페어 기반 필터링), 없으면 raw_battle 의
// 모든 force ≥10 를 분리 매치업으로 처리(legacy 데이터는 killboard_events 가
// 사라진 경우가 있어 페어 없는 경우에도 raw_battle 에서 best-effort 로 복원,
// 이 경우 K/D 는 raw aggregate 라 정확도 떨어짐).
//
// 새로 계산한 max(home, mainOpp) < 10 이면 (= 새 컷오프 미통과) 빈 배열 → 호출자
// 가 row 를 삭제. 75 vs 8 같은 옛 데이터가 정리됨.
export function buildLegacyBackfillRows(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  killboardPairs: KillboardPair[]
  evaluatedAt: string
  homeAllianceIdOverride?: string | null
}): TenantBattleRow[] {
  const sides = computeSides(input.battle, input.homeGuildId, input.homeAllianceIdOverride)
  if (!sides) return []
  if (sides.home.teamSize < MATCHUP_MIN_SIZE) return []

  // 1차: killboard 페어 기반 force 선정.
  let engaged = determineEngagedForces(
    input.battle,
    input.homeGuildId,
    input.killboardPairs,
    input.homeAllianceIdOverride,
  )
  let usePairs = engaged.length > 0

  // 2차: 페어 0건이면 raw_battle 의 모든 force ≥10 를 분리 매치업으로.
  if (engaged.length === 0) {
    const forces = computeOpposingForces(input.battle, input.homeGuildId, input.homeAllianceIdOverride)
    engaged = forces.filter((f) => f.teamSize >= MATCHUP_MIN_SIZE)
    usePairs = false
  }

  if (engaged.length === 0) return []

  const total = engaged.length
  const rows: TenantBattleRow[] = []
  for (let i = 0; i < engaged.length; i++) {
    const force = engaged[i]
    const stats = usePairs
      ? statsFromPairs(input.killboardPairs, force)
      : statsFromRawForce(force, sides)
    const row = buildMatchupRow({
      guildId: input.guildId,
      battleRecordId: input.battleRecordId,
      battle: input.battle,
      homeGuildId: input.homeGuildId,
      startedAt: input.startedAt,
      sides,
      force,
      stats,
      matchIndex: i + 1,
      matchTotal: total,
      evaluatedAt: input.evaluatedAt,
    })
    if (row) rows.push(row)
  }
  return rows
}

// AlbionBattle → battle_records 용 row. raw_battle 에 원본 전체 저장 → W/L
// 재계산/추가 통계 추출을 위해 보존.
export function buildBattleRecordRow(
  battle: AlbionBattle,
  server: AlbionServer,
): BattleRecordRow {
  const { guildIds, allianceIds } = collectInvolvedIds(battle)
  return {
    albion_server: server,
    albion_battle_id: battle.id,
    started_at: battle.startTime,
    ended_at: battle.endTime,
    total_players: Object.keys(battle.players ?? {}).length,
    total_kills: battle.totalKills,
    total_fame: battle.totalFame,
    cluster_name: battle.clusterName,
    involved_guild_ids: guildIds,
    involved_alliance_ids: allianceIds,
    raw_battle: battle,
  }
}
