import type {
  PublicBattleGroupAnalysis,
  PublicBattleAnalysisPlayer,
} from '@/lib/public-battle-analysis-model'
import type {
  PublicBattleGroupForceLine,
  PublicBattleGroupReport,
} from '@/lib/public-battle-report-model'

type GroupLevel = 'forces' | 'alliances' | 'guilds'

interface MutableForce {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceName: string
  playerIds: Set<string>
  guildNames: Set<string>
  kills: number
  deaths: number
  killFame: number
  battleIds: Set<number>
}

function groupIdentity(player: PublicBattleAnalysisPlayer, level: GroupLevel) {
  if (level === 'guilds') {
    return {
      forceKey: player.guildKey,
      forceKind: 'guild' as const,
      forceName: player.guildName,
    }
  }
  if (level === 'alliances') {
    return player.allianceId
      ? {
          forceKey: player.allianceKey,
          forceKind: 'alliance' as const,
          forceName: player.allianceName || player.forceName,
        }
      : {
          forceKey: player.guildKey,
          forceKind: 'guild' as const,
          forceName: player.guildName,
        }
  }
  return {
    forceKey: player.forceKey,
    forceKind: player.forceKey.startsWith('a:') ? 'alliance' as const : 'guild' as const,
    forceName: player.forceName,
  }
}

function compareForces(a: PublicBattleGroupForceLine, b: PublicBattleGroupForceLine): number {
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (b.players !== a.players) return b.players - a.players
  if (a.deaths !== b.deaths) return a.deaths - b.deaths
  return a.forceName.localeCompare(b.forceName)
}

function buildGroupRows(
  players: ReadonlyArray<PublicBattleAnalysisPlayer>,
  level: GroupLevel,
  preferredForceKey: string,
): PublicBattleGroupForceLine[] {
  const rows = new Map<string, MutableForce>()
  for (const player of players) {
    const identity = groupIdentity(player, level)
    const current = rows.get(identity.forceKey) ?? {
      ...identity,
      playerIds: new Set<string>(),
      guildNames: new Set<string>(),
      kills: 0,
      deaths: 0,
      killFame: 0,
      battleIds: new Set<number>(),
    }
    current.playerIds.add(player.playerId)
    if (player.guildName) current.guildNames.add(player.guildName)
    current.kills += player.kills
    current.deaths += player.deaths
    current.killFame += player.killFame
    for (const battleId of player.battleIds) current.battleIds.add(battleId)
    rows.set(identity.forceKey, current)
  }
  return Array.from(rows.values())
    .map((row) => ({
      forceKey: row.forceKey,
      forceKind: row.forceKind,
      forceName: row.forceName,
      players: row.playerIds.size,
      kills: row.kills,
      deaths: row.deaths,
      killFame: row.killFame,
      guildNames: Array.from(row.guildNames).sort((a, b) => a.localeCompare(b)),
      battleIds: Array.from(row.battleIds).sort((a, b) => a - b),
      highlighted: row.forceKey === preferredForceKey,
    }))
    .sort(compareForces)
}

export function buildPublicBattleEngagementReport(input: {
  sourceReport: PublicBattleGroupReport
  analysis: PublicBattleGroupAnalysis
  battleId: number
  startedAt: string
  endedAt: string
  preferredForceKey: string
}): PublicBattleGroupReport | null {
  const sourceBattle = input.sourceReport.battles.find(
    (battle) => battle.albionBattleId === input.battleId,
  )
  if (!sourceBattle || input.analysis.events.length === 0 || input.analysis.players.length === 0) {
    return null
  }

  const forces = buildGroupRows(input.analysis.players, 'forces', input.preferredForceKey)
  const alliances = buildGroupRows(input.analysis.players, 'alliances', input.preferredForceKey)
  const guilds = buildGroupRows(input.analysis.players, 'guilds', input.preferredForceKey)
  const primaryForce = forces.find((force) => force.forceKey === input.preferredForceKey) ?? forces[0]
  if (!primaryForce) return null

  const totalFame = input.analysis.events.reduce((sum, event) => sum + event.fame, 0)
  const players = input.analysis.players.map((player) => ({ ...player }))
  const playerSort = (a: PublicBattleAnalysisPlayer, b: PublicBattleAnalysisPlayer) =>
    b.kills - a.kills || b.killFame - a.killFame || a.playerName.localeCompare(b.playerName)

  return {
    ...input.sourceReport,
    requestedBattleIds: [input.battleId],
    unavailableBattleIds: [],
    battles: [{
      ...sourceBattle,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      clusterName: null,
      totalPlayers: players.length,
      totalKills: input.analysis.events.length,
      totalFame,
      topForceName: primaryForce.forceName,
    }],
    forces,
    alliances,
    guilds,
    players: players.sort(playerSort),
    primaryForce,
    primaryForceName: primaryForce.forceName,
    highlightedForceKey: primaryForce.forceKey,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    battleCount: 1,
    clusterNames: [],
    totalPlayersUnique: players.length,
    totalKills: input.analysis.events.length,
    totalDeaths: input.analysis.events.length,
    totalFame,
    topKills: players.filter((player) => player.kills > 0).sort(playerSort).slice(0, 10),
    topDeaths: players
      .filter((player) => player.deaths > 0)
      .sort((a, b) => b.deaths - a.deaths || playerSort(a, b))
      .slice(0, 10),
    recentEvents: input.analysis.events.flatMap((event) => [
      {
        eventId: event.eventId,
        battleId: event.battleId,
        role: 'killer' as const,
        playerName: event.killer.playerName,
        fame: event.fame,
        occurredAt: event.occurredAt,
      },
      {
        eventId: event.eventId,
        battleId: event.battleId,
        role: 'victim' as const,
        playerName: event.victim.playerName,
        fame: 0,
        occurredAt: event.occurredAt,
      },
    ]).slice(0, 80),
  }
}
