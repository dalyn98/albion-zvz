// Albion Online killboard (unofficial) API client.
// Endpoints are public but rate-limited. The game is hosted on three regional
// servers with separate killboards; the guild's server is configured in
// app_settings.albion_server so the admin can switch without a redeploy.
//
// Used for *hint-level* verification of regear claims: we check whether a
// guild member's death appears in the killboard during the event window. The
// screenshot uploaded by the user is still the primary evidence; this check
// just flags suspicious requests to the admin.

import { getAppSetting } from '@/lib/app-settings'
import { ALBION_GAMEINFO_ENDPOINTS } from '@/lib/albion-endpoints'
import { type AlbionServer, isAlbionServer } from '@/lib/albion-gameinfo'
import { fetchJsonWithRetry } from '@/lib/http-retry'

// Mapping matches Albion Online's official API hostnames. 'east' is the
// Asia/Pacific server (Singapore DC) — naming follows albionbb.com's scheme
// which most admins are already using to eyeball battles.
const SERVER_ENDPOINTS = ALBION_GAMEINFO_ENDPOINTS

const DEFAULT_SERVER: AlbionServer = 'east'

function parseServer(raw: string): AlbionServer {
  return isAlbionServer(raw) ? raw : DEFAULT_SERVER
}

// tenant 별로 albion_server 가 다를 수 있다. guildId 를 받아 해당 tenant 의 값을
// 읽는다. 호출자는 항상 명시 — 미지정 fallback 은 cross-tenant 누설 위험.
export async function resolveAlbionServer(guildId: string): Promise<AlbionServer> {
  const raw = await getAppSetting('albion_server', DEFAULT_SERVER, guildId)
  return parseServer(raw)
}

async function resolveBaseUrl(guildId: string): Promise<string> {
  return SERVER_ENDPOINTS[await resolveAlbionServer(guildId)]
}

// 길드명은 tenant 별로 다르다. app_settings.albion_home_guild_name 에서 읽고,
// 미설정이면 검증 자체를 skip — 잘못된 길드명으로 자동 인증 false 가 나가는 게
// 더 위험. 마이그 088 backfill 로 멘헤라 tenant 는 'Menhera' 가 들어가 있다.
async function resolveGuildName(guildId: string): Promise<string> {
  const raw = await getAppSetting('albion_home_guild_name', '', guildId)
  return raw.trim()
}

interface PlayerRef {
  Id: string
  Name: string
  GuildId: string | null
  GuildName: string | null
  AllianceId?: string | null
  AllianceName?: string | null
}

interface SearchResponse {
  guilds: Array<{ Id: string; Name: string }>
  players: PlayerRef[]
}

export interface KillboardDeath {
  EventId: number
  TimeStamp: string
  Victim: PlayerRef & { Equipment?: Record<string, unknown> | null }
  Killer: PlayerRef
}

type FetchOpts = Pick<RequestInit, 'cache'> & { revalidate?: number }

async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  // Caller decides cache strategy. Default: don't cache.
  return fetchJsonWithRetry<T>(url, {
    label: 'killboard',
    userAgent: 'albion-zvz-regear/1.0',
    fetchInit: {
      cache: opts.cache ?? 'no-store',
      ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : {}),
    },
  })
}

async function searchPlayerByName(baseUrl: string, name: string): Promise<PlayerRef | null> {
  const url = `${baseUrl}/search?q=${encodeURIComponent(name)}`
  // Player name → ID mapping is effectively immutable for our use case
  // (Albion charges silver to rename); 1h cache eliminates the duplicate
  // search call when the same member submits regears in quick succession.
  const data = await fetchJson<SearchResponse>(url, { revalidate: 3600 })
  // Case-insensitive exact match on Name — the search endpoint returns
  // prefix/fuzzy matches too.
  const target = name.trim().toLowerCase()
  return data.players.find((p) => p.Name.toLowerCase() === target) ?? null
}

async function getPlayerDeaths(baseUrl: string, playerId: string): Promise<KillboardDeath[]> {
  // The API returns the 50 most recent deaths; for a 1h window that's always
  // enough unless the player is AFK-dying at unusual frequency.
  // No cache — deaths are time-sensitive.
  const url = `${baseUrl}/players/${encodeURIComponent(playerId)}/deaths?range=day&limit=50&offset=0`
  return fetchJson<KillboardDeath[]>(url)
}

interface VerifyResult {
  verified: boolean
  matchedEventId: number | null
  // Reason the check didn't verify, for admin display. null if verified.
  reason: string | null
  // Equipment JSONB from the matched death, if any. Used downstream to
  // estimate regear silver from market prices without re-hitting the API.
  matchedEquipment: Record<string, unknown> | null
}

// Check whether `username` died in `guildName` during [windowStartIso, windowEndIso].
// The API is fire-and-forget for us — on any error we return a non-verified
// result with the error as the reason so the admin sees what happened.
export async function verifyDeathInWindow(
  username: string,
  windowStartIso: string,
  windowEndIso: string,
  opts: { guildId: string; guildName?: string },
): Promise<VerifyResult> {
  const guildName = (opts.guildName ?? (await resolveGuildName(opts.guildId))).trim()
  if (!guildName) {
    return {
      verified: false,
      matchedEventId: null,
      reason: '관리자가 길드명을 설정하지 않아 자동 검증을 건너뜁니다.',
      matchedEquipment: null,
    }
  }
  try {
    const baseUrl = await resolveBaseUrl(opts.guildId)
    const player = await searchPlayerByName(baseUrl, username)
    if (!player) {
      return {
        verified: false,
        matchedEventId: null,
        reason: '킬보드에서 해당 닉네임을 찾지 못했습니다.',
        matchedEquipment: null,
      }
    }

    // 길드 일치 검증은 사망 시점 기준(Victim.GuildName) 으로 한다.
    // 검색 endpoint 의 player.GuildName 은 "현재" 길드라 사망 후 길드 이동 / 추방
    // 시 false 를 내뿜는다 — Albion 길드는 KOEKO 잦아서 이 케이스가 빈번.
    const deaths = await getPlayerDeaths(baseUrl, player.Id)
    const startMs = Date.parse(windowStartIso)
    const endMs = Date.parse(windowEndIso)
    const target = guildName.toLowerCase()
    const inWindow = deaths.filter((d) => {
      const t = Date.parse(d.TimeStamp)
      return Number.isFinite(t) && t >= startMs && t <= endMs
    })
    if (inWindow.length === 0) {
      return {
        verified: false,
        matchedEventId: null,
        reason: '해당 시간대 내 사망 기록을 찾지 못했습니다.',
        matchedEquipment: null,
      }
    }
    const match = inWindow.find(
      (d) => (d.Victim.GuildName ?? '').toLowerCase() === target,
    )
    if (!match) {
      const others = inWindow
        .map((d) => d.Victim.GuildName ?? '길드 없음')
        .filter((g, i, arr) => arr.indexOf(g) === i)
        .join(', ')
      return {
        verified: false,
        matchedEventId: null,
        reason: `해당 시간대 사망 기록의 길드가 일치하지 않습니다 (${others}).`,
        matchedEquipment: null,
      }
    }
    return {
      verified: true,
      matchedEventId: match.EventId,
      reason: null,
      matchedEquipment: match.Victim.Equipment ?? null,
    }
  } catch (e) {
    return {
      verified: false,
      matchedEventId: null,
      reason: e instanceof Error ? `킬보드 조회 실패: ${e.message}` : '킬보드 조회 실패',
      matchedEquipment: null,
    }
  }
}
