import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { assessPublicZvzEngagementScaleMatch } from '@/lib/public-zvz-ranking-v2'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  buildPublicBattleGroupReport,
  type PublicBattleGroupReport,
  type PublicBattleRecordRow,
} from '@/lib/public-battle-report-model'
import { normalizePublicZvzBattleId } from '@/lib/public-zvz-record-links'

interface EngagementRow {
  id: string
  sequence: number
  started_at: string
  ended_at: string
  status: PublicZvzBattleEngagement['status']
  coverage: PublicZvzBattleEngagement['coverage']
  result: PublicZvzBattleEngagement['result']
  home_force_kind: 'alliance' | 'guild'
  home_force_albion_id: string
  home_force_name: string
  home_alliance_id: string | null
  home_alliance_name: string | null
  home_side_team_size: number
  opponent_side_team_size: number
  scale: PublicZvzBattleEngagement['scale']
  home_kills: number
  home_deaths: number
  home_kill_fame: number | string
  opponent_kill_fame: number | string
  result_event_count: number
  intervention_event_count: number
  qualification_version: string
}

interface MatchupRow {
  engagement_id: string
  opponent_force_kind: 'alliance' | 'guild'
  opponent_albion_id: string
  opponent_name: string
  opponent_alliance_id: string | null
  opponent_team_size: number
  role: 'result_eligible' | 'intervention'
  event_count: number
  home_kills: number
  home_deaths: number
  home_kill_fame: number | string
  opponent_kill_fame: number | string
}

interface EvidenceRow {
  engagement_id: string
  entity_kind: 'guild' | 'alliance'
  entity_albion_id: string
  entity_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  own_team_size: number
  side_team_size: number
  participation_share: number | string
  battle_credit: number | string
  kills: number
  deaths: number
  kill_fame: number | string
}

export interface PublicZvzBattleMatchup {
  opponentForceKind: 'alliance' | 'guild'
  opponentAlbionId: string
  opponentName: string
  opponentAllianceId: string | null
  opponentTeamSize: number
  role: 'result_eligible' | 'intervention'
  eventCount: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKillFame: number
}

export interface PublicZvzBattleEntityEvidence {
  entityKind: 'guild' | 'alliance'
  entityAlbionId: string
  entityName: string
  allianceAlbionId: string | null
  allianceName: string | null
  ownTeamSize: number
  sideTeamSize: number
  participationShare: number
  battleCredit: number
  kills: number
  deaths: number
  killFame: number
}

export interface PublicZvzBattleEngagement {
  id: string
  sequence: number
  startedAt: string
  endedAt: string
  status:
    | 'final'
    | 'partial_source'
    | 'segmentation_required'
    | 'below_official_size'
    | 'low_engagement'
    | 'insufficient_evidence'
  coverage: 'complete' | 'partial' | 'unavailable'
  result: 'advantage' | 'disadvantage' | 'even' | null
  homeForceKind: 'alliance' | 'guild'
  homeForceAlbionId: string
  homeForceName: string
  homeAllianceId: string | null
  homeAllianceName: string | null
  homeSideTeamSize: number
  opponentSideTeamSize: number
  scale: 'small' | 'mid' | 'large' | 'zerg'
  scaleRankingEligible: boolean
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKillFame: number
  resultEventCount: number
  interventionEventCount: number
  qualificationVersion: string
  matchups: PublicZvzBattleMatchup[]
  evidence: PublicZvzBattleEntityEvidence[]
}

export interface PublicZvzBattleReport {
  server: AlbionServer
  battleId: number
  report: PublicBattleGroupReport
  engagements: PublicZvzBattleEngagement[]
  isOfficial: boolean
}

function numeric(value: number | string | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function loadPublicZvzBattleReportUncached(
  server: AlbionServer,
  battleIdInput: number,
): Promise<PublicZvzBattleReport | null> {
  const battleId = normalizePublicZvzBattleId(battleIdInput)
  if (!battleId) return null
  const db = getAdminClient()
  const { data: battleData, error: battleError } = await db
    .from('battle_records')
    .select(
      'id, albion_battle_id, started_at, ended_at, total_players, total_kills, total_fame, cluster_name, raw_battle',
    )
    .eq('albion_server', server)
    .eq('albion_battle_id', battleId)
    .maybeSingle()
  if (battleError) throw new Error(`public battle report query failed: ${battleError.message}`)
  if (!battleData) return null

  const battle = battleData as PublicBattleRecordRow
  const report = buildPublicBattleGroupReport({
    server,
    requestedBattleIds: [battleId],
    battleRows: [battle],
    eventRows: [],
  })
  if (!report) return null

  const { data: engagementData, error: engagementError } = await db
    .from('public_zvz_engagements')
    .select(
      'id, sequence, started_at, ended_at, status, coverage, result, home_force_kind, home_force_albion_id, home_force_name, home_alliance_id, home_alliance_name, home_side_team_size, opponent_side_team_size, scale, home_kills, home_deaths, home_kill_fame, opponent_kill_fame, result_event_count, intervention_event_count, qualification_version',
    )
    .eq('battle_record_id', battle.id)
    .order('sequence', { ascending: true })
  if (engagementError) {
    throw new Error(`public battle engagement query failed: ${engagementError.message}`)
  }
  const engagementRows = (engagementData ?? []) as EngagementRow[]
  const engagementIds = engagementRows.map((row) => row.id)
  const [matchupResult, evidenceResult] = engagementIds.length > 0
    ? await Promise.all([
        db.from('public_zvz_engagement_matchups').select(
          'engagement_id, opponent_force_kind, opponent_albion_id, opponent_name, opponent_alliance_id, opponent_team_size, role, event_count, home_kills, home_deaths, home_kill_fame, opponent_kill_fame',
        ).in('engagement_id', engagementIds),
        db.from('public_zvz_entity_engagement_evidence').select(
          'engagement_id, entity_kind, entity_albion_id, entity_name, alliance_albion_id, alliance_name, own_team_size, side_team_size, participation_share, battle_credit, kills, deaths, kill_fame',
        ).in('engagement_id', engagementIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (matchupResult.error) throw new Error(`public battle matchup query failed: ${matchupResult.error.message}`)
  if (evidenceResult.error) throw new Error(`public battle evidence query failed: ${evidenceResult.error.message}`)
  const matchups = (matchupResult.data ?? []) as MatchupRow[]
  const evidence = (evidenceResult.data ?? []) as EvidenceRow[]

  const engagements = engagementRows.map((row): PublicZvzBattleEngagement => {
    const scaleMatch = assessPublicZvzEngagementScaleMatch(
      row.home_side_team_size,
      row.opponent_side_team_size,
    )
    return {
      id: row.id,
      sequence: row.sequence,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      coverage: row.coverage,
      result: row.result,
      homeForceKind: row.home_force_kind,
      homeForceAlbionId: row.home_force_albion_id,
      homeForceName: row.home_force_name,
      homeAllianceId: row.home_alliance_id,
      homeAllianceName: row.home_alliance_name,
      homeSideTeamSize: row.home_side_team_size,
      opponentSideTeamSize: row.opponent_side_team_size,
      scale: scaleMatch.scale,
      scaleRankingEligible: row.status === 'final' && scaleMatch.scaleRankingEligible,
      homeKills: row.home_kills,
      homeDeaths: row.home_deaths,
      homeKillFame: numeric(row.home_kill_fame),
      opponentKillFame: numeric(row.opponent_kill_fame),
      resultEventCount: row.result_event_count,
      interventionEventCount: row.intervention_event_count,
      qualificationVersion: row.qualification_version,
      matchups: matchups
        .filter((matchup) => matchup.engagement_id === row.id)
        .map((matchup) => ({
          opponentForceKind: matchup.opponent_force_kind,
          opponentAlbionId: matchup.opponent_albion_id,
          opponentName: matchup.opponent_name,
          opponentAllianceId: matchup.opponent_alliance_id,
          opponentTeamSize: matchup.opponent_team_size,
          role: matchup.role,
          eventCount: matchup.event_count,
          homeKills: matchup.home_kills,
          homeDeaths: matchup.home_deaths,
          homeKillFame: numeric(matchup.home_kill_fame),
          opponentKillFame: numeric(matchup.opponent_kill_fame),
        })),
      evidence: evidence
        .filter((item) => item.engagement_id === row.id)
        .map((item) => ({
          entityKind: item.entity_kind,
          entityAlbionId: item.entity_albion_id,
          entityName: item.entity_name,
          allianceAlbionId: item.alliance_albion_id,
          allianceName: item.alliance_name,
          ownTeamSize: item.own_team_size,
          sideTeamSize: item.side_team_size,
          participationShare: numeric(item.participation_share),
          battleCredit: numeric(item.battle_credit),
          kills: item.kills,
          deaths: item.deaths,
          killFame: numeric(item.kill_fame),
        })),
    }
  })

  return {
    server,
    battleId,
    report,
    engagements,
    isOfficial: engagements.some((engagement) => engagement.status === 'final'),
  }
}

const loadCached = unstable_cache(
  loadPublicZvzBattleReportUncached,
  ['public-zvz-battle-report-v2'],
  { revalidate: 300 },
)

export const loadPublicZvzBattleReport = cache(loadCached)
