import type { PublicBattleAnalysisActor, PublicBattleAnalysisEvent } from '@/lib/public-battle-analysis-model'
import type { PublicBattleGroupForceLine, PublicBattleGroupReport } from '@/lib/public-battle-report-model'

export interface PublicBattleDirectOpponent {
  forceKey: string
  forceName: string
  guildNames: string[]
  players: number
  homeKills: number
  homeDeaths: number
  interactions: number
}

export interface PublicBattleMatchupSummary {
  battleId: number | null
  home: {
    forceKey: string
    forceName: string
    guildNames: string[]
    players: number
  }
  opponents: PublicBattleDirectOpponent[]
  homeKills: number
  homeDeaths: number
  directEventCount: number
  otherParticipantForces: number
}

export type PublicBattleMatchupGroupLevel = 'forces' | 'alliances' | 'guilds'

export interface PublicBattleMatchupHomeGroup {
  level: PublicBattleMatchupGroupLevel
  key: string
}

interface MutableOpponent {
  forceKey: string
  forceName: string
  homeKills: number
  homeDeaths: number
}

function compareGameNames(a: string, b: string): number {
  const normalizedA = a.toLocaleLowerCase('en-US')
  const normalizedB = b.toLocaleLowerCase('en-US')
  if (normalizedA === normalizedB) return 0
  return normalizedA < normalizedB ? -1 : 1
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  const normalizedValue = value.trim()
  if (!key || !normalizedValue) return
  const values = map.get(key) ?? new Set<string>()
  values.add(normalizedValue)
  map.set(key, values)
}

function groupRows(
  report: PublicBattleGroupReport,
  level: PublicBattleMatchupGroupLevel,
): PublicBattleGroupForceLine[] {
  if (level === 'alliances') return report.alliances
  if (level === 'guilds') return report.guilds
  return report.forces
}

function actorGroupKey(actor: PublicBattleAnalysisActor, level: PublicBattleMatchupGroupLevel): string {
  if (level === 'alliances') return actor.allianceKey
  if (level === 'guilds') return actor.guildKey
  return actor.forceKey
}

function actorGroupName(actor: PublicBattleAnalysisActor, level: PublicBattleMatchupGroupLevel): string {
  if (level === 'alliances') return actor.allianceName || actor.guildName
  if (level === 'guilds') return actor.guildName
  return actor.forceName
}

function playerStatGroupKey(
  stat: PublicBattleGroupReport['players'][number]['battleStats'][number],
  level: PublicBattleMatchupGroupLevel,
): string {
  if (level === 'alliances') return stat.allianceKey
  if (level === 'guilds') return stat.guildKey
  return stat.forceKey
}

function actorInScope(
  actor: PublicBattleAnalysisActor,
  level: PublicBattleMatchupGroupLevel,
  playerIdsByForce: Map<string, Set<string>>,
  guildNamesByForce: Map<string, Set<string>>,
  forceNames: Map<string, string>,
): void {
  const key = actorGroupKey(actor, level)
  const name = actorGroupName(actor, level).trim()
  addToSetMap(playerIdsByForce, key, actor.playerId)
  addToSetMap(guildNamesByForce, key, actor.guildName)
  if (key && name) forceNames.set(key, name)
}

/**
 * Builds the viewer-facing matchup from direct kill/death edges involving the
 * highlighted home force. A one-sided kill is still a direct engagement; kills
 * between two third parties never make either side a home opponent.
 */
export function buildPublicBattleMatchupSummary(input: {
  report: PublicBattleGroupReport
  events: ReadonlyArray<PublicBattleAnalysisEvent>
  battleId?: number | null
  homeGroup?: PublicBattleMatchupHomeGroup | null
}): PublicBattleMatchupSummary {
  const battleId = input.battleId ?? null
  const level = input.homeGroup?.level ?? 'forces'
  const rows = groupRows(input.report, level)
  const requestedHomeRow = input.homeGroup
    ? rows.find((row) => row.forceKey === input.homeGroup?.key)
    : null
  const homeRow = requestedHomeRow ?? rows.find((row) => row.forceKey === input.report.primaryForce.forceKey) ?? input.report.primaryForce
  const homeForceKey = homeRow.forceKey
  const rowsByForce = new Map(rows.map((force) => [force.forceKey, force]))
  const playerIdsByForce = new Map<string, Set<string>>()
  const guildNamesByForce = new Map<string, Set<string>>()
  const forceNames = new Map(rows.map((force) => [force.forceKey, force.forceName]))

  for (const player of input.report.players) {
    const scopedForceKeys = new Set(
      player.battleStats
        .filter((stat) => battleId === null || stat.battleId === battleId)
        .map((stat) => playerStatGroupKey(stat, level)),
    )
    for (const forceKey of scopedForceKeys) {
      addToSetMap(playerIdsByForce, forceKey, player.playerId)
      addToSetMap(guildNamesByForce, forceKey, player.guildName)
      if (player.forceName.trim()) forceNames.set(forceKey, player.forceName.trim())
    }
  }

  const opponents = new Map<string, MutableOpponent>()
  let homeKills = 0
  let homeDeaths = 0
  let directEventCount = 0

  for (const event of input.events) {
    if (battleId !== null && event.battleId !== battleId) continue
    actorInScope(event.killer, level, playerIdsByForce, guildNamesByForce, forceNames)
    actorInScope(event.victim, level, playerIdsByForce, guildNamesByForce, forceNames)

    const killerGroupKey = actorGroupKey(event.killer, level)
    const victimGroupKey = actorGroupKey(event.victim, level)
    const killerIsHome = killerGroupKey === homeForceKey
    const victimIsHome = victimGroupKey === homeForceKey
    if (killerIsHome === victimIsHome) continue

    const opponentActor = killerIsHome ? event.victim : event.killer
    const opponentKey = actorGroupKey(opponentActor, level)
    const opponentName = actorGroupName(opponentActor, level)
    const current = opponents.get(opponentKey) ?? {
      forceKey: opponentKey,
      forceName: opponentName,
      homeKills: 0,
      homeDeaths: 0,
    }
    if (killerIsHome) {
      current.homeKills += 1
      homeKills += 1
    } else {
      current.homeDeaths += 1
      homeDeaths += 1
    }
    current.forceName = opponentName || current.forceName
    opponents.set(opponentKey, current)
    directEventCount += 1
  }

  const directOpponentKeys = new Set(opponents.keys())
  const opponentRows = Array.from(opponents.values())
    .map<PublicBattleDirectOpponent>((opponent) => {
      const row = rowsByForce.get(opponent.forceKey)
      const scopedGuildNames = Array.from(guildNamesByForce.get(opponent.forceKey) ?? [])
      return {
        forceKey: opponent.forceKey,
        forceName: forceNames.get(opponent.forceKey) ?? opponent.forceName,
        guildNames: scopedGuildNames.length > 0 ? scopedGuildNames : (row?.guildNames ?? []),
        players: playerIdsByForce.get(opponent.forceKey)?.size ?? 0,
        homeKills: opponent.homeKills,
        homeDeaths: opponent.homeDeaths,
        interactions: opponent.homeKills + opponent.homeDeaths,
      }
    })
    .sort((a, b) =>
      b.interactions - a.interactions ||
      b.homeDeaths - a.homeDeaths ||
      b.homeKills - a.homeKills ||
      b.players - a.players ||
      compareGameNames(a.forceName, b.forceName),
    )

  const scopedHomeGuildNames = Array.from(guildNamesByForce.get(homeForceKey) ?? [])
  const otherParticipantForces = Array.from(playerIdsByForce.keys()).filter(
    (forceKey) => forceKey !== homeForceKey && !directOpponentKeys.has(forceKey),
  ).length

  return {
    battleId,
    home: {
      forceKey: homeForceKey,
      forceName: homeRow.forceName,
      guildNames: scopedHomeGuildNames.length > 0 ? scopedHomeGuildNames : homeRow.guildNames,
      players: playerIdsByForce.get(homeForceKey)?.size ?? 0,
    },
    opponents: opponentRows,
    homeKills,
    homeDeaths,
    directEventCount,
    otherParticipantForces,
  }
}
