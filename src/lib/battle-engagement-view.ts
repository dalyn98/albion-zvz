import type { AlbionServer } from '@/lib/albion-gameinfo'
import type {
  BattleEngagementMatchupRole,
  BattleEngagementResult,
  BattleEngagementRunReason,
  BattleEngagementRunState,
  BattleEngagementStatus,
} from '@/lib/battle-engagements'

export interface BattleEngagementViewDbRow {
  tenant_id: string
  run_id: string
  battle_record_id: string
  albion_server: AlbionServer
  albion_battle_id: number | string
  cluster_name: string | null
  raw_started_at: string
  raw_ended_at: string
  total_players: number | string
  total_kills: number | string
  total_fame: number | string
  home_guild_id: string
  home_guild_name: string
  home_alliance_id: string | null
  home_alliance_name: string | null
  source_hash: string
  source_observation_count: number | string
  run_state: BattleEngagementRunState
  run_reason: BattleEngagementRunReason
  raw_home_kills: number | string
  raw_home_deaths: number | string
  collected_home_kills: number | string
  collected_home_deaths: number | string
  unidentified_event_count: number | string
  evaluated_at: string
  engagement_id: string | null
  engagement_key: string | null
  sequence: number | string | null
  started_at: string | null
  ended_at: string | null
  status: BattleEngagementStatus | null
  result: BattleEngagementResult | null
  home_kills: number | string | null
  home_deaths: number | string | null
  home_kill_fame: number | string | null
  opponent_kills: number | string | null
  opponent_deaths: number | string | null
  opponent_kill_fame: number | string | null
  result_home_kills: number | string | null
  result_home_deaths: number | string | null
  result_home_kill_fame: number | string | null
  result_opponent_kills: number | string | null
  result_opponent_deaths: number | string | null
  result_opponent_kill_fame: number | string | null
  result_eligible_event_count: number | string | null
  intervention_event_count: number | string | null
  other_event_count: number | string | null
  home_team_size: number | string | null
  home_side_team_size: number | string | null
  is_other_only: boolean | null
  note: string | null
  note_updated_at: string | null
  opponent_side_team_size: number | string | null
}

export interface BattleEngagementMatchupDbRow {
  engagement_id: string
  force_key: string
  force_kind: 'alliance' | 'guild'
  force_albion_id: string
  force_name: string
  opponent_alliance_id: string | null
  opponent_team_size: number | string
  matchup_role: BattleEngagementMatchupRole
  event_count: number | string
  home_kills: number | string
  home_deaths: number | string
  home_kill_fame: number | string
  opponent_kills: number | string
  opponent_deaths: number | string
  opponent_kill_fame: number | string
}

export interface BattleEngagementListMatchup {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceAlbionId: string
  forceName: string
  opponentAllianceId: string | null
  opponentTeamSize: number
  role: BattleEngagementMatchupRole
  eventCount: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
}

export interface BattleEngagementListItem {
  id: string
  isRunOnly: boolean
  runId: string
  battleRecordId: string
  engagementKey: string
  sequence: number
  albionServer: AlbionServer
  albionBattleId: number
  clusterName: string | null
  rawStartedAt: string
  rawEndedAt: string
  startedAt: string
  endedAt: string
  totalPlayers: number
  homeGuildId: string
  homeGuildName: string
  homeAllianceId: string | null
  homeAllianceName: string | null
  runState: BattleEngagementRunState
  runReason: BattleEngagementRunReason
  status: BattleEngagementStatus
  result: BattleEngagementResult | null
  evaluatedAt: string
  sourceObservationCount: number
  rawHomeKills: number
  rawHomeDeaths: number
  collectedHomeKills: number
  collectedHomeDeaths: number
  unidentifiedEventCount: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  resultHomeKills: number
  resultHomeDeaths: number
  resultHomeKillFame: number
  resultOpponentKills: number
  resultOpponentDeaths: number
  resultOpponentKillFame: number
  resultEligibleEventCount: number
  interventionEventCount: number
  otherEventCount: number
  homeTeamSize: number
  homeSideTeamSize: number
  opponentTeamSize: number
  isOtherOnly: boolean
  note: string | null
  matchups: BattleEngagementListMatchup[]
}

function integer(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function toMatchup(row: BattleEngagementMatchupDbRow): BattleEngagementListMatchup {
  return {
    forceKey: row.force_key,
    forceKind: row.force_kind,
    forceAlbionId: row.force_albion_id,
    forceName: row.force_name,
    opponentAllianceId: row.opponent_alliance_id,
    opponentTeamSize: integer(row.opponent_team_size),
    role: row.matchup_role,
    eventCount: integer(row.event_count),
    homeKills: integer(row.home_kills),
    homeDeaths: integer(row.home_deaths),
    homeKillFame: integer(row.home_kill_fame),
    opponentKills: integer(row.opponent_kills),
    opponentDeaths: integer(row.opponent_deaths),
    opponentKillFame: integer(row.opponent_kill_fame),
  }
}

export function toBattleEngagementListItems(
  rows: ReadonlyArray<BattleEngagementViewDbRow>,
  matchupRows: ReadonlyArray<BattleEngagementMatchupDbRow>,
): BattleEngagementListItem[] {
  const matchupsByEngagement = new Map<string, BattleEngagementListMatchup[]>()
  for (const row of matchupRows) {
    const matchups = matchupsByEngagement.get(row.engagement_id) ?? []
    matchups.push(toMatchup(row))
    matchupsByEngagement.set(row.engagement_id, matchups)
  }

  const items: BattleEngagementListItem[] = []
  for (const row of rows) {
    if (!row.engagement_id) {
      const status: BattleEngagementStatus =
        row.run_state === 'blocked'
          ? 'blocked'
          : row.run_state === 'segmentation_required'
            ? 'segmentation_required'
            : row.run_state === 'ready'
              ? 'insufficient_evidence'
              : 'pending'
      items.push({
        id: `run:${row.run_id}`,
        isRunOnly: true,
        runId: row.run_id,
        battleRecordId: row.battle_record_id,
        engagementKey: '',
        sequence: 0,
        albionServer: row.albion_server,
        albionBattleId: integer(row.albion_battle_id),
        clusterName: row.cluster_name,
        rawStartedAt: row.raw_started_at,
        rawEndedAt: row.raw_ended_at,
        startedAt: row.raw_started_at,
        endedAt: row.raw_ended_at,
        totalPlayers: integer(row.total_players),
        homeGuildId: row.home_guild_id,
        homeGuildName: row.home_guild_name,
        homeAllianceId: row.home_alliance_id,
        homeAllianceName: row.home_alliance_name,
        runState: row.run_state,
        runReason: row.run_reason,
        status,
        result: null,
        evaluatedAt: row.evaluated_at,
        sourceObservationCount: integer(row.source_observation_count),
        rawHomeKills: integer(row.raw_home_kills),
        rawHomeDeaths: integer(row.raw_home_deaths),
        collectedHomeKills: integer(row.collected_home_kills),
        collectedHomeDeaths: integer(row.collected_home_deaths),
        unidentifiedEventCount: integer(row.unidentified_event_count),
        homeKills: 0,
        homeDeaths: 0,
        homeKillFame: 0,
        opponentKills: 0,
        opponentDeaths: 0,
        opponentKillFame: 0,
        resultHomeKills: 0,
        resultHomeDeaths: 0,
        resultHomeKillFame: 0,
        resultOpponentKills: 0,
        resultOpponentDeaths: 0,
        resultOpponentKillFame: 0,
        resultEligibleEventCount: 0,
        interventionEventCount: 0,
        otherEventCount: 0,
        homeTeamSize: 0,
        homeSideTeamSize: 0,
        opponentTeamSize: 0,
        isOtherOnly: row.run_state === 'ready',
        note: null,
        matchups: [],
      })
      continue
    }
    if (
      !row.engagement_key ||
      !row.started_at ||
      !row.ended_at ||
      !row.status
    ) {
      continue
    }
    const matchups = (matchupsByEngagement.get(row.engagement_id) ?? []).sort(
      (a, b) => {
        if (a.role !== b.role) return a.role === 'result_eligible' ? -1 : 1
        if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount
        return a.forceName.localeCompare(b.forceName)
      },
    )
    const matchupOpponentTeamSize = matchups
      .filter((matchup) => matchup.role === 'result_eligible')
      .reduce((sum, matchup) => sum + matchup.opponentTeamSize, 0)
    const opponentTeamSize = Math.max(
      integer(row.opponent_side_team_size),
      matchupOpponentTeamSize,
    )
    items.push({
      id: row.engagement_id,
      isRunOnly: false,
      runId: row.run_id,
      battleRecordId: row.battle_record_id,
      engagementKey: row.engagement_key,
      sequence: integer(row.sequence),
      albionServer: row.albion_server,
      albionBattleId: integer(row.albion_battle_id),
      clusterName: row.cluster_name,
      rawStartedAt: row.raw_started_at,
      rawEndedAt: row.raw_ended_at,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      totalPlayers: integer(row.total_players),
      homeGuildId: row.home_guild_id,
      homeGuildName: row.home_guild_name,
      homeAllianceId: row.home_alliance_id,
      homeAllianceName: row.home_alliance_name,
      runState: row.run_state,
      runReason: row.run_reason,
      status: row.status,
      result: row.result,
      evaluatedAt: row.evaluated_at,
      sourceObservationCount: integer(row.source_observation_count),
      rawHomeKills: integer(row.raw_home_kills),
      rawHomeDeaths: integer(row.raw_home_deaths),
      collectedHomeKills: integer(row.collected_home_kills),
      collectedHomeDeaths: integer(row.collected_home_deaths),
      unidentifiedEventCount: integer(row.unidentified_event_count),
      homeKills: integer(row.home_kills),
      homeDeaths: integer(row.home_deaths),
      homeKillFame: integer(row.home_kill_fame),
      opponentKills: integer(row.opponent_kills),
      opponentDeaths: integer(row.opponent_deaths),
      opponentKillFame: integer(row.opponent_kill_fame),
      resultHomeKills: integer(row.result_home_kills),
      resultHomeDeaths: integer(row.result_home_deaths),
      resultHomeKillFame: integer(row.result_home_kill_fame),
      resultOpponentKills: integer(row.result_opponent_kills),
      resultOpponentDeaths: integer(row.result_opponent_deaths),
      resultOpponentKillFame: integer(row.result_opponent_kill_fame),
      resultEligibleEventCount: integer(row.result_eligible_event_count),
      interventionEventCount: integer(row.intervention_event_count),
      otherEventCount: integer(row.other_event_count),
      homeTeamSize: integer(row.home_team_size),
      homeSideTeamSize: integer(row.home_side_team_size),
      opponentTeamSize,
      isOtherOnly: row.is_other_only ?? false,
      note: row.note,
      matchups,
    })
  }
  return items.sort((a, b) => {
    const time = Date.parse(b.startedAt) - Date.parse(a.startedAt)
    if (Number.isFinite(time) && time !== 0) return time
    return b.sequence - a.sequence
  })
}
