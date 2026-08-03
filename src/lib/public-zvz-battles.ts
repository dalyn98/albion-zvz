import 'server-only'

import { unstable_cache } from 'next/cache'
import {
  classifyBattleActivity,
  type BattleActivityKind,
} from '@/lib/battle-activity-classification'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { getAdminClient } from '@/lib/supabase-admin'
import { getUtcWeekStartDate, getUtcWeekStartDateString } from '@/lib/public-battlelog-sync'
import {
  loadPublicZvzSeasonRankings,
  PUBLIC_ZVZ_SEASONS_TAG,
  type PublicZvzSeasonRankingResult,
  type PublicSeasonZvzRanking,
} from '@/lib/public-zvz-seasons'

export type PublicZvzServerFilter = AlbionServer | null
export type PublicZvzDivision = 'small' | 'mid' | 'large' | 'zerg'
export type PublicZvzSampleStatus = 'ranked' | 'insufficient_sample'

const RECENT_BATTLE_QUERY_LIMIT = 80
const RECENT_BATTLE_SCAN_LIMIT = 240
const RECENT_BATTLE_RESULT_LIMIT = 24
const PUBLIC_ZVZ_BOARD_CACHE_REVALIDATE_SECONDS = 60
export const PUBLIC_ZVZ_MIN_FORCE_SIZE = 10
export const PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE = 21
export const PUBLIC_ZVZ_MAX_FORCE_SIZE = 999
const DEFAULT_RANKING_LIMIT = 20

interface BattleRecordRow {
  id: string
  albion_server: AlbionServer
  albion_battle_id: number | string
  started_at: string
  ended_at: string
  total_players: number
  total_kills: number
  total_fame: number
  cluster_name: string | null
}

interface ForceSummaryRow {
  battle_record_id: string
  force_level: 'alliance' | 'guild'
  force_kind: 'alliance' | 'guild'
  force_key: string
  force_name: string
  alliance_id: string | null
  alliance_name: string | null
  guild_ids: string[]
  guild_names: string[]
  team_size: number
  kills: number
  deaths: number
  kill_fame: number
  average_item_power: number | null
}

interface TenantLinkRow {
  tenant_id: string
  tenant_slug: string
  albion_server: AlbionServer
  albion_guild_id: string
  profile_enabled: boolean
}

interface WeeklyRollupRow {
  week_start: string
  albion_server: AlbionServer
  guild_albion_id: string
  guild_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  tenant_id: string | null
  tenant_slug: string | null
  tenant_profile_enabled: boolean
  division: PublicZvzDivision
  zvz_battles: number
  kills: number
  deaths: number
  kill_fame: number
  avg_force_size: number | string
  max_force_size: number
  score: number | string
  rank: number
  sample_status: PublicZvzSampleStatus
  latest_battle_at: string | null
}

export interface PublicBattleGuildLink {
  tenantId: string | null
  tenantSlug: string | null
  profileEnabled: boolean
}

export interface PublicBattleForce {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceName: string
  allianceId: string | null
  allianceName: string | null
  guildIds: string[]
  guildNames: string[]
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  averageItemPower: number | null
  guildLink: PublicBattleGuildLink | null
}

export interface PublicRecentBattle {
  id: string
  server: AlbionServer
  albionBattleId: number
  startedAt: string
  endedAt: string
  totalPlayers: number
  totalKills: number
  totalFame: number
  clusterName: string | null
  activityKind: BattleActivityKind
  activityReason: string
  topForces: PublicBattleForce[]
  topGuilds: PublicBattleForce[]
}

export interface PublicWeeklyZvzRanking {
  periodKind: 'week' | 'season'
  weekStart: string
  seasonId: string | null
  seasonName: string | null
  seasonStartsOn: string | null
  seasonEndsOn: string | null
  snapshotDate: string | null
  snapshotIsFinal: boolean | null
  dataThroughAt: string | null
  rankDelta: number | null
  server: AlbionServer
  guildAlbionId: string
  guildName: string
  allianceAlbionId: string | null
  allianceName: string | null
  tenantSlug: string | null
  tenantProfileEnabled: boolean
  division: PublicZvzDivision
  zvzBattles: number
  kills: number
  deaths: number
  killFame: number
  avgForceSize: number
  maxForceSize: number
  score: number
  rank: number
  sampleStatus: PublicZvzSampleStatus
  latestBattleAt: string | null
}

export interface PublicWeeklyZvzRankingResult {
  periodKind: 'week' | 'season'
  weekStart: string
  isCurrentWeek: boolean
  seasonResult: PublicZvzSeasonRankingResult | null
  rankings: PublicWeeklyZvzRanking[]
}

export interface PublicZvzBoardData {
  rankingResult: PublicWeeklyZvzRankingResult
  recentBattles: PublicRecentBattle[]
  rankingError: boolean
  recentError: boolean
}

interface PublicZvzBoardDataLoaders {
  loadRankings: typeof loadPreferredZvzRankings
  loadRecentBattles: typeof loadPublicRecentBattles
}

export function normalizePublicZvzServerFilter(value: unknown): PublicZvzServerFilter {
  return isAlbionServer(value) ? value : null
}

function parsePublicZvzMinPlayers(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? value : null
  }
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function normalizePublicZvzMinPlayers(value: unknown): number {
  const parsed = parsePublicZvzMinPlayers(value)
  if (parsed === null) return PUBLIC_ZVZ_DEFAULT_MIN_FORCE_SIZE
  return Math.min(
    PUBLIC_ZVZ_MAX_FORCE_SIZE,
    Math.max(PUBLIC_ZVZ_MIN_FORCE_SIZE, parsed),
  )
}

function numeric(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function battleDurationSeconds(startedAt: string, endedAt: string): number | null {
  const startMs = Date.parse(startedAt)
  const endMs = Date.parse(endedAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null
  }
  return Math.round((endMs - startMs) / 1000)
}

function forceSort(a: ForceSummaryRow, b: ForceSummaryRow): number {
  if (b.team_size !== a.team_size) return b.team_size - a.team_size
  if (b.kill_fame !== a.kill_fame) return b.kill_fame - a.kill_fame
  return a.force_name.localeCompare(b.force_name)
}

function tenantLinkKey(server: AlbionServer, guildId: string): string {
  return `${server}:${guildId}`
}

function toBattleForce(
  row: ForceSummaryRow,
  server: AlbionServer,
  linksByGuild: ReadonlyMap<string, TenantLinkRow>,
): PublicBattleForce {
  const guildId = row.force_level === 'guild' ? row.guild_ids[0] ?? null : null
  const link = guildId ? linksByGuild.get(tenantLinkKey(server, guildId)) ?? null : null
  return {
    forceKey: row.force_key,
    forceKind: row.force_kind,
    forceName: row.force_name,
    allianceId: row.alliance_id,
    allianceName: row.alliance_name,
    guildIds: row.guild_ids,
    guildNames: row.guild_names,
    teamSize: row.team_size,
    kills: row.kills,
    deaths: row.deaths,
    killFame: row.kill_fame,
    averageItemPower: row.average_item_power,
    guildLink: link
      ? {
          tenantId: link.tenant_id,
          tenantSlug: link.tenant_slug,
          profileEnabled: link.profile_enabled,
        }
      : null,
  }
}

export function classifyPublicBattleFromForces(input: {
  startedAt: string
  endedAt: string
  allianceForces: ReadonlyArray<Pick<ForceSummaryRow, 'team_size' | 'kills' | 'deaths'>>
}): { kind: BattleActivityKind; reason: string } {
  const [subject, opponent] = input.allianceForces
  if (!subject || !opponent) {
    return { kind: 'review', reason: 'not_enough_forces' }
  }
  const meaningfulOpponents = input.allianceForces.slice(1).filter((force) => force.team_size >= 10)
  const smallOpponents = meaningfulOpponents.filter((force) => force.team_size < 21)
  const result = classifyBattleActivity({
    subjectTeamSize: subject.team_size,
    subjectKills: subject.kills,
    subjectDeaths: subject.deaths,
    opponentTeamSize: opponent.team_size,
    opponentKills: opponent.kills,
    opponentDeaths: opponent.deaths,
    battleDurationSeconds: battleDurationSeconds(input.startedAt, input.endedAt),
    opponentForceCount: meaningfulOpponents.length,
    smallOpponentForceCount: smallOpponents.length,
  })
  return { kind: result.kind, reason: result.reason }
}

async function loadTenantLinks(
  guildIds: ReadonlyArray<string>,
): Promise<Map<string, TenantLinkRow>> {
  if (guildIds.length === 0) return new Map()
  const db = getAdminClient()
  const { data, error } = await db
    .from('public_guild_tenant_links')
    .select('tenant_id, tenant_slug, albion_server, albion_guild_id, profile_enabled')
    .in('albion_guild_id', Array.from(new Set(guildIds)))

  if (error) {
    throw new Error(`public guild tenant links query failed: ${error.message}`)
  }

  const links = new Map<string, TenantLinkRow>()
  for (const row of (data ?? []) as TenantLinkRow[]) {
    links.set(tenantLinkKey(row.albion_server, row.albion_guild_id), row)
  }
  return links
}

function groupForcesByBattleId(rows: ReadonlyArray<ForceSummaryRow>): Map<string, ForceSummaryRow[]> {
  const grouped = new Map<string, ForceSummaryRow[]>()
  for (const row of rows) {
    const current = grouped.get(row.battle_record_id) ?? []
    grouped.set(row.battle_record_id, [...current, row])
  }
  return grouped
}

function buildPublicRecentBattleRows(input: {
  battleRows: ReadonlyArray<BattleRecordRow>
  forceRows: ReadonlyArray<ForceSummaryRow>
  linksByGuild: ReadonlyMap<string, TenantLinkRow>
  minPlayers: number
}): PublicRecentBattle[] {
  const forcesByBattleId = groupForcesByBattleId(input.forceRows)
  const battles: PublicRecentBattle[] = []

  for (const row of input.battleRows) {
    const forces = forcesByBattleId.get(row.id) ?? []
    const allianceForces = forces
      .filter((force) => force.force_level === 'alliance')
      .sort(forceSort)
    const guildForces = forces
      .filter((force) => force.force_level === 'guild' && force.team_size > 0)
      .sort(forceSort)

    if ((allianceForces[0]?.team_size ?? 0) < input.minPlayers) continue

    const classification = classifyPublicBattleFromForces({
      startedAt: row.started_at,
      endedAt: row.ended_at,
      allianceForces,
    })

    battles.push({
      id: row.id,
      server: row.albion_server,
      albionBattleId: Number(row.albion_battle_id),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      totalPlayers: row.total_players,
      totalKills: row.total_kills,
      totalFame: row.total_fame,
      clusterName: row.cluster_name,
      activityKind: classification.kind,
      activityReason: classification.reason,
      topForces: allianceForces
        .slice(0, 3)
        .map((force) => toBattleForce(force, row.albion_server, input.linksByGuild)),
      topGuilds: guildForces
        .slice(0, 5)
        .map((force) => toBattleForce(force, row.albion_server, input.linksByGuild)),
    })
  }

  return battles
}

export async function loadPublicRecentBattles(options: {
  server: PublicZvzServerFilter
  minPlayers: number
  limit?: number
}): Promise<PublicRecentBattle[]> {
  const db = getAdminClient()
  const minPlayers = normalizePublicZvzMinPlayers(options.minPlayers)
  const battles: PublicRecentBattle[] = []
  const resultLimit = options.limit ?? RECENT_BATTLE_RESULT_LIMIT
  let offset = 0

  while (battles.length < resultLimit && offset < RECENT_BATTLE_SCAN_LIMIT) {
    let query = db
      .from('battle_records')
      .select(
        'id, albion_server, albion_battle_id, started_at, ended_at, total_players, total_kills, total_fame, cluster_name',
      )
      .gte('total_players', minPlayers * 2)

    if (options.server) query = query.eq('albion_server', options.server)

    const { data: battleData, error: battleError } = await query
      .order('started_at', { ascending: false })
      .range(offset, offset + RECENT_BATTLE_QUERY_LIMIT - 1)
    if (battleError) {
      throw new Error(`public recent battles query failed: ${battleError.message}`)
    }

    const battleRows = (battleData ?? []) as BattleRecordRow[]
    const battleIds = battleRows.map((row) => row.id)
    if (battleIds.length === 0) break

    const { data: forceData, error: forceError } = await db
      .from('battle_force_summaries')
      .select(
        'battle_record_id, force_level, force_kind, force_key, force_name, alliance_id, alliance_name, guild_ids, guild_names, team_size, kills, deaths, kill_fame, average_item_power',
      )
      .in('battle_record_id', battleIds)

    if (forceError) {
      throw new Error(`public force summaries query failed: ${forceError.message}`)
    }

    const forceRows = (forceData ?? []) as ForceSummaryRow[]
    const guildIds = forceRows
      .filter((row) => row.force_level === 'guild')
      .flatMap((row) => row.guild_ids)
    const linksByGuild = await loadTenantLinks(guildIds)
    battles.push(
      ...buildPublicRecentBattleRows({
        battleRows,
        forceRows,
        linksByGuild,
        minPlayers,
      }),
    )

    if (battleRows.length < RECENT_BATTLE_QUERY_LIMIT) break
    offset += RECENT_BATTLE_QUERY_LIMIT
  }

  return battles.slice(0, resultLimit)
}

function toRanking(row: WeeklyRollupRow): PublicWeeklyZvzRanking {
  return {
    periodKind: 'week',
    weekStart: row.week_start,
    seasonId: null,
    seasonName: null,
    seasonStartsOn: null,
    seasonEndsOn: null,
    snapshotDate: null,
    snapshotIsFinal: null,
    dataThroughAt: null,
    rankDelta: null,
    server: row.albion_server,
    guildAlbionId: row.guild_albion_id,
    guildName: row.guild_name,
    allianceAlbionId: row.alliance_albion_id,
    allianceName: row.alliance_name,
    tenantSlug: row.tenant_slug,
    tenantProfileEnabled: row.tenant_profile_enabled,
    division: row.division,
    zvzBattles: row.zvz_battles,
    kills: row.kills,
    deaths: row.deaths,
    killFame: row.kill_fame,
    avgForceSize: numeric(row.avg_force_size),
    maxForceSize: row.max_force_size,
    score: numeric(row.score),
    rank: row.rank,
    sampleStatus: row.sample_status,
    latestBattleAt: row.latest_battle_at,
  }
}

async function queryWeeklyRankings(input: {
  weekStart: string
  server: PublicZvzServerFilter
  rankedOnly: boolean
  limit: number
}): Promise<PublicWeeklyZvzRanking[]> {
  const db = getAdminClient()
  let query = db
    .from('guild_weekly_zvz_rollups')
    .select(
      'week_start, albion_server, guild_albion_id, guild_name, alliance_albion_id, alliance_name, tenant_id, tenant_slug, tenant_profile_enabled, division, zvz_battles, kills, deaths, kill_fame, avg_force_size, max_force_size, score, rank, sample_status, latest_battle_at',
    )
    .eq('week_start', input.weekStart)

  if (input.server) query = query.eq('albion_server', input.server)
  if (input.rankedOnly) query = query.eq('sample_status', 'ranked')

  const orderedQuery = input.server
    ? query.order('rank', { ascending: true })
    : query
        .order('score', { ascending: false })
        .order('kill_fame', { ascending: false })

  const { data, error } = await orderedQuery.limit(input.limit)
  if (error) {
    throw new Error(`weekly ZvZ rankings query failed: ${error.message}`)
  }
  return ((data ?? []) as WeeklyRollupRow[]).map(toRanking)
}

export async function loadWeeklyZvzRankings(options: {
  server: PublicZvzServerFilter
  limit?: number
  now?: Date
}): Promise<PublicWeeklyZvzRankingResult> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 20
  const currentWeekStart = getUtcWeekStartDateString(now)
  const previousWeekStartDate = getUtcWeekStartDate(now)
  previousWeekStartDate.setUTCDate(previousWeekStartDate.getUTCDate() - 7)
  const previousWeekStart = previousWeekStartDate.toISOString().slice(0, 10)

  const currentRanked = await queryWeeklyRankings({
    weekStart: currentWeekStart,
    server: options.server,
    rankedOnly: true,
    limit,
  })
  if (currentRanked.length > 0) {
    return {
      periodKind: 'week',
      weekStart: currentWeekStart,
      isCurrentWeek: true,
      seasonResult: null,
      rankings: currentRanked,
    }
  }

  const previousRanked = await queryWeeklyRankings({
    weekStart: previousWeekStart,
    server: options.server,
    rankedOnly: true,
    limit,
  })
  if (previousRanked.length > 0) {
    return {
      periodKind: 'week',
      weekStart: previousWeekStart,
      isCurrentWeek: false,
      seasonResult: null,
      rankings: previousRanked,
    }
  }

  const currentAny = await queryWeeklyRankings({
    weekStart: currentWeekStart,
    server: options.server,
    rankedOnly: false,
    limit,
  })
  return {
    periodKind: 'week',
    weekStart: currentWeekStart,
    isCurrentWeek: true,
    seasonResult: null,
    rankings: currentAny,
  }
}

function toSeasonRanking(row: PublicSeasonZvzRanking): PublicWeeklyZvzRanking {
  return {
    periodKind: 'season',
    weekStart: getUtcWeekStartDateString(new Date(`${row.snapshotDate}T00:00:00.000Z`)),
    seasonId: row.seasonId,
    seasonName: row.seasonName,
    seasonStartsOn: row.seasonStartsOn,
    seasonEndsOn: row.seasonEndsOn,
    snapshotDate: row.snapshotDate,
    snapshotIsFinal: row.snapshotIsFinal,
    dataThroughAt: row.dataThroughAt,
    rankDelta: row.rankDelta,
    server: row.server,
    guildAlbionId: row.guildAlbionId,
    guildName: row.guildName,
    allianceAlbionId: row.allianceAlbionId,
    allianceName: row.allianceName,
    tenantSlug: row.tenantSlug,
    tenantProfileEnabled: row.tenantProfileEnabled,
    division: row.division,
    zvzBattles: row.zvzBattles,
    kills: row.kills,
    deaths: row.deaths,
    killFame: row.killFame,
    avgForceSize: row.avgForceSize,
    maxForceSize: row.maxForceSize,
    score: row.score,
    rank: row.rank,
    sampleStatus: row.sampleStatus,
    latestBattleAt: row.latestBattleAt,
  }
}

export async function loadPreferredZvzRankings(options: {
  server: PublicZvzServerFilter
  seasonId?: string | null
  asOfDate?: string | null
  limit?: number
  now?: Date
}): Promise<PublicWeeklyZvzRankingResult> {
  const seasonResult = await loadPublicZvzSeasonRankings({
    server: options.server,
    seasonId: options.seasonId,
    asOfDate: options.asOfDate,
    limit: options.limit ?? DEFAULT_RANKING_LIMIT,
    now: options.now,
  })
  if (seasonResult.configured) {
    return {
      periodKind: 'season',
      weekStart: getUtcWeekStartDateString(
        new Date(`${seasonResult.requestedDate}T00:00:00.000Z`),
      ),
      isCurrentWeek: false,
      seasonResult,
      rankings: seasonResult.rankings.map(toSeasonRanking),
    }
  }
  return loadWeeklyZvzRankings(options)
}

function emptyWeeklyZvzRankingResult(now: Date): PublicWeeklyZvzRankingResult {
  return {
    periodKind: 'week',
    weekStart: getUtcWeekStartDateString(now),
    isCurrentWeek: true,
    seasonResult: null,
    rankings: [],
  }
}

const DEFAULT_PUBLIC_ZVZ_BOARD_LOADERS: PublicZvzBoardDataLoaders = {
  loadRankings: loadPreferredZvzRankings,
  loadRecentBattles: loadPublicRecentBattles,
}

async function loadPublicZvzBoardDataUncached(
  options: {
    server: PublicZvzServerFilter
    minPlayers: number
    rankingLimit?: number
    seasonId?: string | null
    asOfDate?: string | null
    now?: Date
  },
  loaders: PublicZvzBoardDataLoaders = DEFAULT_PUBLIC_ZVZ_BOARD_LOADERS,
): Promise<PublicZvzBoardData> {
  const now = options.now ?? new Date()
  const [rankingResult, recentResult] = await Promise.allSettled([
    loaders.loadRankings({
      server: options.server,
      limit: options.rankingLimit ?? DEFAULT_RANKING_LIMIT,
      seasonId: options.seasonId,
      asOfDate: options.asOfDate,
      now,
    }),
    loaders.loadRecentBattles({
      server: options.server,
      minPlayers: options.minPlayers,
    }),
  ])

  return {
    rankingResult:
      rankingResult.status === 'fulfilled'
        ? rankingResult.value
        : emptyWeeklyZvzRankingResult(now),
    recentBattles: recentResult.status === 'fulfilled' ? recentResult.value : [],
    rankingError: rankingResult.status === 'rejected',
    recentError: recentResult.status === 'rejected',
  }
}

const loadPublicZvzBoardDataCached = unstable_cache(
  async (
    serverKey: AlbionServer | 'all',
    minPlayers: number,
    rankingLimit: number,
    seasonId: string,
    asOfDate: string,
  ): Promise<PublicZvzBoardData> => loadPublicZvzBoardDataUncached({
    server: serverKey === 'all' ? null : serverKey,
    minPlayers,
    rankingLimit,
    seasonId: seasonId || null,
    asOfDate: asOfDate || null,
  }),
  ['public-zvz-board-data'],
  {
    revalidate: PUBLIC_ZVZ_BOARD_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_ZVZ_SEASONS_TAG],
  },
)

export async function loadPublicZvzBoardData(
  options: {
    server: PublicZvzServerFilter
    minPlayers: number
    rankingLimit?: number
    seasonId?: string | null
    asOfDate?: string | null
    now?: Date
  },
  loaders?: PublicZvzBoardDataLoaders,
): Promise<PublicZvzBoardData> {
  if (loaders || options.now) {
    return loadPublicZvzBoardDataUncached(options, loaders ?? DEFAULT_PUBLIC_ZVZ_BOARD_LOADERS)
  }

  return loadPublicZvzBoardDataCached(
    options.server ?? 'all',
    normalizePublicZvzMinPlayers(options.minPlayers),
    options.rankingLimit ?? DEFAULT_RANKING_LIMIT,
    options.seasonId ?? '',
    options.asOfDate ?? '',
  )
}
