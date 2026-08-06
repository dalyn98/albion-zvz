import 'server-only'

import { unstable_cache } from 'next/cache'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
} from '@/lib/public-zvz-record-links'
import {
  loadPublicZvzSeasons,
  PUBLIC_ZVZ_SEASONS_TAG,
  type PublicZvzSeasonSummary,
} from '@/lib/public-zvz-seasons'
import {
  PUBLIC_ZVZ_PRIMARY_SCALE_MIN_ENGAGEMENTS,
  PUBLIC_ZVZ_RANKING_SERVERS,
  assessPublicZvzEngagementScaleMatch,
  selectPublicZvzRankingsPerServer,
  selectPublicZvzPrimaryEngagementScale,
  type PublicZvzEngagementScale,
  type PublicZvzRankingEntityKind,
  type PublicZvzRankingScope,
} from '@/lib/public-zvz-ranking-v2'
import { getAdminClient } from '@/lib/supabase-admin'

const PUBLIC_ZVZ_V2_CACHE_SECONDS = 60

interface SnapshotRow {
  season_id: string
  snapshot_date: string
  data_through_at: string
  is_final: boolean
  guild_count: number
  alliance_count: number
  refreshed_at: string
}

interface RollupRow {
  season_id: string
  snapshot_date: string
  albion_server: AlbionServer
  entity_kind: PublicZvzRankingEntityKind
  entity_albion_id: string
  entity_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  tenant_slug: string | null
  tenant_profile_enabled: boolean
  scope: PublicZvzRankingScope
  engagement_count: number
  equivalent_battles: number | string
  kills: number
  deaths: number
  kill_fame: number | string
  representative_size: number | string
  average_size: number | string
  max_size: number
  combat_index: number | string
  efficiency_index: number | string
  battle_points: number | string
  size_points: number | string
  combat_points: number | string
  efficiency_points: number | string
  activity_points: number | string
  average_item_power: number | string | null
  item_power_sample_count: number
  score: number | string
  rank: number
  sample_status: 'ranked' | 'insufficient_sample'
  latest_battle_at: string
  score_formula_version: string
}

interface EvidenceRow {
  season_id: string
  evidence_date: string
  engagement_id: string
  battle_record_id: string
  albion_server: AlbionServer
  battle_started_at: string
  battle_ended_at: string
  engagement_key: string
  result: 'advantage' | 'disadvantage' | 'even'
  scale: PublicZvzEngagementScale
  entity_kind: PublicZvzRankingEntityKind
  entity_albion_id: string
  entity_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  own_team_size: number
  side_team_size: number
  opponent_side_team_size: number
  participation_share: number | string
  battle_credit: number | string
  battle_points: number | string
  kills: number
  deaths: number
  kill_fame: number | string
  average_item_power: number | string | null
  item_power_sample_count: number
  participation_kind: 'standalone' | 'single_guild_sortie' | 'joint_sortie'
  opponents: unknown
  qualification_version: string
}

interface RepresentativeGuildRow {
  alliance_albion_id: string
  guild_albion_id: string
  guild_name: string
  engagement_count: number
  equivalent_battles: number | string
  kills: number
}

export interface PublicZvzV2Snapshot {
  seasonId: string
  snapshotDate: string
  dataThroughAt: string
  isFinal: boolean
  guildCount: number
  allianceCount: number
  refreshedAt: string
}

export interface PublicZvzV2Selection {
  season: PublicZvzSeasonSummary
  snapshot: PublicZvzV2Snapshot | null
  previousSnapshot: PublicZvzV2Snapshot | null
}

export interface PublicZvzV2Ranking {
  seasonId: string
  seasonName: string
  seasonStartsOn: string
  seasonEndsOn: string | null
  snapshotDate: string
  snapshotIsFinal: boolean
  dataThroughAt: string
  server: AlbionServer
  entityKind: PublicZvzRankingEntityKind
  entityAlbionId: string
  entityName: string
  allianceAlbionId: string | null
  allianceName: string | null
  representativeGuild: PublicZvzV2RepresentativeGuild | null
  tenantSlug: string | null
  tenantProfileEnabled: boolean
  scope: PublicZvzRankingScope
  primaryEngagementScale: PublicZvzEngagementScale | null
  engagementCount: number
  equivalentBattles: number
  kills: number
  deaths: number
  killFame: number
  representativeSize: number
  averageSize: number
  maxSize: number
  combatIndex: number
  efficiencyIndex: number
  battlePoints: number
  sizePoints: number
  combatPoints: number
  efficiencyPoints: number
  activityPoints: number
  averageItemPower: number | null
  itemPowerSampleCount: number
  score: number
  rank: number
  rankDelta: number | null
  sampleStatus: 'ranked' | 'insufficient_sample'
  latestBattleAt: string
  formulaVersion: string
}

export interface PublicZvzV2RepresentativeGuild {
  guildAlbionId: string
  guildName: string
  engagementCount: number
  equivalentBattles: number
  kills: number
}

export interface PublicZvzV2RankingResult {
  configured: boolean
  requestedDate: string
  entityKind: PublicZvzRankingEntityKind
  scope: PublicZvzRankingScope
  selections: PublicZvzV2Selection[]
  availableSeasons: PublicZvzSeasonSummary[]
  rankings: PublicZvzV2Ranking[]
}

export interface PublicZvzV2Opponent {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  albionId: string
  name: string
  allianceId: string | null
  teamSize: number
  role: 'result_eligible' | 'intervention'
  eventCount: number
  kills: number
  deaths: number
  killFame: number
}

export interface PublicZvzV2EntityEvidence {
  engagementId: string
  battleRecordId: string
  startedAt: string
  endedAt: string
  result: 'advantage' | 'disadvantage' | 'even'
  scale: PublicZvzEngagementScale
  entityKind: PublicZvzRankingEntityKind
  entityAlbionId: string
  entityName: string
  allianceAlbionId: string | null
  allianceName: string | null
  ownTeamSize: number
  sideTeamSize: number
  opponentSideTeamSize: number
  scaleRankingEligible: boolean
  participationShare: number
  battleCredit: number
  battlePoints: number
  kills: number
  deaths: number
  killFame: number
  averageItemPower: number | null
  itemPowerSampleCount: number
  participationKind: 'standalone' | 'single_guild_sortie' | 'joint_sortie'
  opponents: PublicZvzV2Opponent[]
  qualificationVersion: string
}

export interface PublicZvzV2EntityRecord {
  selection: PublicZvzV2Selection
  availableSeasons: PublicZvzSeasonSummary[]
  rollups: Partial<Record<PublicZvzRankingScope, PublicZvzV2Ranking>>
  evidence: PublicZvzV2EntityEvidence[]
}

function numeric(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function nullableNumeric(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = numeric(value)
  return parsed > 0 ? parsed : null
}

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function minDate(a: string, b: string): string {
  return a < b ? a : b
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

function selectSeason(
  seasons: readonly PublicZvzSeasonSummary[],
  targetDate: string,
  explicitSeasonId: string | null,
): PublicZvzSeasonSummary | null {
  if (explicitSeasonId) {
    return seasons.find((season) => season.id === explicitSeasonId) ?? null
  }
  return [...seasons].reverse().find((season) => (
    season.startsOn <= targetDate && (!season.endsOn || targetDate < season.endsOn)
  )) ?? null
}

function snapshotFromRow(row: SnapshotRow): PublicZvzV2Snapshot {
  return {
    seasonId: row.season_id,
    snapshotDate: row.snapshot_date,
    dataThroughAt: row.data_through_at,
    isFinal: row.is_final,
    guildCount: row.guild_count,
    allianceCount: row.alliance_count,
    refreshedAt: row.refreshed_at,
  }
}

async function loadSelections(input: {
  seasons: PublicZvzSeasonSummary[]
  requestedDate: string
}): Promise<PublicZvzV2Selection[]> {
  if (input.seasons.length === 0) return []
  const db = getAdminClient()
  const { data, error } = await db
    .from('public_zvz_v2_season_snapshots')
    .select(
      'season_id, snapshot_date, data_through_at, is_final, guild_count, alliance_count, refreshed_at',
    )
    .in('season_id', input.seasons.map((season) => season.id))
    .lte('snapshot_date', input.requestedDate)
    .order('snapshot_date', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`public ZvZ v2 snapshot query failed: ${error.message}`)
  const rows = (data ?? []) as SnapshotRow[]
  return input.seasons.map((season) => {
    const target = minDate(
      input.requestedDate,
      season.endsOn ? previousDate(season.endsOn) : input.requestedDate,
    )
    const candidates = rows.filter((row) => (
      row.season_id === season.id && row.snapshot_date <= target
    ))
    return {
      season,
      snapshot: candidates[0] ? snapshotFromRow(candidates[0]) : null,
      previousSnapshot: candidates[1] ? snapshotFromRow(candidates[1]) : null,
    }
  })
}

function toRanking(
  row: RollupRow,
  selection: PublicZvzV2Selection,
  previousRank: number | null,
  primaryEngagementScale: PublicZvzEngagementScale | null,
  representativeGuild: PublicZvzV2RepresentativeGuild | null,
): PublicZvzV2Ranking {
  const snapshot = selection.snapshot
  if (!snapshot) throw new Error('v2 ranking selection has no snapshot')
  return {
    seasonId: selection.season.id,
    seasonName: selection.season.name,
    seasonStartsOn: selection.season.startsOn,
    seasonEndsOn: selection.season.endsOn,
    snapshotDate: snapshot.snapshotDate,
    snapshotIsFinal: snapshot.isFinal,
    dataThroughAt: snapshot.dataThroughAt,
    server: row.albion_server,
    entityKind: row.entity_kind,
    entityAlbionId: row.entity_albion_id,
    entityName: row.entity_name,
    allianceAlbionId: row.alliance_albion_id,
    allianceName: row.alliance_name,
    representativeGuild,
    tenantSlug: row.tenant_slug,
    tenantProfileEnabled: row.tenant_profile_enabled,
    scope: row.scope,
    primaryEngagementScale,
    engagementCount: row.engagement_count,
    equivalentBattles: numeric(row.equivalent_battles),
    kills: row.kills,
    deaths: row.deaths,
    killFame: numeric(row.kill_fame),
    representativeSize: numeric(row.representative_size),
    averageSize: numeric(row.average_size),
    maxSize: row.max_size,
    combatIndex: numeric(row.combat_index),
    efficiencyIndex: numeric(row.efficiency_index),
    battlePoints: numeric(row.battle_points),
    sizePoints: numeric(row.size_points),
    combatPoints: numeric(row.combat_points),
    efficiencyPoints: numeric(row.efficiency_points),
    activityPoints: numeric(row.activity_points),
    averageItemPower: nullableNumeric(row.average_item_power),
    itemPowerSampleCount: row.item_power_sample_count,
    score: numeric(row.score),
    rank: row.rank,
    rankDelta: previousRank === null ? null : previousRank - row.rank,
    sampleStatus: row.sample_status,
    latestBattleAt: row.latest_battle_at,
    formulaVersion: row.score_formula_version,
  }
}

function primaryEngagementScalesByEntity(
  rows: ReadonlyArray<Pick<RollupRow, 'entity_albion_id' | 'scope' | 'engagement_count'>>,
): Map<string, PublicZvzEngagementScale> {
  const rollupsByEntity = new Map<
    string,
    Array<{ scope: PublicZvzRankingScope; engagementCount: number }>
  >()
  for (const row of rows) {
    const current = rollupsByEntity.get(row.entity_albion_id) ?? []
    current.push({ scope: row.scope, engagementCount: row.engagement_count })
    rollupsByEntity.set(row.entity_albion_id, current)
  }
  const result = new Map<string, PublicZvzEngagementScale>()
  for (const [entityAlbionId, rollups] of rollupsByEntity) {
    const scale = selectPublicZvzPrimaryEngagementScale(rollups)
    if (scale) result.set(entityAlbionId, scale)
  }
  return result
}

async function loadRankingsUncached(options: {
  server: AlbionServer | null
  entityKind: PublicZvzRankingEntityKind
  scope: PublicZvzRankingScope
  seasonId?: string | null
  asOfDate?: string | null
  limit: number
  now?: Date
}): Promise<PublicZvzV2RankingResult> {
  const now = options.now ?? new Date()
  const today = todayUtc(now)
  const requestedDate = minDate(
    normalizePublicZvzDate(options.asOfDate) ?? today,
    today,
  )
  const explicitSeasonId = normalizePublicZvzSeasonId(options.seasonId)
  const allSeasons = (await loadPublicZvzSeasons()).filter(
    (season) => season.startsOn <= today,
  )
  const relevant = options.server
    ? allSeasons.filter((season) => season.server === options.server)
    : allSeasons
  const selectedSeasons = options.server
    ? [selectSeason(relevant, requestedDate, explicitSeasonId)].filter(
        (season): season is PublicZvzSeasonSummary => season !== null,
      )
    : PUBLIC_ZVZ_RANKING_SERVERS.flatMap((server) => {
        const season = selectSeason(
          relevant.filter((candidate) => candidate.server === server),
          requestedDate,
          null,
        )
        return season ? [season] : []
      })
  const effectiveRequestedDate = explicitSeasonId && selectedSeasons[0]
    ? maxDate(requestedDate, selectedSeasons[0].startsOn)
    : requestedDate
  const selections = await loadSelections({
    seasons: selectedSeasons,
    requestedDate: effectiveRequestedDate,
  })
  const rankings: PublicZvzV2Ranking[] = []
  const db = getAdminClient()

  for (const selection of selections) {
    if (!selection.snapshot) continue
    const currentQuery = db
      .from('public_zvz_v2_season_rollups')
      .select('*')
      .eq('season_id', selection.season.id)
      .eq('snapshot_date', selection.snapshot.snapshotDate)
      .eq('entity_kind', options.entityKind)
      .eq('scope', options.scope)
      .order('rank', { ascending: true })
      .limit(options.limit)
    const currentResult = await currentQuery
    if (currentResult.error) {
      throw new Error(`public ZvZ v2 ranking query failed: ${currentResult.error.message}`)
    }
    const currentRows = (currentResult.data ?? []) as RollupRow[]
    const visibleRows = currentRows.some((row) => row.sample_status === 'ranked')
      ? currentRows.filter((row) => row.sample_status === 'ranked')
      : currentRows
    const visibleEntityIds = visibleRows.map((row) => row.entity_albion_id)
    const [previousResult, primaryScaleResult, representativeGuildResult] = visibleEntityIds.length > 0
      ? await Promise.all([
          selection.previousSnapshot
            ? db
                .from('public_zvz_v2_season_rollups')
                .select('entity_albion_id, rank')
                .eq('season_id', selection.season.id)
                .eq('snapshot_date', selection.previousSnapshot.snapshotDate)
                .eq('entity_kind', options.entityKind)
                .eq('scope', options.scope)
                .in('entity_albion_id', visibleEntityIds)
            : Promise.resolve({ data: [], error: null }),
          db
            .from('public_zvz_v2_season_rollups')
            .select('entity_albion_id, scope, engagement_count')
            .eq('season_id', selection.season.id)
            .eq('snapshot_date', selection.snapshot.snapshotDate)
            .eq('entity_kind', options.entityKind)
            .neq('scope', 'overall')
            .gte('engagement_count', PUBLIC_ZVZ_PRIMARY_SCALE_MIN_ENGAGEMENTS)
            .in('entity_albion_id', visibleEntityIds),
          options.entityKind === 'alliance'
            ? db.rpc('get_public_zvz_v2_representative_guilds', {
                p_season_id: selection.season.id,
                p_snapshot_date: selection.snapshot.snapshotDate,
                p_scope: options.scope,
                p_alliance_ids: visibleEntityIds,
              })
            : Promise.resolve({ data: [], error: null }),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]
    if (previousResult.error) {
      throw new Error(`public ZvZ v2 previous ranking query failed: ${previousResult.error.message}`)
    }
    if (primaryScaleResult.error) {
      throw new Error(`public ZvZ v2 primary scale query failed: ${primaryScaleResult.error.message}`)
    }
    if (representativeGuildResult.error) {
      throw new Error(
        `public ZvZ v2 representative guild query failed: ${representativeGuildResult.error.message}`,
      )
    }
    const previousRanks = new Map(
      (previousResult.data ?? []).map((row) => [
        row.entity_albion_id as string,
        Number(row.rank),
      ]),
    )
    const primaryScales = primaryEngagementScalesByEntity(
      (primaryScaleResult.data ?? []) as Array<
        Pick<RollupRow, 'entity_albion_id' | 'scope' | 'engagement_count'>
      >,
    )
    const representativeGuilds = new Map(
      ((representativeGuildResult.data ?? []) as RepresentativeGuildRow[]).map((row) => [
        row.alliance_albion_id,
        {
          guildAlbionId: row.guild_albion_id,
          guildName: row.guild_name,
          engagementCount: row.engagement_count,
          equivalentBattles: numeric(row.equivalent_battles),
          kills: row.kills,
        } satisfies PublicZvzV2RepresentativeGuild,
      ]),
    )
    rankings.push(...visibleRows.map((row) => toRanking(
      row,
      selection,
      previousRanks.get(row.entity_albion_id) ?? null,
      primaryScales.get(row.entity_albion_id) ?? null,
      representativeGuilds.get(row.entity_albion_id) ?? null,
    )))
  }

  return {
    configured: relevant.length > 0,
    requestedDate: effectiveRequestedDate,
    entityKind: options.entityKind,
    scope: options.scope,
    selections,
    availableSeasons: relevant,
    rankings: selectPublicZvzRankingsPerServer(rankings, options.server, options.limit),
  }
}

const loadRankingsCached = unstable_cache(
  loadRankingsUncached,
  ['public-zvz-v2-rankings'],
  {
    revalidate: PUBLIC_ZVZ_V2_CACHE_SECONDS,
    tags: [PUBLIC_ZVZ_SEASONS_TAG],
  },
)

export async function loadPublicZvzV2Rankings(options: {
  server: AlbionServer | null
  entityKind: PublicZvzRankingEntityKind
  scope: PublicZvzRankingScope
  seasonId?: string | null
  asOfDate?: string | null
  limit: number
  now?: Date
}): Promise<PublicZvzV2RankingResult> {
  if (options.now) return loadRankingsUncached(options)
  return loadRankingsCached(options)
}

function opponents(value: unknown): PublicZvzV2Opponent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): PublicZvzV2Opponent[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const row = candidate as Record<string, unknown>
    if (typeof row.forceKey !== 'string' || typeof row.name !== 'string') return []
    return [{
      forceKey: row.forceKey,
      forceKind: row.forceKind === 'alliance' ? 'alliance' : 'guild',
      albionId: typeof row.albionId === 'string' ? row.albionId : '',
      name: row.name,
      allianceId: typeof row.allianceId === 'string' ? row.allianceId : null,
      teamSize: numeric(row.teamSize as number | string | undefined),
      role: row.role === 'intervention' ? 'intervention' : 'result_eligible',
      eventCount: numeric(row.eventCount as number | string | undefined),
      kills: numeric(row.kills as number | string | undefined),
      deaths: numeric(row.deaths as number | string | undefined),
      killFame: numeric(row.killFame as number | string | undefined),
    }]
  })
}

function toEvidence(row: EvidenceRow): PublicZvzV2EntityEvidence {
  const scaleMatch = assessPublicZvzEngagementScaleMatch(
    row.side_team_size,
    row.opponent_side_team_size,
  )
  return {
    engagementId: row.engagement_id,
    battleRecordId: row.battle_record_id,
    startedAt: row.battle_started_at,
    endedAt: row.battle_ended_at,
    result: row.result,
    scale: scaleMatch.scale,
    entityKind: row.entity_kind,
    entityAlbionId: row.entity_albion_id,
    entityName: row.entity_name,
    allianceAlbionId: row.alliance_albion_id,
    allianceName: row.alliance_name,
    ownTeamSize: row.own_team_size,
    sideTeamSize: row.side_team_size,
    opponentSideTeamSize: row.opponent_side_team_size,
    scaleRankingEligible: scaleMatch.scaleRankingEligible,
    participationShare: numeric(row.participation_share),
    battleCredit: numeric(row.battle_credit),
    battlePoints: numeric(row.battle_points),
    kills: row.kills,
    deaths: row.deaths,
    killFame: numeric(row.kill_fame),
    averageItemPower: nullableNumeric(row.average_item_power),
    itemPowerSampleCount: row.item_power_sample_count,
    participationKind: row.participation_kind,
    opponents: opponents(row.opponents),
    qualificationVersion: row.qualification_version,
  }
}

export async function loadPublicZvzV2EntityRecord(options: {
  server: AlbionServer
  entityKind: PublicZvzRankingEntityKind
  entityAlbionId: string
  seasonId?: string | null
  asOfDate?: string | null
  now?: Date
}): Promise<PublicZvzV2EntityRecord | null> {
  const rankingContext = await loadPublicZvzV2Rankings({
    server: options.server,
    entityKind: options.entityKind,
    scope: 'overall',
    seasonId: options.seasonId,
    asOfDate: options.asOfDate,
    limit: 1,
    now: options.now,
  })
  const selection = rankingContext.selections[0]
  if (!selection?.snapshot) return null
  const db = getAdminClient()
  const [rollupResult, evidenceResult, previousResult] = await Promise.all([
    db
      .from('public_zvz_v2_season_rollups')
      .select('*')
      .eq('season_id', selection.season.id)
      .eq('snapshot_date', selection.snapshot.snapshotDate)
      .eq('entity_kind', options.entityKind)
      .eq('entity_albion_id', options.entityAlbionId),
    db
      .from('public_zvz_v2_season_evidence')
      .select('*')
      .eq('season_id', selection.season.id)
      .eq('entity_kind', options.entityKind)
      .eq('entity_albion_id', options.entityAlbionId)
      .lte('evidence_date', selection.snapshot.snapshotDate)
      .order('battle_started_at', { ascending: false })
      .limit(5000),
    selection.previousSnapshot
      ? db
          .from('public_zvz_v2_season_rollups')
          .select('scope, rank')
          .eq('season_id', selection.season.id)
          .eq('snapshot_date', selection.previousSnapshot.snapshotDate)
          .eq('entity_kind', options.entityKind)
          .eq('entity_albion_id', options.entityAlbionId)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (rollupResult.error) {
    throw new Error(`public ZvZ v2 entity rollup query failed: ${rollupResult.error.message}`)
  }
  if (evidenceResult.error) {
    throw new Error(`public ZvZ v2 entity evidence query failed: ${evidenceResult.error.message}`)
  }
  if (previousResult.error) {
    throw new Error(`public ZvZ v2 previous entity rank query failed: ${previousResult.error.message}`)
  }
  const rows = (rollupResult.data ?? []) as RollupRow[]
  if (rows.length === 0) return null
  const previousRanks = new Map(
    (previousResult.data ?? []).map((row) => [
      row.scope as PublicZvzRankingScope,
      Number(row.rank),
    ]),
  )
  const primaryEngagementScale = selectPublicZvzPrimaryEngagementScale(
    rows.map((row) => ({
      scope: row.scope,
      engagementCount: row.engagement_count,
    })),
  )
  const rollups: Partial<Record<PublicZvzRankingScope, PublicZvzV2Ranking>> = {}
  for (const row of rows) {
    rollups[row.scope] = toRanking(
      row,
      selection,
      previousRanks.get(row.scope) ?? null,
      primaryEngagementScale,
      null,
    )
  }
  return {
    selection,
    availableSeasons: rankingContext.availableSeasons,
    rollups,
    evidence: ((evidenceResult.data ?? []) as EvidenceRow[]).map(toEvidence),
  }
}
