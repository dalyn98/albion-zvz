export const PUBLIC_ZVZ_DIVISIONS = ['small', 'mid', 'large', 'zerg'] as const

export type PublicZvzDivision = (typeof PUBLIC_ZVZ_DIVISIONS)[number]
export type PublicZvzDivisionFilter = PublicZvzDivision | null

interface PublicZvzDivisionRankable {
  server: string
  guildAlbionId: string
  guildName: string
  division: PublicZvzDivision
  score: number
  killFame: number
}

export function normalizePublicZvzDivisionFilter(
  value: unknown,
): PublicZvzDivisionFilter {
  return typeof value === 'string' && PUBLIC_ZVZ_DIVISIONS.includes(
    value as PublicZvzDivision,
  )
    ? value as PublicZvzDivision
    : null
}

export function publicZvzDivisionRankKey(
  row: Pick<PublicZvzDivisionRankable, 'server' | 'division' | 'guildAlbionId'>,
): string {
  return `${row.server}:${row.division}:${row.guildAlbionId}`
}

/**
 * Re-ranks guilds inside each server and average-force division using the
 * same score, kill-fame, and guild-name ordering as the persisted board.
 */
export function buildPublicZvzDivisionRankMap(
  rows: readonly PublicZvzDivisionRankable[],
): Map<string, number> {
  const groups = new Map<string, PublicZvzDivisionRankable[]>()
  for (const row of rows) {
    const key = `${row.server}:${row.division}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }

  const ranks = new Map<string, number>()
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (
      b.score - a.score ||
      b.killFame - a.killFame ||
      a.guildName.localeCompare(b.guildName) ||
      a.guildAlbionId.localeCompare(b.guildAlbionId)
    ))
    let previousTuple: string | null = null
    let denseRank = 0

    sorted.forEach((row) => {
      const tuple = `${row.score}\u0000${row.killFame}\u0000${row.guildName}`
      if (tuple !== previousTuple) {
        denseRank += 1
        previousTuple = tuple
      }
      ranks.set(publicZvzDivisionRankKey(row), denseRank)
    })
  }

  return ranks
}
