export const KILLBOT_FEED_MODES = ['event', 'battle', 'both'] as const

export type KillbotFeedMode = (typeof KILLBOT_FEED_MODES)[number]

export interface KillbotBattleEventInput {
  eventId: number | string
  role: 'killer' | 'victim'
  playerName: string
  fame: number
  occurredAt: string | null
}

export interface KillbotBattleSummaryInput {
  battleDetailUrl: string
  battleEventUrl: (eventId: string) => string
  albionBattleId: number
  albionBattleIds?: number[]
  clusterName: string | null
  startedAt: string
  homeGuildName: string
  opponentName: string
  homeTeamSize: number
  opponentTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  resultLabel: string
  minFame: number
  juicyFameThreshold: number
  events: KillbotBattleEventInput[]
}

export interface KillbotBattlePlayerLine {
  playerName: string
  kills: number
  deaths: number
  killFame: number
  deathFame: number
  url: string
}

export interface KillbotBattleJuicyLine {
  playerName: string
  fame: number
  url: string
}

export interface KillbotBattleSummary {
  title: string
  detailUrl: string
  description: string
  startedAt: string
  homeKills: number
  homeDeaths: number
  topKills: KillbotBattlePlayerLine[]
  topDeaths: KillbotBattlePlayerLine[]
  juicyKills: KillbotBattleJuicyLine[]
}

interface MutablePlayerLine {
  playerName: string
  kills: number
  deaths: number
  killFame: number
  deathFame: number
  killUrl: string | null
  deathUrl: string | null
  bestKillFame: number
  worstDeathFame: number
}

const SUMMARY_LINE_LIMIT = 3

export function normalizeKillbotFeedMode(value: unknown): KillbotFeedMode {
  return KILLBOT_FEED_MODES.includes(value as KillbotFeedMode)
    ? (value as KillbotFeedMode)
    : 'battle'
}

export function formatKillbotCompactFame(value: number): string {
  const n = Math.max(0, Math.floor(value))
  if (n >= 1_000_000_000) {
    const scaled = n / 1_000_000_000
    return `${trimFixed(scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2))}B`
  }
  if (n >= 1_000_000) {
    const scaled = n / 1_000_000
    return `${trimFixed(scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2))}M`
  }
  if (n >= 1_000) {
    const scaled = n / 1_000
    return `${trimFixed(scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1))}k`
  }
  return String(n)
}

function trimFixed(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

function nonNegativeInteger(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

function playerSortName(value: string): string {
  return value.toLocaleLowerCase('en-US')
}

function sortTopKills(a: KillbotBattlePlayerLine, b: KillbotBattlePlayerLine): number {
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (a.deaths !== b.deaths) return a.deaths - b.deaths
  return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
}

function sortTopDeaths(a: KillbotBattlePlayerLine, b: KillbotBattlePlayerLine): number {
  if (b.deaths !== a.deaths) return b.deaths - a.deaths
  if (b.deathFame !== a.deathFame) return b.deathFame - a.deathFame
  if (b.kills !== a.kills) return b.kills - a.kills
  return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
}

function sortedUniqueBattleIds(input: KillbotBattleSummaryInput): number[] {
  const ids = input.albionBattleIds?.length
    ? input.albionBattleIds
    : [input.albionBattleId]
  return Array.from(
    new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ).sort((a, b) => a - b)
}

function battleDescription(input: KillbotBattleSummaryInput): string {
  const battleIds = sortedUniqueBattleIds(input)
  const battleLabel =
    battleIds.length > 1
      ? `Albion battles ${battleIds.join(', ')}`
      : `Battle ${input.albionBattleId}`
  const topLine = [
    battleLabel,
    input.clusterName?.trim() || null,
    input.resultLabel.trim() || null,
  ]
    .filter((part): part is string => !!part)
    .join(' · ')
  const scaleLine = `${nonNegativeInteger(input.homeTeamSize)}v${nonNegativeInteger(input.opponentTeamSize)} · Fame ${formatKillbotCompactFame(input.homeKillFame)}`
  return `${topLine}\n${scaleLine}`
}

export function buildKillbotBattleSummary(
  input: KillbotBattleSummaryInput,
): KillbotBattleSummary {
  const players = new Map<string, MutablePlayerLine>()
  const minFame = nonNegativeInteger(input.minFame)

  for (const rawEvent of input.events) {
    const fame = nonNegativeInteger(rawEvent.fame)
    if (fame < minFame) continue
    const playerName = rawEvent.playerName.trim()
    if (!playerName) continue
    const eventId = String(rawEvent.eventId).trim()
    if (!eventId) continue
    const key = playerSortName(playerName)
    const existing = players.get(key)
    const line: MutablePlayerLine = existing ?? {
      playerName,
      kills: 0,
      deaths: 0,
      killFame: 0,
      deathFame: 0,
      killUrl: null,
      deathUrl: null,
      bestKillFame: -1,
      worstDeathFame: -1,
    }
    const url = input.battleEventUrl(eventId)
    const nextLine =
      rawEvent.role === 'killer'
        ? {
            ...line,
            kills: line.kills + 1,
            killFame: line.killFame + fame,
            killUrl: fame > line.bestKillFame ? url : line.killUrl,
            bestKillFame: Math.max(line.bestKillFame, fame),
          }
        : {
            ...line,
            deaths: line.deaths + 1,
            deathFame: line.deathFame + fame,
            deathUrl: fame > line.worstDeathFame ? url : line.deathUrl,
            worstDeathFame: Math.max(line.worstDeathFame, fame),
          }
    players.set(key, nextLine)
  }

  const lines = Array.from(players.values()).map<KillbotBattlePlayerLine>((line) => ({
    playerName: line.playerName,
    kills: line.kills,
    deaths: line.deaths,
    killFame: line.killFame,
    deathFame: line.deathFame,
    url: line.killUrl ?? line.deathUrl ?? input.battleDetailUrl,
  }))
  const juicyThreshold = nonNegativeInteger(input.juicyFameThreshold)
  const juicyKills = input.events
    .filter((event) => event.role === 'killer')
    .map((event) => ({
      playerName: event.playerName.trim(),
      fame: nonNegativeInteger(event.fame),
      eventId: String(event.eventId).trim(),
    }))
    .filter((event) => event.playerName && event.eventId && juicyThreshold > 0 && event.fame >= juicyThreshold)
    .sort((a, b) => {
      if (b.fame !== a.fame) return b.fame - a.fame
      return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
    })
    .slice(0, SUMMARY_LINE_LIMIT)
    .map<KillbotBattleJuicyLine>((event) => ({
      playerName: event.playerName,
      fame: event.fame,
      url: input.battleEventUrl(event.eventId),
    }))

  return {
    title: `${input.homeGuildName} ${nonNegativeInteger(input.homeKills)}K / ${nonNegativeInteger(input.homeDeaths)}D vs ${input.opponentName}`,
    detailUrl: input.battleDetailUrl,
    description: battleDescription(input),
    startedAt: input.startedAt,
    homeKills: nonNegativeInteger(input.homeKills),
    homeDeaths: nonNegativeInteger(input.homeDeaths),
    topKills: lines
      .filter((line) => line.kills > 0)
      .sort(sortTopKills)
      .slice(0, SUMMARY_LINE_LIMIT),
    topDeaths: lines
      .filter((line) => line.deaths > 0)
      .map((line) => ({
        ...line,
        url: players.get(playerSortName(line.playerName))?.deathUrl ?? line.url,
      }))
      .sort(sortTopDeaths)
      .slice(0, SUMMARY_LINE_LIMIT),
    juicyKills,
  }
}
