// Albion Online killboard (unofficial) API client.
// Asia server = gameinfo-sgp. Endpoints are public but rate-limited.
//
// Used for *hint-level* verification of regear claims: we check whether a
// guild member's death appears in the killboard during the event window. The
// screenshot uploaded by the user is still the primary evidence; this check
// just flags suspicious requests to the admin.

const KILLBOARD_BASE = 'https://gameinfo-sgp.albiononline.com/api/gameinfo'

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
  Victim: PlayerRef
  Killer: PlayerRef
}

async function fetchJson<T>(url: string): Promise<T> {
  // 10s timeout — killboard occasionally stalls and we don't want server
  // actions hanging on it.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-regear/1.0' },
      // Don't cache — kills are time-sensitive.
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`killboard ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export async function searchPlayerByName(name: string): Promise<PlayerRef | null> {
  const url = `${KILLBOARD_BASE}/search?q=${encodeURIComponent(name)}`
  const data = await fetchJson<SearchResponse>(url)
  // Case-insensitive exact match on Name — the search endpoint returns
  // prefix/fuzzy matches too.
  const target = name.trim().toLowerCase()
  return data.players.find((p) => p.Name.toLowerCase() === target) ?? null
}

export async function getPlayerDeaths(playerId: string): Promise<KillboardDeath[]> {
  // The API returns the 50 most recent deaths; for a 1h window that's always
  // enough unless the player is AFK-dying at unusual frequency.
  const url = `${KILLBOARD_BASE}/players/${encodeURIComponent(playerId)}/deaths?range=day&limit=50&offset=0`
  return fetchJson<KillboardDeath[]>(url)
}

interface VerifyResult {
  verified: boolean
  matchedEventId: number | null
  // Reason the check didn't verify, for admin display. null if verified.
  reason: string | null
}

// Check whether `username` died in `guildName` during [windowStartIso, windowEndIso].
// The API is fire-and-forget for us — on any error we return a non-verified
// result with the error as the reason so the admin sees what happened.
export async function verifyDeathInWindow(
  username: string,
  windowStartIso: string,
  windowEndIso: string,
  guildName: string = DEFAULT_GUILD_NAME,
): Promise<VerifyResult> {
  try {
    const player = await searchPlayerByName(username)
    if (!player) {
      return { verified: false, matchedEventId: null, reason: '킬보드에서 해당 닉네임을 찾지 못했습니다.' }
    }
    if ((player.GuildName ?? '').toLowerCase() !== guildName.toLowerCase()) {
      return {
        verified: false,
        matchedEventId: null,
        reason: `길드가 일치하지 않습니다 (${player.GuildName ?? '길드 없음'}).`,
      }
    }

    const deaths = await getPlayerDeaths(player.Id)
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
      }
    }
    return { verified: true, matchedEventId: match.EventId, reason: null }
  } catch (e) {
    return {
      verified: false,
      matchedEventId: null,
      reason: e instanceof Error ? `킬보드 조회 실패: ${e.message}` : '킬보드 조회 실패',
    }
  }
}
