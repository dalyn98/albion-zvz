import type { PublicZvzDivisionFilter } from '@/lib/public-zvz-divisions'
import { normalizePublicZvzEntitySearchQuery } from '@/lib/public-zvz-search-query'

export type PublicZvzFilterServer = 'west' | 'europe' | 'east' | null

export const PUBLIC_ZVZ_RANKING_PAGE_SIZE = 20
export const PUBLIC_ZVZ_RANKING_MAX_RESULTS = 100

export function normalizePublicZvzRankingPage(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) return 1
  return Math.min(
    PUBLIC_ZVZ_RANKING_MAX_RESULTS / PUBLIC_ZVZ_RANKING_PAGE_SIZE,
    Math.max(1, parsed),
  )
}

export interface PublicZvzBoardHrefInput {
  basePath: string
  server: PublicZvzFilterServer
  division?: PublicZvzDivisionFilter
  minPlayers: number
  defaultMinPlayers: number
  seasonId?: string | null
  asOfDate?: string | null
  query?: string | null
  entityKind?: 'guild' | 'alliance'
  rankingPage?: number
}

/**
 * Keeps AGM Battles filters shareable while omitting default query values.
 * Season selection is server-specific, so it is intentionally discarded
 * whenever the global server scope is reset to all servers.
 */
export function buildPublicZvzBoardHref(input: PublicZvzBoardHrefInput): string {
  const query = new URLSearchParams()
  if (input.server) query.set('server', input.server)
  if (input.division) query.set('division', input.division)
  if (input.minPlayers !== input.defaultMinPlayers) {
    query.set('min', String(input.minPlayers))
  }
  if (input.server && input.seasonId) query.set('season', input.seasonId)
  if (input.asOfDate) query.set('asOf', input.asOfDate)
  // Alliance is the board default, so only an explicit guild selection is serialized.
  if (input.entityKind === 'guild') query.set('entity', 'guild')
  const rankingPage = normalizePublicZvzRankingPage(String(input.rankingPage ?? ''))
  if (rankingPage > 1) query.set('rankPage', String(rankingPage))
  const searchQuery = normalizePublicZvzEntitySearchQuery(input.query)
  if (searchQuery) query.set('q', searchQuery)

  const serialized = query.toString()
  return serialized ? `${input.basePath}?${serialized}` : input.basePath
}
