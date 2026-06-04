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
import { ALBION_GAMEINFO_ENDPOINTS } from '@/lib/albion-endpoints'
import { fetchJsonWithRetry, HttpFetchError } from '@/lib/http-retry'

// /battles 는 gameinfo 서버와 같은 base 도메인 + /api/gameinfo prefix 를 쓴다.
const SERVER_ENDPOINTS = ALBION_GAMEINFO_ENDPOINTS

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
  averageItemPower?: number | string | null
  AverageItemPower?: number | string | null
  itemPower?: number | string | null
  equipment?: Record<string, AlbionBattleEquipmentItem | null> | null
  Equipment?: Record<string, AlbionBattleEquipmentItem | null> | null
}

export interface AlbionBattleEquipmentItem {
  Type?: string | null
  Count?: number | string | null
  Quality?: number | string | null
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

export type BattleForceLevel = 'alliance' | 'guild'
export type BattleForceKind = 'alliance' | 'guild'

export interface BattleForceSummary {
  forceLevel: BattleForceLevel
  forceKind: BattleForceKind
  forceKey: string
  forceName: string
  allianceId: string | null
  allianceName: string | null
  guildIds: string[]
  guildNames: string[]
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  averageItemPower: number | null
}

export interface BattlePlayerEquipmentEvidence {
  playerId: string
  itemPower: number | null
  equipment: Record<string, AlbionBattleEquipmentItem | null> | null
  occurredAt: string | null
}

export interface BattlePlayerSummary {
  playerId: string
  playerName: string
  guildId: string
  guildName: string
  allianceId: string | null
  allianceName: string | null
  kills: number
  deaths: number
  killFame: number
  itemPower: number | null
  weaponId: string | null
}

// battle_records.raw_battle JSONB 는 우리 cron 이 Albion API 응답을 그대로
// 적재한 값이라 평소엔 AlbionBattle 모양이지만, 손상된 마이그레이션/구버전
// 행을 읽었을 때를 대비해 read-time 에 핵심 필드 (id 숫자, guilds 객체) 만
// 가볍게 검증한다. 실패하면 null 을 반환해 호출부가 빈 배열 fallback 하도록.
export function parseRawBattle(raw: unknown): AlbionBattle | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (typeof b.id !== 'number') return null
  if (!b.guilds || typeof b.guilds !== 'object') return null
  if (!b.players || typeof b.players !== 'object') return null
  if (!b.alliances || typeof b.alliances !== 'object') return null
  return raw as AlbionBattle
}

// Albion gameinfo `/battles` 는 limit ≤ 51 이라 예전 limit=100 호출은 HTTP 400 으로
// 실패한다 (silent break). 안전하게 50 으로 고정하고 더 긴 시간을 커버해야 하면
// pages 인자로 offset 페이지네이션을 돌린다 (50*pages 건).
const BATTLES_PAGE_SIZE = 50

// 단일 battle 을 ID 로 fetch. 404 등 "Albion 이 노출 안 함" 인 경우는 null.
// /battles?sort=recent 가 누락한 battle 을 killboard_events.battle_id hint 로
// 채울 때 사용. Albion 의 매우 작은 가벼운 교전(1~3명) 일부는 list 와 detail
// 모두에서 404 가 뜨는 게 정상 — 이 경우는 우리도 집계 대상이 아니라 무시.
export async function fetchBattleById(
  server: AlbionServer,
  battleId: number,
): Promise<AlbionBattle | null> {
  const url = `${SERVER_ENDPOINTS[server]}/battles/${battleId}`
  try {
    const data = await fetchJsonWithRetry<AlbionBattle>(url, {
      label: `battles/${battleId}`,
      userAgent: 'albion-zvz-battle-tracker/1.0',
      fetchInit: { cache: 'no-store' },
    })
    if (!data || typeof data.id !== 'number') return null
    return data
  } catch (err) {
    if (err instanceof HttpFetchError && err.status === 404) return null
    throw err
  }
}

export async function fetchRecentBattles(
  server: AlbionServer,
  pages = 2,
): Promise<AlbionBattle[]> {
  const all: AlbionBattle[] = []
  const seen = new Set<number>()
  for (let i = 0; i < pages; i++) {
    const offset = i * BATTLES_PAGE_SIZE
    const url = `${SERVER_ENDPOINTS[server]}/battles?limit=${BATTLES_PAGE_SIZE}&offset=${offset}&sort=recent`
    const data = await fetchJsonWithRetry<unknown>(url, {
      label: 'battles',
      userAgent: 'albion-zvz-battle-tracker/1.0',
      timeoutMs: 15_000,
      fetchInit: { cache: 'no-store' },
    })
    const page: AlbionBattle[] = Array.isArray(data) ? (data as AlbionBattle[]) : []
    for (const b of page) {
      if (seen.has(b.id)) continue
      seen.add(b.id)
      all.push(b)
    }
    if (page.length < BATTLES_PAGE_SIZE) break
  }
  return all
}

export type SizeCategory = 'small' | 'middle' | 'large' | 'zerg'
export const SIZE_CATEGORIES: SizeCategory[] = ['small', 'middle', 'large', 'zerg']

export function isSizeCategory(v: unknown): v is SizeCategory {
  return v === 'small' || v === 'middle' || v === 'large' || v === 'zerg'
}

// 10명 미만 전투는 "갱크/스트래글러" 라 집계 가치가 낮아 null 을 반환 → 제외.
// (2026-04-26 15 → 10 환원. 15 floor 는 정식 ZvZ 만 잡아내는 데에는 적절했지만
// 10-14 명짜리 진성 소규모 교전을 모두 잘라 사용자가 누락 호소 → 10 으로 복귀.)
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

function numericValue(raw: unknown): number | null {
  const n = typeof raw === 'string' ? Number(raw) : raw
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

export function getBattlePlayerItemPower(player: AlbionBattlePlayer): number | null {
  const n =
    numericValue(player.averageItemPower) ??
    numericValue(player.AverageItemPower) ??
    numericValue(player.itemPower)
  return n === null ? null : Math.round(n)
}

export function getBattlePlayerEquipment(
  player: AlbionBattlePlayer,
): Record<string, AlbionBattleEquipmentItem | null> | null {
  return player.equipment ?? player.Equipment ?? null
}

export function getBattlePlayerWeaponId(player: AlbionBattlePlayer): string | null {
  const raw = getBattlePlayerEquipment(player)?.MainHand?.Type
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

function averageIp(sum: number, count: number): number | null {
  if (count <= 0) return null
  return Math.round(sum / count)
}

export function computeBattleForceSummaries(battle: AlbionBattle): BattleForceSummary[] {
  const playersByGuild = new Map<string, { teamSize: number; ipSum: number; ipCount: number }>()
  for (const player of Object.values(battle.players ?? {})) {
    const entry = playersByGuild.get(player.guildId) ?? { teamSize: 0, ipSum: 0, ipCount: 0 }
    entry.teamSize += 1
    const ip = getBattlePlayerItemPower(player)
    if (ip !== null) {
      entry.ipSum += ip
      entry.ipCount += 1
    }
    playersByGuild.set(player.guildId, entry)
  }

  const summaries: BattleForceSummary[] = []
  const allianceAcc = new Map<
    string,
    {
      forceKey: string
      forceName: string
      allianceId: string
      allianceName: string
      guildIds: string[]
      guildNames: string[]
      teamSize: number
      kills: number
      deaths: number
      killFame: number
      ipSum: number
      ipCount: number
    }
  >()

  for (const [guildId, guild] of Object.entries(battle.guilds ?? {})) {
    const playerStats = playersByGuild.get(guildId) ?? { teamSize: 0, ipSum: 0, ipCount: 0 }
    const allianceId = guild.allianceId && guild.allianceId !== '' ? guild.allianceId : null
    const allianceName = allianceId
      ? (battle.alliances?.[allianceId]?.name ?? guild.alliance) || null
      : null

    summaries.push({
      forceLevel: 'guild',
      forceKind: 'guild',
      forceKey: `g:${guildId}`,
      forceName: guild.name,
      allianceId,
      allianceName,
      guildIds: [guildId],
      guildNames: [guild.name],
      teamSize: playerStats.teamSize,
      kills: guild.kills,
      deaths: guild.deaths,
      killFame: guild.killFame,
      averageItemPower: averageIp(playerStats.ipSum, playerStats.ipCount),
    })

    if (!allianceId) {
      summaries.push({
        forceLevel: 'alliance',
        forceKind: 'guild',
        forceKey: `g:${guildId}`,
        forceName: guild.name,
        allianceId: null,
        allianceName: null,
        guildIds: [guildId],
        guildNames: [guild.name],
        teamSize: playerStats.teamSize,
        kills: guild.kills,
        deaths: guild.deaths,
        killFame: guild.killFame,
        averageItemPower: averageIp(playerStats.ipSum, playerStats.ipCount),
      })
      continue
    }

    const acc = allianceAcc.get(allianceId) ?? {
      forceKey: `a:${allianceId}`,
      forceName: (allianceName ?? guild.alliance) || guild.name,
      allianceId,
      allianceName: allianceName ?? guild.alliance ?? null,
      guildIds: [],
      guildNames: [],
      teamSize: 0,
      kills: 0,
      deaths: 0,
      killFame: 0,
      ipSum: 0,
      ipCount: 0,
    }
    acc.guildIds.push(guildId)
    acc.guildNames.push(guild.name)
    acc.teamSize += playerStats.teamSize
    acc.kills += guild.kills
    acc.deaths += guild.deaths
    acc.killFame += guild.killFame
    acc.ipSum += playerStats.ipSum
    acc.ipCount += playerStats.ipCount
    allianceAcc.set(allianceId, acc)
  }

  for (const acc of allianceAcc.values()) {
    summaries.push({
      forceLevel: 'alliance',
      forceKind: 'alliance',
      forceKey: acc.forceKey,
      forceName: acc.forceName,
      allianceId: acc.allianceId,
      allianceName: acc.allianceName,
      guildIds: acc.guildIds,
      guildNames: acc.guildNames,
      teamSize: acc.teamSize,
      kills: acc.kills,
      deaths: acc.deaths,
      killFame: acc.killFame,
      averageItemPower: averageIp(acc.ipSum, acc.ipCount),
    })
  }

  return summaries.sort((a, b) => {
    if (a.forceLevel !== b.forceLevel) return a.forceLevel.localeCompare(b.forceLevel)
    if (b.teamSize !== a.teamSize) return b.teamSize - a.teamSize
    return a.forceName.localeCompare(b.forceName)
  })
}

export function buildBattlePlayerSummaries(
  battle: AlbionBattle,
  evidenceRows: ReadonlyArray<BattlePlayerEquipmentEvidence> = [],
): BattlePlayerSummary[] {
  const evidenceByPlayer = new Map<
    string,
    { itemPower: number | null; weaponId: string | null; occurredAt: string | null }
  >()
  for (const row of evidenceRows) {
    if (!row.playerId) continue
    const current = evidenceByPlayer.get(row.playerId)
    const nextWeapon =
      typeof row.equipment?.MainHand?.Type === 'string'
        ? row.equipment.MainHand.Type.trim() || null
        : null
    const shouldReplace =
      !current ||
      (row.occurredAt !== null &&
        (current.occurredAt === null || row.occurredAt > current.occurredAt))
    if (!shouldReplace) {
      if (current.weaponId === null && nextWeapon !== null) current.weaponId = nextWeapon
      if (current.itemPower === null && row.itemPower !== null) current.itemPower = row.itemPower
      continue
    }
    evidenceByPlayer.set(row.playerId, {
      itemPower: row.itemPower,
      weaponId: nextWeapon,
      occurredAt: row.occurredAt,
    })
  }

  return Object.values(battle.players ?? {})
    .map((player) => {
      const evidence = evidenceByPlayer.get(player.id)
      return {
        playerId: player.id,
        playerName: player.name,
        guildId: player.guildId,
        guildName: player.guildName,
        allianceId: player.allianceId,
        allianceName: player.allianceName,
        kills: player.kills,
        deaths: player.deaths,
        killFame: player.killFame,
        itemPower: evidence?.itemPower ?? getBattlePlayerItemPower(player),
        weaponId: evidence?.weaponId ?? getBattlePlayerWeaponId(player),
      }
    })
    .sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills
      if (b.deaths !== a.deaths) return b.deaths - a.deaths
      if (b.killFame !== a.killFame) return b.killFame - a.killFame
      return a.playerName.localeCompare(b.playerName)
    })
}

// 상대측 "force" — alliance 단위 또는 단독 길드 단위. 합산 의미가 있는 단위만
// 묶고 다른 force 와는 별개로 취급한다. 매치업 판정의 기본 단위.
//
// alliance_id 가 ''/null 인 길드는 자기 자신이 force 가 됨 (kind='guild').
// 같은 alliance_id 를 가진 여러 길드는 한 force 로 합산 (kind='alliance').
// forceKey 는 마이그 098 의 main_opponent_force_key 와 같은 형식.
export interface OpponentForce {
  forceKey: string // 'a:'+allianceId | 'g:'+guildId
  forceKind: 'alliance' | 'guild'
  forceName: string
  allianceId: string | null
  guildIds: string[]
  guildNames: string[]
  teamSize: number
  kills: number
  deaths: number
  killFame: number
}

// 상대측을 alliance 또는 단독 길드 단위로 그룹화. teamSize desc, killFame desc 로
// 정렬해 첫 항목이 "주 상대 (mainOpponent)".
export function computeOpposingForces(
  battle: AlbionBattle,
  homeGuildId: string,
): OpponentForce[] {
  const sides = computeSides(battle, homeGuildId)
  if (!sides) return []

  const opponentGuildSet = new Set(sides.opponent.guildIds)
  const teamSizeByGuild = new Map<string, number>()
  for (const p of Object.values(battle.players ?? {})) {
    if (!opponentGuildSet.has(p.guildId)) continue
    teamSizeByGuild.set(p.guildId, (teamSizeByGuild.get(p.guildId) ?? 0) + 1)
  }

  type ForceAccumulator = {
    forceKey: string
    forceKind: 'alliance' | 'guild'
    forceName: string
    allianceId: string | null
    guildIds: string[]
    guildNames: string[]
    teamSize: number
    kills: number
    deaths: number
    killFame: number
  }
  const forceMap = new Map<string, ForceAccumulator>()

  for (const gid of sides.opponent.guildIds) {
    const g = battle.guilds[gid]
    if (!g) continue
    const teamSize = teamSizeByGuild.get(gid) ?? 0
    if (teamSize === 0) continue

    const allianceId = g.allianceId && g.allianceId !== '' ? g.allianceId : null
    const kind: 'alliance' | 'guild' = allianceId ? 'alliance' : 'guild'
    const forceKey = allianceId ? `a:${allianceId}` : `g:${gid}`
    const forceName = allianceId
      ? battle.alliances?.[allianceId]?.name ?? g.name
      : g.name

    const existing = forceMap.get(forceKey)
    if (existing) {
      existing.guildIds.push(gid)
      existing.guildNames.push(g.name)
      existing.teamSize += teamSize
      existing.kills += g.kills
      existing.deaths += g.deaths
      existing.killFame += g.killFame
    } else {
      forceMap.set(forceKey, {
        forceKey,
        forceKind: kind,
        forceName,
        allianceId,
        guildIds: [gid],
        guildNames: [g.name],
        teamSize,
        kills: g.kills,
        deaths: g.deaths,
        killFame: g.killFame,
      })
    }
  }

  const forces: OpponentForce[] = Array.from(forceMap.values())
  forces.sort((a, b) => {
    if (b.teamSize !== a.teamSize) return b.teamSize - a.teamSize
    return b.killFame - a.killFame
  })
  return forces
}

export interface OpponentGuildBreakdown {
  guildId: string
  guildName: string
  allianceName: string | null
  teamSize: number
  kills: number
  deaths: number
  killFame: number
}

export interface HomeAllianceStats {
  allianceName: string
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  guildCount: number
}

// 홈 길드가 alliance 에 속해 있을 때, raw_battle 에서 같은 alliance 의 모든 길드
// 합산 K/D/Fame/teamSize 를 산출. matchup 분리 없이 전투 전체 합산이라
// "우리 연합이 이 전투에 통째로 얼마나 싸웠는지" 의 의미. 다른 force 와의 교전
// 까지 포함되므로 home_kills (= 매치업 분리값) 와 다를 수 있음.
//
// 반환 null 의 의미:
//   - 홈 길드가 alliance 미가입 (allianceId 없음 또는 빈 문자열)
//   - alliance 정보가 raw_battle 에 없음 (구버전/손상 행)
//   - 같은 alliance 안 길드가 홈 단독 1개 (= 홈 카드와 중복돼 표시 의미 없음)
export function computeHomeAllianceStats(
  battle: AlbionBattle,
  homeGuildId: string,
): HomeAllianceStats | null {
  const homeGuild = battle.guilds?.[homeGuildId]
  if (!homeGuild) return null
  const allianceId =
    homeGuild.allianceId && homeGuild.allianceId !== '' ? homeGuild.allianceId : null
  if (!allianceId) return null
  const alliance = battle.alliances?.[allianceId]
  if (!alliance) return null

  const allyGuildIds = new Set<string>()
  let kills = 0
  let deaths = 0
  let killFame = 0
  for (const [gid, g] of Object.entries(battle.guilds ?? {})) {
    if (g.allianceId !== allianceId) continue
    allyGuildIds.add(gid)
    kills += g.kills
    deaths += g.deaths
    killFame += g.killFame
  }
  if (allyGuildIds.size <= 1) return null

  let teamSize = 0
  for (const p of Object.values(battle.players ?? {})) {
    if (allyGuildIds.has(p.guildId)) teamSize++
  }

  return {
    allianceName: alliance.name,
    teamSize,
    kills,
    deaths,
    killFame,
    guildCount: allyGuildIds.size,
  }
}

// 상대 측의 길드별 분석. 홈 길드/얼라이언스를 제외한 나머지 길드를 개별 행으로
// 돌려준다. teamSize 는 raw_battle.players 에서 직접 카운트 (battle.guilds 의
// 통계 필드는 길드 내부 인원 수가 아니라 누적 킬/데스/페임). killFame desc 로 정렬.
//
// minTeamSize 인자: 1~2명 갱크/스트래글러 같은 소규모 참가 길드를 잘라낼 때.
// 기본값 0 (필터 없음). 호출 측에서 "집계 규모에 맞는 길드만" 같은 정책에 따라
// 컷오프를 지정.
export function computeOpponentGuildBreakdown(
  battle: AlbionBattle,
  homeGuildId: string,
  options: { minTeamSize?: number } = {},
): OpponentGuildBreakdown[] {
  const sides = computeSides(battle, homeGuildId)
  if (!sides) return []
  const minTeamSize = options.minTeamSize ?? 0

  const opponentGuildSet = new Set(sides.opponent.guildIds)
  const teamSizeByGuild = new Map<string, number>()
  for (const player of Object.values(battle.players ?? {})) {
    if (!opponentGuildSet.has(player.guildId)) continue
    teamSizeByGuild.set(player.guildId, (teamSizeByGuild.get(player.guildId) ?? 0) + 1)
  }

  const rows: OpponentGuildBreakdown[] = []
  for (const gid of sides.opponent.guildIds) {
    const g = battle.guilds[gid]
    if (!g) continue
    const teamSize = teamSizeByGuild.get(gid) ?? 0
    if (teamSize < minTeamSize) continue
    const allianceName =
      g.allianceId && battle.alliances?.[g.allianceId]?.name
        ? battle.alliances[g.allianceId].name
        : null
    rows.push({
      guildId: gid,
      guildName: g.name,
      allianceName,
      teamSize,
      kills: g.kills,
      deaths: g.deaths,
      killFame: g.killFame,
    })
  }

  rows.sort((a, b) => {
    if (b.killFame !== a.killFame) return b.killFame - a.killFame
    return b.teamSize - a.teamSize
  })
  return rows
}
