import 'server-only'

import { unstable_cache } from 'next/cache'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  normalizePublicZvzDate,
  normalizePublicZvzSeasonId,
} from '@/lib/public-zvz-record-links'
import {
  buildPublicZvzDivisionRankMap,
  publicZvzDivisionRankKey,
  type PublicZvzDivision,
  type PublicZvzDivisionFilter,
} from '@/lib/public-zvz-divisions'
import { getAdminClient } from '@/lib/supabase-admin'

export const PUBLIC_ZVZ_SEASONS_TAG = 'public-zvz-seasons'
const PUBLIC_ZVZ_SEASON_CACHE_SECONDS = 60

interface SeasonRow {
  id: string
  albion_server: AlbionServer
  name: string
  starts_on: string
  starts_at: string
  ends_at: string | null
  score_formula_version: string
  created_at: string
  updated_at: string
}

interface SnapshotRow {
  season_id: string
  snapshot_date: string
  data_through_at: string
  is_final: boolean
  guild_count: number
  refreshed_at: string
}

interface V2SnapshotOverviewRow extends SnapshotRow {
  alliance_count: number
}

interface SeasonRollupRow {
  season_id: string
  snapshot_date: string
  albion_server: AlbionServer
  guild_albion_id: string
  guild_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  tenant_slug: string | null
  tenant_profile_enabled: boolean
  division: PublicZvzDivision
  zvz_battles: number
  kills: number
  deaths: number
  kill_fame: number | string
  avg_force_size: number | string
  max_force_size: number
  score: number | string
  rank: number
  sample_status: 'ranked' | 'insufficient_sample'
  latest_battle_at: string | null
  score_formula_version: string
  battle_points: number | string
  kill_points: number | string
  kd_bonus_points: number | string
  kill_fame_points: number | string
  force_size_points: number | string
  death_penalty_points: number | string
}

export interface PublicZvzSeasonSummary {
  id: string
  server: AlbionServer
  name: string
  startsOn: string
  endsOn: string | null
  startsAt: string
  endsAt: string | null
  formulaVersion: string
  createdAt: string
  updatedAt: string
}

export interface PublicZvzSeasonSnapshot {
  seasonId: string
  snapshotDate: string
  dataThroughAt: string
  isFinal: boolean
  guildCount: number
  refreshedAt: string
}

export interface PublicZvzSeasonSelection {
  season: PublicZvzSeasonSummary
  snapshot: PublicZvzSeasonSnapshot | null
  previousSnapshot: PublicZvzSeasonSnapshot | null
}

export interface PublicSeasonZvzRanking {
  seasonId: string
  seasonName: string
  seasonStartsOn: string
  seasonEndsOn: string | null
  snapshotDate: string
  snapshotIsFinal: boolean
  dataThroughAt: string
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
  rankDelta: number | null
  divisionRank: number
  divisionRankDelta: number | null
  sampleStatus: 'ranked' | 'insufficient_sample'
  latestBattleAt: string | null
}

export interface PublicZvzSeasonRankingResult {
  configured: boolean
  requestedDate: string
  selections: PublicZvzSeasonSelection[]
  availableSeasons: PublicZvzSeasonSummary[]
  rankings: PublicSeasonZvzRanking[]
}

export interface PublicZvzSeasonRecordContext {
  season: PublicZvzSeasonSummary
  snapshot: PublicZvzSeasonSnapshot
  previousSnapshot: PublicZvzSeasonSnapshot | null
  availableSeasons: PublicZvzSeasonSummary[]
}

function numeric(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function divisionRankable(row: SeasonRollupRow) {
  return {
    server: row.albion_server,
    guildAlbionId: row.guild_albion_id,
    guildName: row.guild_name,
    division: row.division,
    score: numeric(row.score),
    killFame: numeric(row.kill_fame),
  }
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

function dayBefore(value: string): string {
  return previousDate(value)
}

function earlierInstant(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function exclusiveSnapshotDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const iso = date.toISOString()
  if (iso.slice(11) === '00:00:00.000Z') return iso.slice(0, 10)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function withSeasonBounds(rows: SeasonRow[]): PublicZvzSeasonSummary[] {
  const sorted = [...rows].sort((a, b) => (
    a.albion_server.localeCompare(b.albion_server) ||
    a.starts_at.localeCompare(b.starts_at)
  ))
  return sorted.map((row, index) => {
    const next = sorted[index + 1]
    const nextStartsAt = next?.albion_server === row.albion_server
      ? next.starts_at
      : null
    const endsAt = earlierInstant(row.ends_at, nextStartsAt)
    return {
      id: row.id,
      server: row.albion_server,
      name: row.name,
      startsOn: row.starts_on,
      endsOn: exclusiveSnapshotDate(endsAt),
      startsAt: row.starts_at,
      endsAt,
      formulaVersion: row.score_formula_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

async function loadSeasonRowsUncached(): Promise<PublicZvzSeasonSummary[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('zvz_seasons')
    .select(
      'id, albion_server, name, starts_on, starts_at, ends_at, score_formula_version, created_at, updated_at',
    )
    .order('albion_server', { ascending: true })
    .order('starts_at', { ascending: true })
  if (error) throw new Error(`public ZvZ seasons query failed: ${error.message}`)
  return withSeasonBounds((data ?? []) as SeasonRow[])
}

const loadSeasonRowsCached = unstable_cache(
  loadSeasonRowsUncached,
  ['public-zvz-seasons'],
  {
    revalidate: PUBLIC_ZVZ_SEASON_CACHE_SECONDS,
    tags: [PUBLIC_ZVZ_SEASONS_TAG],
  },
)

export async function loadPublicZvzSeasons(options?: {
  fresh?: boolean
}): Promise<PublicZvzSeasonSummary[]> {
  return options?.fresh ? loadSeasonRowsUncached() : loadSeasonRowsCached()
}

function snapshotFromRow(row: SnapshotRow): PublicZvzSeasonSnapshot {
  return {
    seasonId: row.season_id,
    snapshotDate: row.snapshot_date,
    dataThroughAt: row.data_through_at,
    isFinal: row.is_final,
    guildCount: row.guild_count,
    refreshedAt: row.refreshed_at,
  }
}

function selectSeason(
  seasons: PublicZvzSeasonSummary[],
  targetDate: string,
  explicitSeasonId: string | null,
): PublicZvzSeasonSummary | null {
  if (explicitSeasonId) {
    return seasons.find((season) => season.id === explicitSeasonId) ?? null
  }
  return [...seasons]
    .reverse()
    .find((season) => (
      season.startsOn <= targetDate &&
      (!season.endsOn || targetDate < season.endsOn)
    )) ?? null
}

function targetSnapshotDate(
  season: PublicZvzSeasonSummary,
  requestedDate: string,
): string {
  const endDate = season.endsOn ? dayBefore(season.endsOn) : requestedDate
  return minDate(requestedDate, endDate)
}

async function loadSnapshotSelections(input: {
  seasons: PublicZvzSeasonSummary[]
  requestedDate: string
}): Promise<PublicZvzSeasonSelection[]> {
  if (input.seasons.length === 0) return []
  const db = getAdminClient()
  const seasonIds = input.seasons.map((season) => season.id)
  const { data, error } = await db
    .from('zvz_season_snapshots')
    .select(
      'season_id, snapshot_date, data_through_at, is_final, guild_count, refreshed_at',
    )
    .in('season_id', seasonIds)
    .lte('snapshot_date', input.requestedDate)
    .order('snapshot_date', { ascending: false })
    .limit(2000)
  if (error) throw new Error(`public ZvZ season snapshots query failed: ${error.message}`)

  const rows = (data ?? []) as SnapshotRow[]
  return input.seasons.map((season) => {
    const target = targetSnapshotDate(season, input.requestedDate)
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

function rollupPairFilter(
  selections: PublicZvzSeasonSelection[],
): string | null {
  const pairs = selections.flatMap((selection) => {
    const current = selection.snapshot
    if (!current) return []
    const values = [
      `and(season_id.eq.${selection.season.id},snapshot_date.eq.${current.snapshotDate})`,
    ]
    if (selection.previousSnapshot) {
      values.push(
        `and(season_id.eq.${selection.season.id},snapshot_date.eq.${selection.previousSnapshot.snapshotDate})`,
      )
    }
    return values
  })
  return pairs.length > 0 ? pairs.join(',') : null
}

function rollupPairKey(seasonId: string, snapshotDate: string): string {
  return `${seasonId}:${snapshotDate}`
}

export async function loadPublicZvzSeasonRankings(options: {
  server: AlbionServer | null
  division?: PublicZvzDivisionFilter
  seasonId?: string | null
  asOfDate?: string | null
  limit: number
  now?: Date
}): Promise<PublicZvzSeasonRankingResult> {
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const today = todayUtc(now)
  const requestedDate = minDate(
    normalizePublicZvzDate(options.asOfDate) ?? today,
    today,
  )
  const explicitSeasonId = normalizePublicZvzSeasonId(options.seasonId)
  const allSeasons = await loadPublicZvzSeasons()
  const startedSeasons = allSeasons.filter((season) => season.startsAt <= nowIso)
  const relevant = options.server
    ? startedSeasons.filter((season) => season.server === options.server)
    : startedSeasons

  const selectedSeasons = options.server
    ? [selectSeason(relevant, requestedDate, explicitSeasonId)].filter(
        (season): season is PublicZvzSeasonSummary => season !== null,
      )
    : (['west', 'europe', 'east'] as const).flatMap((server) => {
        const selected = selectSeason(
          relevant.filter((season) => season.server === server),
          requestedDate,
          null,
        )
        return selected ? [selected] : []
      })

  const effectiveRequestedDate = explicitSeasonId && selectedSeasons[0]
    ? maxDate(requestedDate, selectedSeasons[0].startsOn)
    : requestedDate

  if (selectedSeasons.length === 0) {
    return {
      configured: relevant.length > 0,
      requestedDate: effectiveRequestedDate,
      selections: [],
      availableSeasons: relevant,
      rankings: [],
    }
  }

  const selections = await loadSnapshotSelections({
    seasons: selectedSeasons,
    requestedDate: effectiveRequestedDate,
  })
  const filter = rollupPairFilter(selections)
  if (!filter) {
    return {
      configured: true,
      requestedDate: effectiveRequestedDate,
      selections,
      availableSeasons: relevant,
      rankings: [],
    }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_season_zvz_rollups')
    .select(
      'season_id, snapshot_date, albion_server, guild_albion_id, guild_name, alliance_albion_id, alliance_name, tenant_slug, tenant_profile_enabled, division, zvz_battles, kills, deaths, kill_fame, avg_force_size, max_force_size, score, rank, sample_status, latest_battle_at, score_formula_version, battle_points, kill_points, kd_bonus_points, kill_fame_points, force_size_points, death_penalty_points',
    )
    .or(filter)
    .limit(10000)
  if (error) throw new Error(`public ZvZ season rankings query failed: ${error.message}`)

  const rows = (data ?? []) as SeasonRollupRow[]
  const rowsByPair = new Map<string, SeasonRollupRow[]>()
  for (const row of rows) {
    const key = rollupPairKey(row.season_id, row.snapshot_date)
    const existing = rowsByPair.get(key)
    if (existing) existing.push(row)
    else rowsByPair.set(key, [row])
  }

  const rankings: PublicSeasonZvzRanking[] = []
  for (const selection of selections) {
    const snapshot = selection.snapshot
    if (!snapshot) continue
    const currentRows = rowsByPair.get(
      rollupPairKey(selection.season.id, snapshot.snapshotDate),
    ) ?? []
    const rankedRows = currentRows.some((row) => row.sample_status === 'ranked')
      ? currentRows.filter((row) => row.sample_status === 'ranked')
      : currentRows
    const previousRows = selection.previousSnapshot
      ? rowsByPair.get(
          rollupPairKey(
            selection.season.id,
            selection.previousSnapshot.snapshotDate,
          ),
        ) ?? []
      : []
    const previousRankedRows = previousRows.some(
      (row) => row.sample_status === 'ranked',
    )
      ? previousRows.filter((row) => row.sample_status === 'ranked')
      : previousRows
    const previousRanks = new Map(
      previousRows.map((row) => [row.guild_albion_id, row.rank]),
    )
    const divisionRanks = buildPublicZvzDivisionRankMap(
      rankedRows.map(divisionRankable),
    )
    const previousDivisionRanks = buildPublicZvzDivisionRankMap(
      previousRankedRows.map(divisionRankable),
    )

    for (const row of rankedRows) {
      if (options.division && row.division !== options.division) continue
      const previousRank = previousRanks.get(row.guild_albion_id)
      const divisionRankKey = publicZvzDivisionRankKey(divisionRankable(row))
      const divisionRank = divisionRanks.get(divisionRankKey) ?? row.rank
      const previousDivisionRank = previousDivisionRanks.get(divisionRankKey)
      rankings.push({
        seasonId: selection.season.id,
        seasonName: selection.season.name,
        seasonStartsOn: selection.season.startsOn,
        seasonEndsOn: selection.season.endsOn,
        snapshotDate: snapshot.snapshotDate,
        snapshotIsFinal: snapshot.isFinal,
        dataThroughAt: snapshot.dataThroughAt,
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
        killFame: numeric(row.kill_fame),
        avgForceSize: numeric(row.avg_force_size),
        maxForceSize: row.max_force_size,
        score: numeric(row.score),
        rank: row.rank,
        rankDelta: previousRank === undefined ? null : previousRank - row.rank,
        divisionRank,
        divisionRankDelta: previousDivisionRank === undefined
          ? null
          : previousDivisionRank - divisionRank,
        sampleStatus: row.sample_status,
        latestBattleAt: row.latest_battle_at,
      })
    }
  }

  rankings.sort((a, b) => (
    options.server
      ? options.division
        ? a.divisionRank - b.divisionRank
        : a.rank - b.rank
      : b.score - a.score || b.killFame - a.killFame || a.guildName.localeCompare(b.guildName)
  ))

  return {
    configured: true,
    requestedDate: effectiveRequestedDate,
    selections,
    availableSeasons: relevant,
    rankings: rankings.slice(0, options.limit),
  }
}

export async function loadPublicZvzSeasonRecordContext(options: {
  server: AlbionServer
  seasonId: string
  asOfDate?: string | null
  now?: Date
}): Promise<PublicZvzSeasonRecordContext | null> {
  const seasonId = normalizePublicZvzSeasonId(options.seasonId)
  if (!seasonId) return null
  const now = options.now ?? new Date()
  const nowIso = now.toISOString()
  const today = todayUtc(now)
  const requestedDate = minDate(
    normalizePublicZvzDate(options.asOfDate) ?? today,
    today,
  )
  const seasons = (await loadPublicZvzSeasons()).filter(
    (season) => (
      season.server === options.server && season.startsAt <= nowIso
    ),
  )
  const season = seasons.find((candidate) => candidate.id === seasonId)
  if (!season) return null
  const effectiveRequestedDate = maxDate(requestedDate, season.startsOn)
  const [selection] = await loadSnapshotSelections({
    seasons: [season],
    requestedDate: effectiveRequestedDate,
  })
  if (!selection?.snapshot) return null
  return {
    season,
    snapshot: selection.snapshot,
    previousSnapshot: selection.previousSnapshot,
    availableSeasons: seasons,
  }
}

export async function loadPublicZvzSeasonAdminOverview(): Promise<Array<
  PublicZvzSeasonSummary & {
    snapshotCount: number
    latestSnapshotDate: string | null
    finalSnapshotCount: number
    latestGuildCount: number
    latestAllianceCount: number
  }
>> {
  const seasons = await loadPublicZvzSeasons({ fresh: true })
  if (seasons.length === 0) return []
  const db = getAdminClient()
  const { data, error } = await db
    .from('public_zvz_v2_season_snapshots')
    .select(
      'season_id, snapshot_date, data_through_at, is_final, guild_count, alliance_count, refreshed_at',
    )
    .in('season_id', seasons.map((season) => season.id))
    .order('snapshot_date', { ascending: false })
    .limit(10000)
  if (error) throw new Error(`v2 season snapshot overview query failed: ${error.message}`)
  const snapshots = (data ?? []) as V2SnapshotOverviewRow[]
  return seasons.map((season) => {
    const own = snapshots.filter((snapshot) => snapshot.season_id === season.id)
    return {
      ...season,
      snapshotCount: own.length,
      latestSnapshotDate: own[0]?.snapshot_date ?? null,
      finalSnapshotCount: own.filter((snapshot) => snapshot.is_final).length,
      latestGuildCount: own[0]?.guild_count ?? 0,
      latestAllianceCount: own[0]?.alliance_count ?? 0,
    }
  })
}

export type PublicZvzSeasonRollupRow = SeasonRollupRow
