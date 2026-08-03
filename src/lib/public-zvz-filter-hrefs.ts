export type PublicZvzFilterServer = 'west' | 'europe' | 'east' | null

export interface PublicZvzBoardHrefInput {
  basePath: string
  server: PublicZvzFilterServer
  minPlayers: number
  defaultMinPlayers: number
  seasonId?: string | null
  asOfDate?: string | null
}

/**
 * Keeps AGM Battles filters shareable while omitting default query values.
 * Season selection is server-specific, so it is intentionally discarded
 * whenever the global server scope is reset to all servers.
 */
export function buildPublicZvzBoardHref(input: PublicZvzBoardHrefInput): string {
  const query = new URLSearchParams()
  if (input.server) query.set('server', input.server)
  if (input.minPlayers !== input.defaultMinPlayers) {
    query.set('min', String(input.minPlayers))
  }
  if (input.server && input.seasonId) query.set('season', input.seasonId)
  if (input.asOfDate) query.set('asOf', input.asOfDate)

  const serialized = query.toString()
  return serialized ? `${input.basePath}?${serialized}` : input.basePath
}
