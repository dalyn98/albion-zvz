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
import { getAppSetting } from './app-settings'
import { ALBION_GAMEINFO_ENDPOINTS } from './albion-endpoints'

const SERVER_ENDPOINTS = ALBION_GAMEINFO_ENDPOINTS

// 동기 1회에서 이름 검색할 수 있는 최대 멤버 수. 나머지는 다음 tick 에서 처리.
const MAX_SEARCH_PER_RUN = 10
// Kills/deaths 는 API 가 최신 50건 반환. 5분 주기에서 놓친 기록 최소화.
const KILLS_LIMIT = 50
const API_DELAY_MS = 250
// 미연동 (Discord 안 가입한) Albion 멤버는 수가 많아 (~수백 명) 매 cron 마다
// 전부 polling 하면 timeout. 한 사이클에 N 명만 random-sample 로 처리.
// 15분 주기 × 4 = 1시간 × 24 = 하루 96회 sync × 30명 = 2880회 polling 으로
// 평균 580명 멤버를 하루에 약 5번씩 커버. 기존 가입자 polling 시간 + 30명 추가 ≈
// cron maxDuration 안에 안정적으로 들어옴.
const MAX_ALBION_ONLY_PER_RUN = 30

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
  // Albion API 가 항상 채워주는 필드. 누락된 battle_records 를 채울 때 hint 로 쓴다.
  BattleId?: number
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

async function searchPlayerId(
  baseUrl: string,
  username: string,
  guildName: string,
): Promise<string | null> {
  const url = `${baseUrl}/search?q=${encodeURIComponent(username)}`
  const data = await fetchJson<SearchResponse>(url)
  const target = username.trim().toLowerCase()
  // 길드명까지 일치하는 레코드 우선 — 동명이인 중 자기 길드 소속을 고른다.
  const guildMatch = data.players.find(
    (p) =>
      p.Name.toLowerCase() === target &&
      (p.GuildName ?? '').toLowerCase() === guildName.toLowerCase(),
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

// killboard_events 행을 만들 때 필요한 멤버 식별자. Discord 가입자(guild_avatars)
// 와 미연동 Albion 멤버(albion_guild_members) 모두 이 형태로 통일해 toRow 에 전달.
interface MemberForRow {
  discord_id: string | null
  username: string
  albion_player_id: string | null
}

// guild_avatars 쿼리 결과 — Discord 가입자라 discord_id 는 항상 NOT NULL.
interface GuildAvatarMemberRow {
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
  // 미연동 Albion 멤버 풀 크기 (left_at IS NULL ∧ guild_avatars 미매핑).
  albion_only_pool: number
  // 이번 cron 에서 polling 한 미연동 멤버 수 (MAX_ALBION_ONLY_PER_RUN 상한).
  albion_only_polled: number
  events_upserted: number
  errors: Array<{ member: string; step: string; message: string }>
  duration_ms: number
}

export async function syncKillboard(
  db: SupabaseClient,
  guildId: string,
): Promise<KillboardSyncResult> {
  const startedAt = Date.now()
  const server = await resolveAlbionServer(guildId)
  const baseUrl = SERVER_ENDPOINTS[server]
  // tenant 의 알비온 길드명 — 동명이인 중 자기 길드원을 고르는 데 사용. 위저드
  // step 2 에서 albion_home_guild_id 와 함께 저장. 미설정이면 매칭 자체를 skip
  // (잘못된 길드원을 매핑하는 게 더 위험).
  const guildName = (await getAppSetting('albion_home_guild_name', '', guildId)).trim()

  const errors: Array<{ member: string; step: string; message: string }> = []

  if (!guildName) {
    return {
      server,
      members_total: 0,
      members_resolved: 0,
      members_newly_resolved: 0,
      members_unresolved: 0,
      albion_only_pool: 0,
      albion_only_polled: 0,
      events_upserted: 0,
      errors: [{ member: '*', step: 'config', message: 'albion_home_guild_name not configured for tenant' }],
      duration_ms: Date.now() - startedAt,
    }
  }

  const { data: members, error: membersError } = await db
    .from('guild_avatars')
    .select('discord_id, username, albion_player_id')
    .eq('guild_id', guildId)
    .order('updated_at', { ascending: false })
  if (membersError) {
    throw new Error(`guild_avatars query failed: ${membersError.message}`)
  }
  const memberRows = (members ?? []) as GuildAvatarMemberRow[]

  // Phase 1: 매핑되지 않은 멤버 중 일부에 대해 /search 로 Albion player_id 획득.
  const needsResolve = memberRows.filter((m) => !m.albion_player_id).slice(0, MAX_SEARCH_PER_RUN)
  let newlyResolved = 0
  for (const m of needsResolve) {
    try {
      const id = await searchPlayerId(baseUrl, m.username, guildName)
      if (id) {
        const { error } = await db
          .from('guild_avatars')
          .update({ albion_player_id: id })
          .eq('guild_id', guildId)
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

  // Phase 2: player_id 가 있는 Discord 가입자들의 kills/deaths 조회 → upsert.
  const resolved = memberRows.filter((m) => !!m.albion_player_id)
  let upserted = 0
  for (const m of resolved) {
    const playerId = m.albion_player_id!
    try {
      const newRows = await pollAndBuildRows(baseUrl, playerId, m, guildId)
      if (newRows.length > 0) {
        const { error, count } = await db
          .from('killboard_events')
          .upsert(newRows, { onConflict: 'event_id,role', ignoreDuplicates: true, count: 'exact' })
        if (error) {
          errors.push({ member: m.username, step: 'upsert', message: error.message })
        } else {
          upserted += count ?? 0
        }
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

  // Phase 3: Discord 미연동 Albion 멤버 (albion_guild_members) 의 kills/deaths.
  // 풀이 클 수 있어 한 사이클에 MAX_ALBION_ONLY_PER_RUN 만 random sampling.
  // guild_avatars 의 albion_player_id 와 겹치는 행은 Phase 2 에서 이미 처리되므로 제외.
  const resolvedPlayerIds = new Set(
    resolved.map((m) => m.albion_player_id).filter((x): x is string => !!x),
  )
  const { data: albionOnlyAll, error: albionOnlyError } = await db
    .from('albion_guild_members')
    .select('albion_player_id, albion_player_name')
    .eq('guild_id', guildId)
    .is('left_at', null)
  if (albionOnlyError) {
    errors.push({ member: '*', step: 'fetch-albion-only', message: albionOnlyError.message })
  }
  const albionOnlyPool = (albionOnlyAll ?? []).filter(
    (r) => !resolvedPlayerIds.has(r.albion_player_id),
  )
  // Fisher-Yates shuffle 후 상한까지 자른다. cron 마다 다른 N 명을 처리해 시간이
  // 흐르면 모든 미연동 멤버가 골고루 polling 된다.
  const shuffled = albionOnlyPool.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const albionOnlyTargets = shuffled.slice(0, MAX_ALBION_ONLY_PER_RUN)

  for (const r of albionOnlyTargets) {
    const playerId = r.albion_player_id
    const member: MemberForRow = {
      discord_id: null,
      username: r.albion_player_name,
      albion_player_id: playerId,
    }
    try {
      const newRows = await pollAndBuildRows(baseUrl, playerId, member, guildId)
      if (newRows.length > 0) {
        const { error, count } = await db
          .from('killboard_events')
          .upsert(newRows, { onConflict: 'event_id,role', ignoreDuplicates: true, count: 'exact' })
        if (error) {
          errors.push({ member: r.albion_player_name, step: 'upsert-albion-only', message: error.message })
        } else {
          upserted += count ?? 0
        }
      }
    } catch (e) {
      errors.push({
        member: r.albion_player_name,
        step: 'fetch-events-albion-only',
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
    albion_only_pool: albionOnlyPool.length,
    albion_only_polled: albionOnlyTargets.length,
    events_upserted: upserted,
    errors,
    duration_ms: Date.now() - startedAt,
  }
}

async function pollAndBuildRows(
  baseUrl: string,
  playerId: string,
  member: MemberForRow,
  guildId: string,
) {
  const [kills, deaths] = await Promise.all([
    fetchEvents(baseUrl, playerId, 'kills'),
    fetchEvents(baseUrl, playerId, 'deaths'),
  ])
  return [
    ...kills.map((e) => toRow(e, 'killer', member, playerId, guildId)),
    ...deaths.map((e) => toRow(e, 'victim', member, playerId, guildId)),
  ]
}

function toRow(
  e: KillboardEvent,
  role: 'killer' | 'victim',
  member: MemberForRow,
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
    // 자기 자신의 Equipment 를 저장. victim 만 저장하던 과거 설계는 자동 리기어
    // 용도로 충분했지만, 0데스 킬러(항상 살아남는 DPS) 의 무기 통계가 비는
    // 문제가 있어 양쪽 모두 저장으로 전환.
    equipment: self.Equipment ?? null,
    battle_id: e.BattleId ?? null,
  }
}
