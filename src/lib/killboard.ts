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

export type AlbionServer = 'west' | 'east' | 'europe'

// Mapping matches Albion Online's official API hostnames. 'east' is the
// Asia/Pacific server (Singapore DC) — naming follows albionbb.com's scheme
// which most admins are already using to eyeball battles.
const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

const DEFAULT_SERVER: AlbionServer = 'east'

function parseServer(raw: string): AlbionServer {
  if (raw === 'west' || raw === 'east' || raw === 'europe') return raw
  return DEFAULT_SERVER
}

// tenant 별로 albion_server 가 다를 수 있다. guildId 를 받아 해당 tenant 의 값을
// 읽고, 미지정 시 primary tenant fallback (현재 호출자가 아직 guildId 를 전달하지
// 않는 레거시 경로 호환).
export async function resolveAlbionServer(guildId?: string): Promise<AlbionServer> {
  const raw = await getAppSetting('albion_server', DEFAULT_SERVER, guildId)
  return parseServer(raw)
}

async function resolveBaseUrl(guildId?: string): Promise<string> {
  return SERVER_ENDPOINTS[await resolveAlbionServer(guildId)]
}

// NEXT_PUBLIC_* names are a Next.js convention for client-accessible env vars;
// killboard calls are server-only, so plain names are fine.
const DEFAULT_GUILD_NAME = process.env.ALBION_GUILD_NAME ?? 'Menhera'

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
  // 10s timeout — killboard occasionally stalls and we don't want server
  // actions hanging on it.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-regear/1.0' },
      // Caller decides cache strategy. Default: don't cache.
      cache: opts.cache ?? 'no-store',
      ...(opts.revalidate ? { next: { revalidate: opts.revalidate } } : {}),
    })
    if (!res.ok) throw new Error(`killboard ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
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
  opts: { guildName?: string; guildId?: string } = {},
): Promise<VerifyResult> {
  const guildName = opts.guildName ?? DEFAULT_GUILD_NAME
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
    if ((player.GuildName ?? '').toLowerCase() !== guildName.toLowerCase()) {
      return {
        verified: false,
        matchedEventId: null,
        reason: `길드가 일치하지 않습니다 (${player.GuildName ?? '길드 없음'}).`,
        matchedEquipment: null,
      }
    }

    const deaths = await getPlayerDeaths(baseUrl, player.Id)
    const startMs = Date.parse(windowStartIso)
    const endMs = Date.parse(windowEndIso)
    const match = deaths.find((d) => {
      const t = Date.parse(d.TimeStamp)
      return Number.isFinite(t) && t >= startMs && t <= endMs
    })
    if (!match) {
      return {
        verified: false,
        matchedEventId: null,
        reason: '해당 시간대 내 사망 기록을 찾지 못했습니다.',
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
