import 'server-only'

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { normalizePublicZvzAlbionId } from '@/lib/public-zvz-record-links'
import {
  loadPublicZvzSeasonRecordContext,
  PUBLIC_ZVZ_SEASONS_TAG,
  type PublicZvzSeasonRecordContext,
  type PublicZvzSeasonRollupRow,
} from '@/lib/public-zvz-seasons'
import { getAdminClient } from '@/lib/supabase-admin'

const PUBLIC_ZVZ_RECORD_CACHE_REVALIDATE_SECONDS = 60
const PUBLIC_ZVZ_RECORD_WEEK_LIMIT = 104

interface GuildRollupRow {
  week_start: string
  albion_server: AlbionServer
  guild_albion_id: string
  guild_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  tenant_slug: string | null
  tenant_profile_enabled: boolean
  division: 'small' | 'mid' | 'large' | 'zerg'
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

interface EvidenceRow {
  week_start: string
  albion_server: AlbionServer
  guild_albion_id: string
  battle_record_id: string
  battle_started_at: string
  guild_name: string
  alliance_albion_id: string | null
  alliance_name: string | null
  team_size: number
  kills: number
  deaths: number
  kill_fame: number | string
  qualification_version: string
}

interface BattleRecordRow {
  id: string
  albion_battle_id: number | string
  started_at: string
  ended_at: string
  total_players: number
  total_kills: number
  total_fame: number | string
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
  kill_fame: number | string
}

interface TenantLinkRow {
  tenant_slug: string
  albion_server: AlbionServer
  albion_guild_id: string
  profile_enabled: boolean
}

export interface PublicZvzScoreBreakdown {
  formulaVersion: string
  battlePoints: number
  killPoints: number
  kdBonusPoints: number
  killFamePoints: number
  forceSizePoints: number
  deathPenaltyPoints: number
}

export interface PublicZvzRecordSeasonContext extends PublicZvzSeasonRecordContext {
  rankDelta: number | null
}

export interface PublicZvzOpponentForce {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceName: string
  allianceAlbionId: string | null
  guildAlbionId: string | null
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  hasScoreEvidence: boolean
}

export interface PublicGuildZvzBattleEvidence {
  battleRecordId: string
  albionBattleId: number
  startedAt: string
  endedAt: string
  clusterName: string | null
  totalPlayers: number
  totalKills: number
  totalFame: number
  guildName: string
  allianceAlbionId: string | null
  allianceName: string | null
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  qualificationVersion: string
  opponents: PublicZvzOpponentForce[]
}

export interface PublicGuildZvzRecord {
  server: AlbionServer
  guildAlbionId: string
  guildName: string
  allianceAlbionId: string | null
  allianceName: string | null
  weekStart: string
  availableWeeks: string[]
  tenantSlug: string | null
  tenantProfileEnabled: boolean
  division: 'small' | 'mid' | 'large' | 'zerg'
  zvzBattles: number
  kills: number
  deaths: number
  killFame: number
  avgForceSize: number
  maxForceSize: number
  score: number
  rank: number
  sampleStatus: 'ranked' | 'insufficient_sample'
  latestBattleAt: string | null
  scoreBreakdown: PublicZvzScoreBreakdown
  battles: PublicGuildZvzBattleEvidence[]
  season: PublicZvzRecordSeasonContext | null
}

export interface PublicAllianceParticipatingGuild {
  guildAlbionId: string
  guildName: string
  battles: number
  kills: number
  deaths: number
  killFame: number
  tenantSlug: string | null
  tenantProfileEnabled: boolean
}

export interface PublicAllianceZvzBattleEvidence {
  battleRecordId: string
  albionBattleId: number
  startedAt: string
  endedAt: string
  clusterName: string | null
  totalPlayers: number
  totalKills: number
  totalFame: number
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  guilds: Array<{
    guildAlbionId: string
    guildName: string
    teamSize: number
    kills: number
    deaths: number
    killFame: number
  }>
  opponents: PublicZvzOpponentForce[]
}

export interface PublicAllianceZvzRecord {
  server: AlbionServer
  allianceAlbionId: string
  allianceName: string
  weekStart: string
  availableWeeks: string[]
  battles: number
  kills: number
  deaths: number
  killFame: number
  avgForceSize: number
  participatingGuilds: PublicAllianceParticipatingGuild[]
  battleEvidence: PublicAllianceZvzBattleEvidence[]
  season: PublicZvzRecordSeasonContext | null
}

function numeric(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function forceSort(a: ForceSummaryRow, b: ForceSummaryRow): number {
  if (b.team_size !== a.team_size) return b.team_size - a.team_size
  const fameDifference = numeric(b.kill_fame) - numeric(a.kill_fame)
  return fameDifference !== 0
    ? fameDifference
    : a.force_name.localeCompare(b.force_name)
}

function groupByBattleId<T extends { battle_record_id: string }>(
  rows: ReadonlyArray<T>,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const current = grouped.get(row.battle_record_id)
    if (current) current.push(row)
    else grouped.set(row.battle_record_id, [row])
  }
  return grouped
}

function opponentForces(
  forceRows: ReadonlyArray<ForceSummaryRow>,
  sameSide: (force: ForceSummaryRow) => boolean,
): PublicZvzOpponentForce[] {
  const scoreEligibleGuildForces = forceRows.filter(
    (force) => force.force_level === 'guild' && force.team_size >= 10,
  )
  return forceRows
    .filter((force) => force.force_level === 'alliance' && !sameSide(force))
    .sort(forceSort)
    .slice(0, 4)
    .map((force) => ({
      forceKey: force.force_key,
      forceKind: force.force_kind,
      forceName: force.force_name,
      allianceAlbionId: force.alliance_id,
      guildAlbionId:
        force.force_kind === 'guild' ? force.guild_ids[0] ?? null : null,
      teamSize: force.team_size,
      kills: force.kills,
      deaths: force.deaths,
      killFame: numeric(force.kill_fame),
      hasScoreEvidence: force.alliance_id
        ? scoreEligibleGuildForces.some(
            (guildForce) => guildForce.alliance_id === force.alliance_id,
          )
        : scoreEligibleGuildForces.some(
            (guildForce) => force.guild_ids.includes(guildForce.guild_ids[0] ?? ''),
          ),
    }))
}

async function loadBattleContext(battleIds: string[]): Promise<{
  battlesById: Map<string, BattleRecordRow>
  forcesByBattleId: Map<string, ForceSummaryRow[]>
}> {
  if (battleIds.length === 0) {
    return {
      battlesById: new Map(),
      forcesByBattleId: new Map(),
    }
  }

  const db = getAdminClient()
  const uniqueIds = Array.from(new Set(battleIds))
  const chunks: string[][] = []
  for (let index = 0; index < uniqueIds.length; index += 100) {
    chunks.push(uniqueIds.slice(index, index + 100))
  }
  const results = await Promise.all(chunks.map(async (chunk) => {
    const [battleResult, forceResult] = await Promise.all([
      db
        .from('battle_records')
        .select(
          'id, albion_battle_id, started_at, ended_at, total_players, total_kills, total_fame, cluster_name',
        )
        .in('id', chunk),
      db
        .from('battle_force_summaries')
        .select(
          'battle_record_id, force_level, force_kind, force_key, force_name, alliance_id, alliance_name, guild_ids, guild_names, team_size, kills, deaths, kill_fame',
        )
        .in('battle_record_id', chunk),
    ])
    if (battleResult.error) {
      throw new Error(
        `public ZvZ battle evidence query failed: ${battleResult.error.message}`,
      )
    }
    if (forceResult.error) {
      throw new Error(
        `public ZvZ force evidence query failed: ${forceResult.error.message}`,
      )
    }
    return {
      battles: (battleResult.data ?? []) as BattleRecordRow[],
      forces: (forceResult.data ?? []) as ForceSummaryRow[],
    }
  }))
  const battleRows = results.flatMap((result) => result.battles)
  const forceRows = results.flatMap((result) => result.forces)
  return {
    battlesById: new Map(battleRows.map((row) => [row.id, row])),
    forcesByBattleId: groupByBattleId(forceRows),
  }
}

function toGuildRecord(
  rollup: GuildRollupRow,
  availableWeeks: string[],
  evidenceRows: EvidenceRow[],
  battleContext: Awaited<ReturnType<typeof loadBattleContext>>,
): PublicGuildZvzRecord {
  const battles = evidenceRows
    .map((evidence): PublicGuildZvzBattleEvidence | null => {
      const battle = battleContext.battlesById.get(evidence.battle_record_id)
      if (!battle) return null
      const forces = battleContext.forcesByBattleId.get(evidence.battle_record_id) ?? []
      return {
        battleRecordId: evidence.battle_record_id,
        albionBattleId: numeric(battle.albion_battle_id),
        startedAt: battle.started_at,
        endedAt: battle.ended_at,
        clusterName: battle.cluster_name,
        totalPlayers: battle.total_players,
        totalKills: battle.total_kills,
        totalFame: numeric(battle.total_fame),
        guildName: evidence.guild_name,
        allianceAlbionId: evidence.alliance_albion_id,
        allianceName: evidence.alliance_name,
        teamSize: evidence.team_size,
        kills: evidence.kills,
        deaths: evidence.deaths,
        killFame: numeric(evidence.kill_fame),
        qualificationVersion: evidence.qualification_version,
        opponents: opponentForces(forces, (force) => (
          force.guild_ids.includes(rollup.guild_albion_id) ||
          (
            evidence.alliance_albion_id !== null &&
            force.alliance_id === evidence.alliance_albion_id
          )
        )),
      }
    })
    .filter((battle): battle is PublicGuildZvzBattleEvidence => battle !== null)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  return {
    server: rollup.albion_server,
    guildAlbionId: rollup.guild_albion_id,
    guildName: rollup.guild_name,
    allianceAlbionId: rollup.alliance_albion_id,
    allianceName: rollup.alliance_name,
    weekStart: rollup.week_start,
    availableWeeks,
    tenantSlug: rollup.tenant_slug,
    tenantProfileEnabled: rollup.tenant_profile_enabled,
    division: rollup.division,
    zvzBattles: rollup.zvz_battles,
    kills: rollup.kills,
    deaths: rollup.deaths,
    killFame: numeric(rollup.kill_fame),
    avgForceSize: numeric(rollup.avg_force_size),
    maxForceSize: rollup.max_force_size,
    score: numeric(rollup.score),
    rank: rollup.rank,
    sampleStatus: rollup.sample_status,
    latestBattleAt: rollup.latest_battle_at,
    scoreBreakdown: {
      formulaVersion: rollup.score_formula_version,
      battlePoints: numeric(rollup.battle_points),
      killPoints: numeric(rollup.kill_points),
      kdBonusPoints: numeric(rollup.kd_bonus_points),
      killFamePoints: numeric(rollup.kill_fame_points),
      forceSizePoints: numeric(rollup.force_size_points),
      deathPenaltyPoints: numeric(rollup.death_penalty_points),
    },
    battles,
    season: null,
  }
}

async function loadGuildRecordUncached(
  server: AlbionServer,
  guildAlbionIdInput: string,
  requestedWeekStart: string | null,
): Promise<PublicGuildZvzRecord | null> {
  const guildAlbionId = normalizePublicZvzAlbionId(guildAlbionIdInput)
  if (!guildAlbionId) return null

  const db = getAdminClient()
  const { data: rollupData, error: rollupError } = await db
    .from('guild_weekly_zvz_rollups')
    .select(
      'week_start, albion_server, guild_albion_id, guild_name, alliance_albion_id, alliance_name, tenant_slug, tenant_profile_enabled, division, zvz_battles, kills, deaths, kill_fame, avg_force_size, max_force_size, score, rank, sample_status, latest_battle_at, score_formula_version, battle_points, kill_points, kd_bonus_points, kill_fame_points, force_size_points, death_penalty_points',
    )
    .eq('albion_server', server)
    .eq('guild_albion_id', guildAlbionId)
    .order('week_start', { ascending: false })
    .limit(PUBLIC_ZVZ_RECORD_WEEK_LIMIT)

  if (rollupError) {
    throw new Error(`public guild ZvZ record query failed: ${rollupError.message}`)
  }

  const rollups = (rollupData ?? []) as GuildRollupRow[]
  const selected = requestedWeekStart
    ? rollups.find((row) => row.week_start === requestedWeekStart)
    : rollups[0]
  if (!selected) return null

  const { data: evidenceData, error: evidenceError } = await db
    .from('guild_weekly_zvz_battle_evidence')
    .select(
      'week_start, albion_server, guild_albion_id, battle_record_id, battle_started_at, guild_name, alliance_albion_id, alliance_name, team_size, kills, deaths, kill_fame, qualification_version',
    )
    .eq('week_start', selected.week_start)
    .eq('albion_server', server)
    .eq('guild_albion_id', guildAlbionId)
    .order('battle_started_at', { ascending: false })

  if (evidenceError) {
    throw new Error(`public guild battle evidence query failed: ${evidenceError.message}`)
  }

  const evidenceRows = (evidenceData ?? []) as EvidenceRow[]
  const battleContext = await loadBattleContext(
    evidenceRows.map((row) => row.battle_record_id),
  )
  return toGuildRecord(
    selected,
    rollups.map((row) => row.week_start),
    evidenceRows,
    battleContext,
  )
}

const loadGuildRecordCached = unstable_cache(
  loadGuildRecordUncached,
  ['public-guild-zvz-record'],
  { revalidate: PUBLIC_ZVZ_RECORD_CACHE_REVALIDATE_SECONDS },
)

export const loadPublicGuildZvzRecord = cache(
  async (
    server: AlbionServer,
    guildAlbionId: string,
    requestedWeekStart: string | null,
  ): Promise<PublicGuildZvzRecord | null> => (
    loadGuildRecordCached(server, guildAlbionId, requestedWeekStart)
  ),
)

function tenantLinkKey(server: AlbionServer, guildAlbionId: string): string {
  return `${server}:${guildAlbionId}`
}

async function loadTenantLinksForGuilds(
  server: AlbionServer,
  guildAlbionIds: string[],
): Promise<Map<string, TenantLinkRow>> {
  if (guildAlbionIds.length === 0) return new Map()
  const db = getAdminClient()
  const { data, error } = await db
    .from('public_guild_tenant_links')
    .select('tenant_slug, albion_server, albion_guild_id, profile_enabled')
    .eq('albion_server', server)
    .in('albion_guild_id', Array.from(new Set(guildAlbionIds)))

  if (error) {
    throw new Error(`public alliance guild links query failed: ${error.message}`)
  }

  const links = new Map<string, TenantLinkRow>()
  for (const row of (data ?? []) as TenantLinkRow[]) {
    const key = tenantLinkKey(row.albion_server, row.albion_guild_id)
    const existing = links.get(key)
    if (!existing || (!existing.profile_enabled && row.profile_enabled)) {
      links.set(key, row)
    }
  }
  return links
}

function buildParticipatingGuilds(
  server: AlbionServer,
  evidenceRows: EvidenceRow[],
  tenantLinks: ReadonlyMap<string, TenantLinkRow>,
): PublicAllianceParticipatingGuild[] {
  const guilds = new Map<string, PublicAllianceParticipatingGuild>()
  for (const row of evidenceRows) {
    const current = guilds.get(row.guild_albion_id)
    if (current) {
      current.battles += 1
      current.kills += row.kills
      current.deaths += row.deaths
      current.killFame += numeric(row.kill_fame)
      continue
    }
    const link = tenantLinks.get(tenantLinkKey(server, row.guild_albion_id))
    guilds.set(row.guild_albion_id, {
      guildAlbionId: row.guild_albion_id,
      guildName: row.guild_name,
      battles: 1,
      kills: row.kills,
      deaths: row.deaths,
      killFame: numeric(row.kill_fame),
      tenantSlug: link?.tenant_slug ?? null,
      tenantProfileEnabled: link?.profile_enabled ?? false,
    })
  }
  return Array.from(guilds.values()).sort((a, b) => (
    b.battles - a.battles ||
    b.killFame - a.killFame ||
    a.guildName.localeCompare(b.guildName)
  ))
}

function buildAllianceBattles(
  allianceAlbionId: string,
  evidenceRows: EvidenceRow[],
  battleContext: Awaited<ReturnType<typeof loadBattleContext>>,
): PublicAllianceZvzBattleEvidence[] {
  const evidenceByBattleId = groupByBattleId(evidenceRows)
  const result: PublicAllianceZvzBattleEvidence[] = []

  for (const [battleRecordId, guildEvidence] of evidenceByBattleId) {
    const battle = battleContext.battlesById.get(battleRecordId)
    if (!battle) continue
    const forces = battleContext.forcesByBattleId.get(battleRecordId) ?? []
    const allianceForce = forces.find((force) => (
      force.force_level === 'alliance' &&
      force.alliance_id === allianceAlbionId
    ))
    const fallback = guildEvidence.reduce(
      (total, row) => ({
        teamSize: total.teamSize + row.team_size,
        kills: total.kills + row.kills,
        deaths: total.deaths + row.deaths,
        killFame: total.killFame + numeric(row.kill_fame),
      }),
      { teamSize: 0, kills: 0, deaths: 0, killFame: 0 },
    )

    result.push({
      battleRecordId,
      albionBattleId: numeric(battle.albion_battle_id),
      startedAt: battle.started_at,
      endedAt: battle.ended_at,
      clusterName: battle.cluster_name,
      totalPlayers: battle.total_players,
      totalKills: battle.total_kills,
      totalFame: numeric(battle.total_fame),
      teamSize: allianceForce?.team_size ?? fallback.teamSize,
      kills: allianceForce?.kills ?? fallback.kills,
      deaths: allianceForce?.deaths ?? fallback.deaths,
      killFame: allianceForce ? numeric(allianceForce.kill_fame) : fallback.killFame,
      guilds: guildEvidence
        .map((row) => ({
          guildAlbionId: row.guild_albion_id,
          guildName: row.guild_name,
          teamSize: row.team_size,
          kills: row.kills,
          deaths: row.deaths,
          killFame: numeric(row.kill_fame),
        }))
        .sort((a, b) => b.teamSize - a.teamSize || a.guildName.localeCompare(b.guildName)),
      opponents: opponentForces(
        forces,
        (force) => force.alliance_id === allianceAlbionId,
      ),
    })
  }

  return result.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

async function loadAllianceRecordUncached(
  server: AlbionServer,
  allianceAlbionIdInput: string,
  requestedWeekStart: string | null,
): Promise<PublicAllianceZvzRecord | null> {
  const allianceAlbionId = normalizePublicZvzAlbionId(allianceAlbionIdInput)
  if (!allianceAlbionId) return null

  const db = getAdminClient()
  const { data: historyData, error: historyError } = await db
    .from('guild_weekly_zvz_battle_evidence')
    .select('week_start, alliance_name, battle_started_at')
    .eq('albion_server', server)
    .eq('alliance_albion_id', allianceAlbionId)
    .order('battle_started_at', { ascending: false })
    .limit(2000)

  if (historyError) {
    throw new Error(`public alliance ZvZ history query failed: ${historyError.message}`)
  }

  const historyRows = (historyData ?? []) as Array<{
    week_start: string
    alliance_name: string | null
    battle_started_at: string
  }>
  const availableWeeks = Array.from(
    new Set(historyRows.map((row) => row.week_start)),
  )
  const weekStart = requestedWeekStart ?? availableWeeks[0]
  if (!weekStart || !availableWeeks.includes(weekStart)) return null

  const { data: evidenceData, error: evidenceError } = await db
    .from('guild_weekly_zvz_battle_evidence')
    .select(
      'week_start, albion_server, guild_albion_id, battle_record_id, battle_started_at, guild_name, alliance_albion_id, alliance_name, team_size, kills, deaths, kill_fame, qualification_version',
    )
    .eq('week_start', weekStart)
    .eq('albion_server', server)
    .eq('alliance_albion_id', allianceAlbionId)
    .order('battle_started_at', { ascending: false })

  if (evidenceError) {
    throw new Error(`public alliance battle evidence query failed: ${evidenceError.message}`)
  }

  const evidenceRows = (evidenceData ?? []) as EvidenceRow[]
  if (evidenceRows.length === 0) return null
  const battleIds = Array.from(
    new Set(evidenceRows.map((row) => row.battle_record_id)),
  )
  const [battleContext, tenantLinks] = await Promise.all([
    loadBattleContext(battleIds),
    loadTenantLinksForGuilds(
      server,
      evidenceRows.map((row) => row.guild_albion_id),
    ),
  ])
  const battleEvidence = buildAllianceBattles(
    allianceAlbionId,
    evidenceRows,
    battleContext,
  )
  const latestName = evidenceRows.find((row) => row.alliance_name)?.alliance_name
  const kills = battleEvidence.reduce((sum, battle) => sum + battle.kills, 0)
  const deaths = battleEvidence.reduce((sum, battle) => sum + battle.deaths, 0)
  const killFame = battleEvidence.reduce((sum, battle) => sum + battle.killFame, 0)
  const avgForceSize = battleEvidence.length > 0
    ? battleEvidence.reduce((sum, battle) => sum + battle.teamSize, 0) /
      battleEvidence.length
    : 0

  return {
    server,
    allianceAlbionId,
    allianceName: latestName ?? allianceAlbionId,
    weekStart,
    availableWeeks,
    battles: battleEvidence.length,
    kills,
    deaths,
    killFame,
    avgForceSize,
    participatingGuilds: buildParticipatingGuilds(
      server,
      evidenceRows,
      tenantLinks,
    ),
    battleEvidence,
    season: null,
  }
}

const loadAllianceRecordCached = unstable_cache(
  loadAllianceRecordUncached,
  ['public-alliance-zvz-record'],
  { revalidate: PUBLIC_ZVZ_RECORD_CACHE_REVALIDATE_SECONDS },
)

export const loadPublicAllianceZvzRecord = cache(
  async (
    server: AlbionServer,
    allianceAlbionId: string,
    requestedWeekStart: string | null,
  ): Promise<PublicAllianceZvzRecord | null> => (
    loadAllianceRecordCached(server, allianceAlbionId, requestedWeekStart)
  ),
)

function seasonRollupAsWeeklyRow(
  row: PublicZvzSeasonRollupRow,
  context: PublicZvzSeasonRecordContext,
): GuildRollupRow {
  return {
    week_start: context.season.startsOn,
    albion_server: row.albion_server,
    guild_albion_id: row.guild_albion_id,
    guild_name: row.guild_name,
    alliance_albion_id: row.alliance_albion_id,
    alliance_name: row.alliance_name,
    tenant_slug: row.tenant_slug,
    tenant_profile_enabled: row.tenant_profile_enabled,
    division: row.division,
    zvz_battles: row.zvz_battles,
    kills: row.kills,
    deaths: row.deaths,
    kill_fame: row.kill_fame,
    avg_force_size: row.avg_force_size,
    max_force_size: row.max_force_size,
    score: row.score,
    rank: row.rank,
    sample_status: row.sample_status,
    latest_battle_at: row.latest_battle_at,
    score_formula_version: row.score_formula_version,
    battle_points: row.battle_points,
    kill_points: row.kill_points,
    kd_bonus_points: row.kd_bonus_points,
    kill_fame_points: row.kill_fame_points,
    force_size_points: row.force_size_points,
    death_penalty_points: row.death_penalty_points,
  }
}

async function loadGuildSeasonRecordUncached(
  server: AlbionServer,
  guildAlbionIdInput: string,
  seasonId: string,
  requestedAsOfDate: string | null,
): Promise<PublicGuildZvzRecord | null> {
  const guildAlbionId = normalizePublicZvzAlbionId(guildAlbionIdInput)
  if (!guildAlbionId) return null
  const context = await loadPublicZvzSeasonRecordContext({
    server,
    seasonId,
    asOfDate: requestedAsOfDate,
  })
  if (!context) return null

  const db = getAdminClient()
  const previousDate = context.previousSnapshot?.snapshotDate ?? null
  const [rollupResult, previousResult, evidenceResult] = await Promise.all([
    db
      .from('guild_season_zvz_rollups')
      .select(
        'season_id, snapshot_date, albion_server, guild_albion_id, guild_name, alliance_albion_id, alliance_name, tenant_slug, tenant_profile_enabled, division, zvz_battles, kills, deaths, kill_fame, avg_force_size, max_force_size, score, rank, sample_status, latest_battle_at, score_formula_version, battle_points, kill_points, kd_bonus_points, kill_fame_points, force_size_points, death_penalty_points',
      )
      .eq('season_id', context.season.id)
      .eq('snapshot_date', context.snapshot.snapshotDate)
      .eq('guild_albion_id', guildAlbionId)
      .maybeSingle(),
    previousDate
      ? db
          .from('guild_season_zvz_rollups')
          .select('rank')
          .eq('season_id', context.season.id)
          .eq('snapshot_date', previousDate)
          .eq('guild_albion_id', guildAlbionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from('guild_season_zvz_battle_evidence')
      .select(
        'week_start, albion_server, guild_albion_id, battle_record_id, battle_started_at, guild_name, alliance_albion_id, alliance_name, team_size, kills, deaths, kill_fame, qualification_version',
      )
      .eq('season_id', context.season.id)
      .eq('guild_albion_id', guildAlbionId)
      .lte('evidence_date', context.snapshot.snapshotDate)
      .order('battle_started_at', { ascending: false })
      .limit(5000),
  ])

  if (rollupResult.error) {
    throw new Error(`public guild season rollup query failed: ${rollupResult.error.message}`)
  }
  if (previousResult.error) {
    throw new Error(`public guild previous season rank query failed: ${previousResult.error.message}`)
  }
  if (evidenceResult.error) {
    throw new Error(`public guild season evidence query failed: ${evidenceResult.error.message}`)
  }
  if (!rollupResult.data) return null

  const evidenceRows = (evidenceResult.data ?? []) as EvidenceRow[]
  const battleContext = await loadBattleContext(
    evidenceRows.map((row) => row.battle_record_id),
  )
  const rollup = rollupResult.data as PublicZvzSeasonRollupRow
  const record = toGuildRecord(
    seasonRollupAsWeeklyRow(rollup, context),
    [],
    evidenceRows,
    battleContext,
  )
  const previousRank = (previousResult.data as { rank?: number } | null)?.rank
  return {
    ...record,
    season: {
      ...context,
      rankDelta: previousRank === undefined ? null : previousRank - rollup.rank,
    },
  }
}

const loadGuildSeasonRecordCached = unstable_cache(
  loadGuildSeasonRecordUncached,
  ['public-guild-zvz-season-record'],
  {
    revalidate: PUBLIC_ZVZ_RECORD_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_ZVZ_SEASONS_TAG],
  },
)

export const loadPublicGuildZvzSeasonRecord = cache(
  async (
    server: AlbionServer,
    guildAlbionId: string,
    seasonId: string,
    requestedAsOfDate: string | null,
  ): Promise<PublicGuildZvzRecord | null> => (
    loadGuildSeasonRecordCached(
      server,
      guildAlbionId,
      seasonId,
      requestedAsOfDate,
    )
  ),
)

async function loadAllianceSeasonRecordUncached(
  server: AlbionServer,
  allianceAlbionIdInput: string,
  seasonId: string,
  requestedAsOfDate: string | null,
): Promise<PublicAllianceZvzRecord | null> {
  const allianceAlbionId = normalizePublicZvzAlbionId(allianceAlbionIdInput)
  if (!allianceAlbionId) return null
  const context = await loadPublicZvzSeasonRecordContext({
    server,
    seasonId,
    asOfDate: requestedAsOfDate,
  })
  if (!context) return null

  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_season_zvz_battle_evidence')
    .select(
      'week_start, albion_server, guild_albion_id, battle_record_id, battle_started_at, guild_name, alliance_albion_id, alliance_name, team_size, kills, deaths, kill_fame, qualification_version',
    )
    .eq('season_id', context.season.id)
    .eq('alliance_albion_id', allianceAlbionId)
    .lte('evidence_date', context.snapshot.snapshotDate)
    .order('battle_started_at', { ascending: false })
    .limit(5000)
  if (error) {
    throw new Error(`public alliance season evidence query failed: ${error.message}`)
  }

  const evidenceRows = (data ?? []) as EvidenceRow[]
  if (evidenceRows.length === 0) return null
  const battleIds = Array.from(
    new Set(evidenceRows.map((row) => row.battle_record_id)),
  )
  const [battleContext, tenantLinks] = await Promise.all([
    loadBattleContext(battleIds),
    loadTenantLinksForGuilds(
      server,
      evidenceRows.map((row) => row.guild_albion_id),
    ),
  ])
  const battleEvidence = buildAllianceBattles(
    allianceAlbionId,
    evidenceRows,
    battleContext,
  )
  const latestName = evidenceRows.find((row) => row.alliance_name)?.alliance_name
  const kills = battleEvidence.reduce((sum, battle) => sum + battle.kills, 0)
  const deaths = battleEvidence.reduce((sum, battle) => sum + battle.deaths, 0)
  const killFame = battleEvidence.reduce((sum, battle) => sum + battle.killFame, 0)
  const avgForceSize = battleEvidence.length > 0
    ? battleEvidence.reduce((sum, battle) => sum + battle.teamSize, 0) /
      battleEvidence.length
    : 0

  return {
    server,
    allianceAlbionId,
    allianceName: latestName ?? allianceAlbionId,
    weekStart: context.season.startsOn,
    availableWeeks: [],
    battles: battleEvidence.length,
    kills,
    deaths,
    killFame,
    avgForceSize,
    participatingGuilds: buildParticipatingGuilds(
      server,
      evidenceRows,
      tenantLinks,
    ),
    battleEvidence,
    season: {
      ...context,
      rankDelta: null,
    },
  }
}

const loadAllianceSeasonRecordCached = unstable_cache(
  loadAllianceSeasonRecordUncached,
  ['public-alliance-zvz-season-record'],
  {
    revalidate: PUBLIC_ZVZ_RECORD_CACHE_REVALIDATE_SECONDS,
    tags: [PUBLIC_ZVZ_SEASONS_TAG],
  },
)

export const loadPublicAllianceZvzSeasonRecord = cache(
  async (
    server: AlbionServer,
    allianceAlbionId: string,
    seasonId: string,
    requestedAsOfDate: string | null,
  ): Promise<PublicAllianceZvzRecord | null> => (
    loadAllianceSeasonRecordCached(
      server,
      allianceAlbionId,
      seasonId,
      requestedAsOfDate,
    )
  ),
)
