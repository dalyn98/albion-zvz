import 'server-only'

import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { PUBLIC_ZVZ_DIVISIONS, type PublicZvzDivision } from '@/lib/public-zvz-divisions'
import { normalizePublicZvzEntitySearchQuery } from '@/lib/public-zvz-search-query'
import { getAdminClient } from '@/lib/supabase-admin'

export const PUBLIC_ZVZ_ENTITY_SEARCH_LIMIT = 12

export {
  normalizePublicZvzEntitySearchQuery,
  PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH,
  PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH,
} from '@/lib/public-zvz-search-query'

type PublicZvzEntityKind = 'guild' | 'alliance'
type PublicZvzEntityPeriodKind = 'season' | 'week'

interface PublicZvzEntitySearchRow {
  period_kind: string
  albion_server: string
  season_id: string | null
  snapshot_date: string | null
  week_start: string | null
  entity_kind: string
  albion_id: string
  entity_name: string
  alliance_name: string | null
  division: string | null
  rank: number | null
  battle_count: number
  related_guild_count: number
  latest_battle_at: string | null
  tenant_slug: string | null
  tenant_profile_enabled: boolean
}

export interface PublicZvzEntitySearchResult {
  periodKind: PublicZvzEntityPeriodKind
  server: AlbionServer
  seasonId: string | null
  snapshotDate: string | null
  weekStart: string | null
  entityKind: PublicZvzEntityKind
  albionId: string
  entityName: string
  allianceName: string | null
  division: PublicZvzDivision | null
  rank: number | null
  battleCount: number
  relatedGuildCount: number
  latestBattleAt: string | null
  tenantSlug: string | null
  tenantProfileEnabled: boolean
}

function isEntityKind(value: string): value is PublicZvzEntityKind {
  return value === 'guild' || value === 'alliance'
}

function isPeriodKind(value: string): value is PublicZvzEntityPeriodKind {
  return value === 'season' || value === 'week'
}

function isDivision(value: string | null): value is PublicZvzDivision {
  return value !== null && PUBLIC_ZVZ_DIVISIONS.some((division) => division === value)
}

function toFiniteInteger(value: number | null, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback
}

function fromSearchRow(row: PublicZvzEntitySearchRow): PublicZvzEntitySearchResult | null {
  if (
    !isPeriodKind(row.period_kind) ||
    !isAlbionServer(row.albion_server) ||
    !isEntityKind(row.entity_kind) ||
    !row.albion_id ||
    !row.entity_name
  ) {
    return null
  }

  return {
    periodKind: row.period_kind,
    server: row.albion_server,
    seasonId: row.season_id,
    snapshotDate: row.snapshot_date,
    weekStart: row.week_start,
    entityKind: row.entity_kind,
    albionId: row.albion_id,
    entityName: row.entity_name,
    allianceName: row.alliance_name,
    division: isDivision(row.division) ? row.division : null,
    rank: row.rank === null ? null : toFiniteInteger(row.rank),
    battleCount: Math.max(0, toFiniteInteger(row.battle_count)),
    relatedGuildCount: Math.max(0, toFiniteInteger(row.related_guild_count)),
    latestBattleAt: row.latest_battle_at,
    tenantSlug: row.tenant_slug,
    tenantProfileEnabled: row.tenant_profile_enabled === true,
  }
}

export async function searchPublicZvzEntities(options: {
  query: string
  server: AlbionServer | null
  seasonId?: string | null
  asOfDate?: string | null
  limit?: number
}): Promise<PublicZvzEntitySearchResult[]> {
  const query = normalizePublicZvzEntitySearchQuery(options.query)
  if (!query) return []

  const limit = Math.min(
    24,
    Math.max(1, Math.trunc(options.limit ?? PUBLIC_ZVZ_ENTITY_SEARCH_LIMIT)),
  )
  const db = getAdminClient()
  const { data, error } = await db.rpc('search_public_zvz_entities', {
    p_query: query,
    p_albion_server: options.server,
    p_season_id: options.server ? (options.seasonId ?? null) : null,
    p_as_of_date: options.asOfDate ?? null,
    p_limit: limit,
  })
  if (error) {
    throw new Error(`public ZvZ entity search failed: ${error.message}`)
  }

  return ((data ?? []) as PublicZvzEntitySearchRow[])
    .map(fromSearchRow)
    .filter((row): row is PublicZvzEntitySearchResult => row !== null)
}
