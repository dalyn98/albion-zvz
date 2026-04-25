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

// 매치업 컷오프. small 시작점(15) 과 동일.
const MATCHUP_MIN_SIZE = 15

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

// 한 force 와의 매치업 row 1개를 만든다. 호출자는 force 단위로 호출하며
// match_index/match_total 을 직접 지정.
function buildMatchupRow(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  sides: ReturnType<typeof computeSides>
  force: OpponentForce
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

  // 승패는 force 단위로 다시 계산. main force 의 killFame 만 비교.
  const forceSide: SidePerspective = {
    guildIds: input.force.guildIds,
    allianceIds: input.force.allianceId ? [input.force.allianceId] : [],
    teamSize: input.force.teamSize,
    kills: input.force.kills,
    deaths: input.force.deaths,
    killFame: input.force.killFame,
    guildNames: input.force.guildNames,
    allianceNames: input.force.allianceId
      ? [input.battle.alliances?.[input.force.allianceId]?.name ?? input.force.forceName]
      : [],
    primaryGuildName: input.force.guildNames[0] ?? input.force.forceName,
  }
  const outcome = computeOutcome(sides.home, forceSide)

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
    main_opponent_kills: input.force.kills,
    main_opponent_deaths: input.force.deaths,
    main_opponent_kill_fame: input.force.killFame,
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
//   1. 홈 사이즈 ≥ 15
//   2. mainOpp (= 가장 큰 force) 사이즈 ≥ 15
//   3. categorizeSize(max(home, mainOpp)) ≠ null (자동 만족)
// 미통과 시 null — 행 미저장.
export function buildProvisionalTenantRow(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
}): TenantBattleRow | null {
  const sides = computeSides(input.battle, input.homeGuildId)
  if (!sides) return null
  if (sides.home.teamSize < MATCHUP_MIN_SIZE) return null

  const forces = computeOpposingForces(input.battle, input.homeGuildId)
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
// 매핑은 raw_battle.guilds 에서 이름으로 역추적.
export interface KillboardPair {
  role: 'killer' | 'victim'
  opponentGuild: string | null
}

// 어떤 force 와 교전했는지 판정. 페어 ≥1 발견된 force 만 통과. mainOpp 컷오프
// (15) 미통과 force 는 제외.
function determineEngagedForces(
  battle: AlbionBattle,
  homeGuildId: string,
  pairs: KillboardPair[],
): OpponentForce[] {
  const forces = computeOpposingForces(battle, homeGuildId)
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
// 분리 row 생성. 페어 0건이면 빈 배열 (= placeholder 삭제 신호).
export function buildFinalMatchupRows(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  killboardPairs: KillboardPair[]
  evaluatedAt: string
}): TenantBattleRow[] {
  const sides = computeSides(input.battle, input.homeGuildId)
  if (!sides) return []
  if (sides.home.teamSize < MATCHUP_MIN_SIZE) return []

  const engaged = determineEngagedForces(
    input.battle,
    input.homeGuildId,
    input.killboardPairs,
  )
  if (engaged.length === 0) return []

  const total = engaged.length
  const rows: TenantBattleRow[] = []
  for (let i = 0; i < engaged.length; i++) {
    const row = buildMatchupRow({
      guildId: input.guildId,
      battleRecordId: input.battleRecordId,
      battle: input.battle,
      homeGuildId: input.homeGuildId,
      startedAt: input.startedAt,
      sides,
      force: engaged[i],
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
// 그것만 사용 (분리 매치업), 없으면 raw_battle 의 모든 force ≥15 를 분리 매치업
// 으로 처리(legacy 데이터는 killboard_events 가 사라진 경우가 있어 페어 없는
// 경우에도 raw_battle 에서 best-effort 로 복원).
//
// 새로 계산한 max(home, mainOpp) < 15 이면 (= 새 컷오프 미통과) 빈 배열 → 호출자
// 가 row 를 삭제. 75 vs 8 같은 옛 데이터가 정리됨.
export function buildLegacyBackfillRows(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  startedAt: string
  killboardPairs: KillboardPair[]
  evaluatedAt: string
}): TenantBattleRow[] {
  const sides = computeSides(input.battle, input.homeGuildId)
  if (!sides) return []
  if (sides.home.teamSize < MATCHUP_MIN_SIZE) return []

  // 1차: killboard 페어 기반 force 선정.
  let engaged = determineEngagedForces(
    input.battle,
    input.homeGuildId,
    input.killboardPairs,
  )

  // 2차: 페어 0건이면 raw_battle 의 모든 force ≥15 를 분리 매치업으로.
  if (engaged.length === 0) {
    const forces = computeOpposingForces(input.battle, input.homeGuildId)
    engaged = forces.filter((f) => f.teamSize >= MATCHUP_MIN_SIZE)
  }

  if (engaged.length === 0) return []

  const total = engaged.length
  const rows: TenantBattleRow[] = []
  for (let i = 0; i < engaged.length; i++) {
    const row = buildMatchupRow({
      guildId: input.guildId,
      battleRecordId: input.battleRecordId,
      battle: input.battle,
      homeGuildId: input.homeGuildId,
      startedAt: input.startedAt,
      sides,
      force: engaged[i],
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
