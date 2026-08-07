import type {
  PublicBattleForce,
  PublicRecentBattle,
} from '@/lib/public-zvz-battles'

export const PUBLIC_ZVZ_BATTLE_SESSION_GAP_MS = 30 * 60 * 1000

export interface PublicZvzBattleSession {
  id: string
  server: PublicRecentBattle['server']
  startedAt: string
  endedAt: string
  durationMinutes: number
  battleCount: number
  battleIds: number[]
  battleRecordIds: string[]
  primaryBattleId: number
  peakPlayers: number
  totalKills: number
  totalFame: number
  isOfficialZvz: boolean
  activityKind: PublicRecentBattle['activityKind']
  topForces: PublicBattleForce[]
  topGuilds: PublicBattleForce[]
  battles: PublicRecentBattle[]
}

function parsedTime(value: string): number {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function forceKeys(battle: PublicRecentBattle): Set<string> {
  return new Set(battle.topForces.map((force) => force.forceKey))
}

function hasSameFightParticipants(
  previous: PublicRecentBattle,
  next: PublicRecentBattle,
): boolean {
  const previousKeys = forceKeys(previous)
  const nextKeys = forceKeys(next)
  if (previousKeys.size < 2 || nextKeys.size < 2) return false

  let overlap = 0
  for (const key of previousKeys) {
    if (nextKeys.has(key)) overlap += 1
  }
  if (overlap < 2) return false

  return overlap / Math.min(previousKeys.size, nextKeys.size) >= 2 / 3
}

function canJoinSession(
  previous: PublicRecentBattle,
  next: PublicRecentBattle,
  gapMs: number,
): boolean {
  if (previous.server !== next.server) return false
  if (previous.isOfficialZvz !== next.isOfficialZvz) return false
  if (previous.activityKind !== next.activityKind) return false

  const gap = Math.max(0, parsedTime(next.startedAt) - parsedTime(previous.endedAt))
  if (gap > gapMs) return false

  return hasSameFightParticipants(previous, next)
}

function mergeForceRows(forces: ReadonlyArray<PublicBattleForce>): PublicBattleForce[] {
  const merged = new Map<
    string,
    PublicBattleForce & { itemPowerWeight: number; itemPowerTotal: number }
  >()

  for (const force of forces) {
    const current = merged.get(force.forceKey)
    if (!current) {
      merged.set(force.forceKey, {
        ...force,
        guildIds: [...force.guildIds],
        guildNames: [...force.guildNames],
        itemPowerWeight: force.averageItemPower === null ? 0 : force.teamSize,
        itemPowerTotal:
          force.averageItemPower === null ? 0 : force.averageItemPower * force.teamSize,
      })
      continue
    }

    current.teamSize = Math.max(current.teamSize, force.teamSize)
    current.kills += force.kills
    current.deaths += force.deaths
    current.killFame += force.killFame
    current.guildIds = [...new Set([...current.guildIds, ...force.guildIds])]
    current.guildNames = [...new Set([...current.guildNames, ...force.guildNames])]
    current.guildLink ??= force.guildLink
    if (force.averageItemPower !== null) {
      current.itemPowerWeight += force.teamSize
      current.itemPowerTotal += force.averageItemPower * force.teamSize
    }
  }

  return [...merged.values()]
    .map(({ itemPowerWeight, itemPowerTotal, ...force }) => ({
      ...force,
      averageItemPower:
        itemPowerWeight > 0 ? itemPowerTotal / itemPowerWeight : null,
    }))
    .sort(
      (left, right) =>
        right.teamSize - left.teamSize ||
        right.killFame - left.killFame ||
        left.forceName.localeCompare(right.forceName),
    )
}

function toSession(battles: ReadonlyArray<PublicRecentBattle>): PublicZvzBattleSession {
  const sorted = [...battles].sort(
    (left, right) => parsedTime(left.startedAt) - parsedTime(right.startedAt),
  )
  const startedAt = sorted[0].startedAt
  const endedAt = sorted.reduce(
    (latest, battle) =>
      parsedTime(battle.endedAt) > parsedTime(latest) ? battle.endedAt : latest,
    sorted[0].endedAt,
  )
  const primary = [...sorted].sort(
    (left, right) =>
      right.totalPlayers - left.totalPlayers ||
      parsedTime(right.startedAt) - parsedTime(left.startedAt),
  )[0]
  const battleIds = [...new Set(sorted.map((battle) => battle.albionBattleId))]

  return {
    id: `${primary.server}:${battleIds.join('-')}`,
    server: primary.server,
    startedAt,
    endedAt,
    durationMinutes: Math.max(
      1,
      Math.round((parsedTime(endedAt) - parsedTime(startedAt)) / 60_000),
    ),
    battleCount: sorted.length,
    battleIds,
    battleRecordIds: [...new Set(sorted.map((battle) => battle.id))],
    primaryBattleId: primary.albionBattleId,
    peakPlayers: Math.max(...sorted.map((battle) => battle.totalPlayers)),
    totalKills: sorted.reduce((sum, battle) => sum + battle.totalKills, 0),
    totalFame: sorted.reduce((sum, battle) => sum + battle.totalFame, 0),
    isOfficialZvz: sorted.every((battle) => battle.isOfficialZvz),
    activityKind: primary.activityKind,
    topForces: mergeForceRows(sorted.flatMap((battle) => battle.topForces)),
    topGuilds: mergeForceRows(sorted.flatMap((battle) => battle.topGuilds)),
    battles: sorted,
  }
}

export function groupPublicZvzBattleSessions(
  battles: ReadonlyArray<PublicRecentBattle>,
  gapMs = PUBLIC_ZVZ_BATTLE_SESSION_GAP_MS,
): PublicZvzBattleSession[] {
  const sorted = [...battles].sort(
    (left, right) => parsedTime(left.startedAt) - parsedTime(right.startedAt),
  )
  const sessions: PublicRecentBattle[][] = []

  for (const battle of sorted) {
    const matchingSession = [...sessions].reverse().find((candidate) => {
      const previous = candidate.at(-1)
      return previous ? canJoinSession(previous, battle, gapMs) : false
    })
    if (matchingSession) {
      matchingSession.push(battle)
    } else {
      sessions.push([battle])
    }
  }

  return sessions
    .map(toSession)
    .sort((left, right) => parsedTime(right.startedAt) - parsedTime(left.startedAt))
}
