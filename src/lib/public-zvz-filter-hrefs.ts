import type { PublicZvzDivisionFilter } from '@/lib/public-zvz-divisions'
import { normalizePublicZvzEntitySearchQuery } from '@/lib/public-zvz-search-query'

export type PublicZvzFilterServer = 'west' | 'europe' | 'east' | null

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
  if (input.entityKind === 'alliance') query.set('entity', 'alliance')
  const searchQuery = normalizePublicZvzEntitySearchQuery(input.query)
  if (searchQuery) query.set('q', searchQuery)

  const serialized = query.toString()
  return serialized ? `${input.basePath}?${serialized}` : input.basePath
}
