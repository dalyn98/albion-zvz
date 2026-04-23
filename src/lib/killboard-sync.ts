// 킬보드 동기화 핵심 로직. 크론이 이 함수를 호출해 길드 멤버 전원의
// kills/deaths 를 폴링하고 killboard_events 에 upsert.
//
// 설계:
//   - guild_avatars 에 `albion_player_id` 를 캐시 → 2번째 이후 sync 는
//     이름 검색 없이 바로 /players/{id}/kills,/deaths 호출.
//   - 첫 방문이면 `/search?q={username}` 으로 매칭 시도 (bounded).
//   - 이미 upsert 된 event_id,role 행은 PK conflict 로 무시되므로
//     반복 호출이 안전.
//
// 주의: Albion 공식 API 는 IP 당 미지정 rate-limit 이 있음. 호출 사이 250ms
// 슬립으로 25명 × (kills+deaths+search)/250ms ≈ 15~20s 로 sync 1회 완료.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAlbionServer, type AlbionServer } from './killboard'

const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

const GUILD_NAME = process.env.ALBION_GUILD_NAME ?? 'Menhera'
// 동기 1회에서 이름 검색할 수 있는 최대 멤버 수. 나머지는 다음 tick 에서 처리.
const MAX_SEARCH_PER_RUN = 10
// Kills/deaths 는 API 가 최신 50건 반환. 5분 주기에서 놓친 기록 최소화.
const KILLS_LIMIT = 50
const API_DELAY_MS = 250

interface PlayerRef {
  Id: string
  Name: string
  GuildId: string | null
  GuildName: string | null
}

interface KillboardEvent {
  EventId: number
  TimeStamp: string
  TotalVictimKillFame?: number
  Killer: PlayerRef & {
    AverageItemPower?: number
    Equipment?: Record<string, unknown> | null
  }
  Victim: PlayerRef & {
    AverageItemPower?: number
    Equipment?: Record<string, unknown> | null
  }
}

interface SearchResponse {
  guilds: Array<{ Id: string; Name: string }>
  players: PlayerRef[]
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-killboard-sync/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`killboard ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function searchPlayerId(baseUrl: string, username: string): Promise<string | null> {
  const url = `${baseUrl}/search?q=${encodeURIComponent(username)}`
  const data = await fetchJson<SearchResponse>(url)
  const target = username.trim().toLowerCase()
  // 길드명까지 일치하는 레코드 우선 — 동명이인 중 Menhera 소속을 고른다.
  const guildMatch = data.players.find(
    (p) =>
      p.Name.toLowerCase() === target &&
      (p.GuildName ?? '').toLowerCase() === GUILD_NAME.toLowerCase(),
  )
  if (guildMatch) return guildMatch.Id
  // 길드명 불일치면 null — 이름만 맞는 건 다른 사람.
  return null
}

async function fetchEvents(
  baseUrl: string,
  playerId: string,
  kind: 'kills' | 'deaths',
): Promise<KillboardEvent[]> {
  const url = `${baseUrl}/players/${encodeURIComponent(playerId)}/${kind}?range=day&limit=${KILLS_LIMIT}&offset=0`
  const data = await fetchJson<KillboardEvent[]>(url)
  return Array.isArray(data) ? data : []
}

interface GuildMemberRow {
  discord_id: string
  username: string
  albion_player_id: string | null
}

export interface KillboardSyncResult {
  server: AlbionServer
  members_total: number
  members_resolved: number
  members_newly_resolved: number
  members_unresolved: number
  events_upserted: number
  errors: Array<{ member: string; step: string; message: string }>
  duration_ms: number
}

export async function syncKillboard(
  db: SupabaseClient,
  guildId: string,
): Promise<KillboardSyncResult> {
  const startedAt = Date.now()
  const server = await resolveAlbionServer()
  const baseUrl = SERVER_ENDPOINTS[server]

  const errors: Array<{ member: string; step: string; message: string }> = []

  const { data: members, error: membersError } = await db
    .from('guild_avatars')
    .select('discord_id, username, albion_player_id')
    .eq('guild_id', guildId)
    .order('updated_at', { ascending: false })
  if (membersError) {
    throw new Error(`guild_avatars query failed: ${membersError.message}`)
  }
  const memberRows = (members ?? []) as GuildMemberRow[]

  // Phase 1: 매핑되지 않은 멤버 중 일부에 대해 /search 로 Albion player_id 획득.
  const needsResolve = memberRows.filter((m) => !m.albion_player_id).slice(0, MAX_SEARCH_PER_RUN)
  let newlyResolved = 0
  for (const m of needsResolve) {
    try {
      const id = await searchPlayerId(baseUrl, m.username)
      if (id) {
        const { error } = await db
          .from('guild_avatars')
          .update({ albion_player_id: id })
          .eq('discord_id', m.discord_id)
        if (error) {
          errors.push({ member: m.username, step: 'update-player-id', message: error.message })
        } else {
          m.albion_player_id = id
          newlyResolved += 1
        }
      }
    } catch (e) {
      errors.push({
        member: m.username,
        step: 'search',
        message: e instanceof Error ? e.message : String(e),
      })
    }
    await sleep(API_DELAY_MS)
  }

  // Phase 2: player_id 가 있는 멤버들의 kills/deaths 조회 → upsert.
  const resolved = memberRows.filter((m) => !!m.albion_player_id)
  let upserted = 0
  for (const m of resolved) {
    const playerId = m.albion_player_id!
    try {
      const [kills, deaths] = await Promise.all([
        fetchEvents(baseUrl, playerId, 'kills'),
        fetchEvents(baseUrl, playerId, 'deaths'),
      ])

      const rows = [
        ...kills.map((e) => toRow(e, 'killer', m, playerId, guildId)),
        ...deaths.map((e) => toRow(e, 'victim', m, playerId, guildId)),
      ]

      if (rows.length === 0) {
        await sleep(API_DELAY_MS)
        continue
      }

      // onConflict: (event_id, role) — 기존 행은 그대로 두고 무시.
      const { error, count } = await db
        .from('killboard_events')
        .upsert(rows, { onConflict: 'event_id,role', ignoreDuplicates: true, count: 'exact' })
      if (error) {
        errors.push({ member: m.username, step: 'upsert', message: error.message })
      } else {
        upserted += count ?? 0
      }
    } catch (e) {
      errors.push({
        member: m.username,
        step: 'fetch-events',
        message: e instanceof Error ? e.message : String(e),
      })
    }
    await sleep(API_DELAY_MS)
  }

  return {
    server,
    members_total: memberRows.length,
    members_resolved: resolved.length,
    members_newly_resolved: newlyResolved,
    members_unresolved: memberRows.length - resolved.length,
    events_upserted: upserted,
    errors,
    duration_ms: Date.now() - startedAt,
  }
}

function toRow(
  e: KillboardEvent,
  role: 'killer' | 'victim',
  member: GuildMemberRow,
  playerId: string,
  guildId: string,
) {
  const self = role === 'killer' ? e.Killer : e.Victim
  const opponent = role === 'killer' ? e.Victim : e.Killer
  return {
    guild_id: guildId,
    event_id: e.EventId,
    role,
    discord_id: member.discord_id,
    albion_player_id: playerId,
    player_name: self.Name,
    opponent_name: opponent.Name,
    opponent_guild: opponent.GuildName,
    fame: e.TotalVictimKillFame ?? 0,
    item_power: self.AverageItemPower ? Math.round(self.AverageItemPower) : null,
    occurred_at: e.TimeStamp,
    // Equipment 는 victim 행에만 저장 — Phase 3 자동 리기어가 이걸 읽어 AODP 시세 계산.
    equipment: role === 'victim' ? (e.Victim.Equipment ?? null) : null,
  }
}
