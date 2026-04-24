// Albion 공개 전투 API 클라이언트 + 사이드/규모/승패 계산 헬퍼.
//
// Albion gameinfo 서버는 /battles 엔드포인트로 최근 전투 리스트를 반환하지만
// "어느 길드가 어느 편"인지는 명시하지 않는다. 각 길드/얼라이언스의 kills·deaths·
// killFame 합계만 제공하므로 "편" 은 alliance 단위로 근사한다:
//
//   홈 측 = 홈 길드 + (홈 길드의 얼라이언스에 속한 모든 길드)
//   상대 측 = 그 외 모든 길드
//
// 얼라이언스가 비어있는(= 길드 단독) 홈 길드라면 홈 측은 홈 길드 단독, 상대 측은
// 나머지 전부. 실제 ZvZ 에서는 대부분 얼라이언스 단위로 싸우므로 이 근사는
// 일반적으로 맞지만, 3자 난전(얼라이언스 없는 여러 길드 개별 교전)에서는
// 상대 측이 과대 집계될 수 있다는 한계가 있다.
//
// 승/패: 각 측 killFame 합산 비교. 같으면 tie.

import type { AlbionServer } from '@/lib/albion-gameinfo'

// /battles 는 gameinfo 서버와 다른 base 도메인을 쓴다(같은 호스트, /api/gameinfo
// prefix 동일). 온보딩용 gameinfo 클라이언트와 분리해 base 를 이 파일에서 별도
// 관리 — 추후 전투 API 만 다른 CDN/리소스로 옮겨가는 경우에도 영향 최소.
const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

export interface AlbionBattlePlayer {
  name: string
  kills: number
  deaths: number
  killFame: number
  guildName: string
  guildId: string
  allianceName: string | null
  allianceId: string | null
  id: string
}

export interface AlbionBattleGuild {
  name: string
  kills: number
  deaths: number
  killFame: number
  alliance: string
  allianceId: string
  id: string
}

export interface AlbionBattleAlliance {
  name: string
  kills: number
  deaths: number
  killFame: number
  id: string
}

export interface AlbionBattle {
  id: number
  startTime: string
  endTime: string
  totalFame: number
  totalKills: number
  clusterName: string | null
  players: Record<string, AlbionBattlePlayer>
  guilds: Record<string, AlbionBattleGuild>
  alliances: Record<string, AlbionBattleAlliance>
}

export async function fetchRecentBattles(
  server: AlbionServer,
  limit = 100,
): Promise<AlbionBattle[]> {
  const url = `${SERVER_ENDPOINTS[server]}/battles?limit=${limit}&sort=recent`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-battle-tracker/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`battles ${res.status}`)
    const data = (await res.json()) as unknown
    if (!Array.isArray(data)) return []
    return data as AlbionBattle[]
  } finally {
    clearTimeout(timer)
  }
}

export type SizeCategory = 'small' | 'middle' | 'large' | 'zerg'
export const SIZE_CATEGORIES: SizeCategory[] = ['small', 'middle', 'large', 'zerg']

export function isSizeCategory(v: unknown): v is SizeCategory {
  return v === 'small' || v === 'middle' || v === 'large' || v === 'zerg'
}

// 10명 미만 전투는 "작은 갱크/1:1" 이라 집계 가치가 낮아 null 을 반환 → 제외.
export function categorizeSize(teamSize: number): SizeCategory | null {
  if (teamSize < 10) return null
  if (teamSize <= 30) return 'small'
  if (teamSize <= 60) return 'middle'
  if (teamSize <= 100) return 'large'
  return 'zerg'
}

export const SIZE_RANGES: Record<SizeCategory, { min: number; max: number | null }> = {
  small: { min: 10, max: 30 },
  middle: { min: 31, max: 60 },
  large: { min: 61, max: 100 },
  zerg: { min: 101, max: null },
}

export interface SidePerspective {
  guildIds: string[]
  allianceIds: string[]
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  guildNames: string[]
  allianceNames: string[]
  primaryGuildName: string
}

export interface BattleSides {
  home: SidePerspective
  opponent: SidePerspective
  homeGuildName: string
  homeAllianceId: string | null
  homeAllianceName: string | null
}

// 홈 길드가 battle 에 없으면 null 반환. 있으면 두 측 집계.
export function computeSides(battle: AlbionBattle, homeGuildId: string): BattleSides | null {
  const homeGuild = battle.guilds?.[homeGuildId]
  if (!homeGuild) return null

  const homeAllianceId = homeGuild.allianceId && homeGuild.allianceId !== '' ? homeGuild.allianceId : null

  const homeGuildIds = new Set<string>()
  const homeAllianceIds = new Set<string>()
  const opponentGuildIds = new Set<string>()
  const opponentAllianceIds = new Set<string>()

  for (const [gid, g] of Object.entries(battle.guilds ?? {})) {
    const sameAlliance = homeAllianceId !== null && g.allianceId === homeAllianceId
    if (gid === homeGuildId || sameAlliance) {
      homeGuildIds.add(gid)
      if (g.allianceId) homeAllianceIds.add(g.allianceId)
    } else {
      opponentGuildIds.add(gid)
      if (g.allianceId) opponentAllianceIds.add(g.allianceId)
    }
  }

  return {
    home: aggregateSide(battle, homeGuildIds, homeAllianceIds),
    opponent: aggregateSide(battle, opponentGuildIds, opponentAllianceIds),
    homeGuildName: homeGuild.name,
    homeAllianceId,
    homeAllianceName: homeAllianceId ? battle.alliances?.[homeAllianceId]?.name ?? null : null,
  }
}

function aggregateSide(
  battle: AlbionBattle,
  guildIds: Set<string>,
  allianceIds: Set<string>,
): SidePerspective {
  let kills = 0
  let deaths = 0
  let killFame = 0
  const guildNames: string[] = []
  const allianceNames: string[] = []
  let primaryGuildName = ''
  let primaryGuildFame = -1

  for (const gid of guildIds) {
    const g = battle.guilds[gid]
    if (!g) continue
    kills += g.kills
    deaths += g.deaths
    killFame += g.killFame
    guildNames.push(g.name)
    if (g.killFame > primaryGuildFame) {
      primaryGuildFame = g.killFame
      primaryGuildName = g.name
    }
  }

  for (const aid of allianceIds) {
    const a = battle.alliances[aid]
    if (a) allianceNames.push(a.name)
  }

  let teamSize = 0
  for (const p of Object.values(battle.players ?? {})) {
    if (guildIds.has(p.guildId)) teamSize++
  }

  return {
    guildIds: Array.from(guildIds),
    allianceIds: Array.from(allianceIds),
    teamSize,
    kills,
    deaths,
    killFame,
    guildNames,
    allianceNames,
    primaryGuildName,
  }
}

export type Outcome = 'win' | 'loss' | 'tie'

export function computeOutcome(home: SidePerspective, opponent: SidePerspective): Outcome {
  if (home.killFame > opponent.killFame) return 'win'
  if (home.killFame < opponent.killFame) return 'loss'
  return 'tie'
}

export function collectInvolvedIds(battle: AlbionBattle): {
  guildIds: string[]
  allianceIds: string[]
} {
  const guildIds = Object.keys(battle.guilds ?? {})
  const allianceIds = Object.keys(battle.alliances ?? {}).filter((id) => id !== '')
  return { guildIds, allianceIds }
}
