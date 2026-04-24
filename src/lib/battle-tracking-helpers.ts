// tenant_battle_records / battle_records row 빌더. server action 파일('use server')
// 에서는 async export 만 허용되므로 동기 헬퍼는 여기로 분리. cron route / action
// 파일 양쪽에서 import.

import {
  categorizeSize,
  collectInvolvedIds,
  computeOutcome,
  computeSides,
  type AlbionBattle,
  type SizeCategory,
} from '@/lib/albion-battles'
import type { AlbionServer } from '@/lib/albion-gameinfo'

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
  opponent_team_size: number
  opponent_kills: number
  opponent_deaths: number
  opponent_kill_fame: number
  opponent_guild_names: string[]
  opponent_alliance_names: string[]
  primary_opponent_name: string | null
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

// tenant 1건의 battle row 를 만들어 반환. 홈 길드가 참여 안 했거나 규모 필터에
// 안 맞으면 null (호출부에서 스킵).
export function buildTenantBattleRow(input: {
  guildId: string
  battleRecordId: string
  battle: AlbionBattle
  homeGuildId: string
  enabledSizes: Set<SizeCategory>
  startedAt: string
}): TenantBattleRow | null {
  const sides = computeSides(input.battle, input.homeGuildId)
  if (!sides) return null

  // 양측 모두 같은 카테고리여야 매칭(= 스펙). 다른 카테고리면 제외 — e.g. 홈은
  // 30인 small 인데 상대는 200인 zerg 면 "정상적인 small 전투" 가 아님.
  const homeCategory = categorizeSize(sides.home.teamSize)
  const opponentCategory = categorizeSize(sides.opponent.teamSize)
  if (!homeCategory || !opponentCategory) return null
  if (homeCategory !== opponentCategory) return null
  if (!input.enabledSizes.has(homeCategory)) return null

  const outcome = computeOutcome(sides.home, sides.opponent)

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
    primary_opponent_name: sides.opponent.primaryGuildName || null,
    size_category: homeCategory,
    outcome,
    outcome_method: 'fame_diff',
    started_at: input.startedAt,
  }
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
