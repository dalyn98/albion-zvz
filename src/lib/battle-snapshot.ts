// 활성 배틀 윈도우 동안 서버 전역 `/events` 엔드포인트를 폴링해 모든 킬을
// `battle_kill_snapshots` 에 append. 이 데이터는 `/lib/battle-aggregate.ts`
// 가 최종 승/패 판정을 내릴 때 쓰는 입력.
//
// 설계:
//   - 이벤트가 `battle_started_at` 을 세팅하면 자동으로 `battles` 행이 생성된다
//     (여기서는 snapshot_fetched_at 갱신만). 최초 생성은 이벤트 시작 액션에서
//     해야 하지만, 이 모듈은 cron 에서만 호출되므로 "아직 행이 없으면 지금
//     만든다" 방어도 함께 수행 — 과거 이벤트 backfill 을 쉽게 한다.
//   - `/events?limit=51&offset=0` 만 호출. Albion API 가 timestamp 필터를
//     지원하지 않아 sort=recent 역순을 그대로 받음. 5분 주기로 돌면 한 tick
//     당 새로 들어오는 킬 수를 다 커버할 수 있다 (피크 타임에도 서버 전체가
//     분당 30건 이하).
//   - upsert 는 (battle_id, event_id) PK 로 ignoreDuplicates — 같은 킬이 여러
//     배틀에 매치되면 첫 배틀에만 기록, 나머지는 무시한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveAlbionServer, type AlbionServer } from './killboard'

const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

// Albion `/events` 기본 페이지 크기. 공식 API 는 51 까지 허용.
const EVENTS_PAGE_SIZE = 51
// 한 번의 polling 에서 페이지를 최대 몇 장 가져올지. 알비온은 200v200
// 교전까지 발생하므로 5분 tick 당 300+ 건을 커버해야 한다. 모든 활성 배틀의
// 가장 오래된 윈도우 시작점 이전 이벤트가 나오면 중간에 조기 종료하므로,
// 평소엔 3페이지 근처에서 끊긴다.
const MAX_PAGES_PER_RUN = 6

interface PlayerRef {
  Name: string
  GuildName: string | null
}

interface KillboardEvent {
  EventId: number
  TimeStamp: string
  TotalVictimKillFame?: number
  Killer: PlayerRef
  Victim: PlayerRef
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-battle-snapshot/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`killboard ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

async function fetchEventsPage(baseUrl: string, offset: number): Promise<KillboardEvent[]> {
  const url = `${baseUrl}/events?limit=${EVENTS_PAGE_SIZE}&offset=${offset}&sort=recent`
  const data = await fetchJson<KillboardEvent[]>(url)
  return Array.isArray(data) ? data : []
}

export interface ActiveBattle {
  battle_id: string
  event_id: string
  window_start: string
  window_end: string
}

// 현재 시각이 `[window_start, window_end]` 구간 안에 있는 배틀을 반환.
// 이벤트가 `battle_started_at` 을 세팅하면 `ensureBattle` 이 앞서 생성한다.
async function listActiveBattles(db: SupabaseClient): Promise<ActiveBattle[]> {
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('battles')
    .select('id, event_id, window_start, window_end')
    .lte('window_start', nowIso)
    .gte('window_end', nowIso)
  if (error) throw new Error(`battles query failed: ${error.message}`)
  return (data ?? []).map((r) => ({
    battle_id: r.id as string,
    event_id: r.event_id as string,
    window_start: r.window_start as string,
    window_end: r.window_end as string,
  }))
}

// 킬 타임스탬프가 배틀 윈도우에 포함되면 그 배틀로 분류. 여러 배틀이 겹치면
// 첫 번째 매치를 쓴다(overlap 은 드물지만 정리 편의를 위해 결정적으로 처리).
function matchBattle(eventTimeIso: string, actives: ActiveBattle[]): ActiveBattle | null {
  const t = Date.parse(eventTimeIso)
  if (!Number.isFinite(t)) return null
  for (const b of actives) {
    const s = Date.parse(b.window_start)
    const e = Date.parse(b.window_end)
    if (Number.isFinite(s) && Number.isFinite(e) && t >= s && t <= e) return b
  }
  return null
}

export interface BattleSnapshotResult {
  server: AlbionServer
  active_battles: number
  pages_fetched: number
  events_scanned: number
  snapshots_inserted: number
}

export async function pollBattleSnapshots(db: SupabaseClient): Promise<BattleSnapshotResult> {
  const server = await resolveAlbionServer()
  const baseUrl = SERVER_ENDPOINTS[server]

  const actives = await listActiveBattles(db)
  if (actives.length === 0) {
    return {
      server,
      active_battles: 0,
      pages_fetched: 0,
      events_scanned: 0,
      snapshots_inserted: 0,
    }
  }

  let pagesFetched = 0
  let eventsScanned = 0
  let inserted = 0
  type SnapshotRow = {
    battle_id: string
    event_id: number
    occurred_at: string
    killer_name: string | null
    killer_guild: string | null
    victim_name: string | null
    victim_guild: string | null
    fame: number
  }
  const rows: SnapshotRow[] = []

  // 조기 종료 기준: 모든 활성 배틀 중 가장 빠른 윈도우 시작점. 그보다 오래된
  // 이벤트가 페이지에 나오기 시작하면 더 뒤로 가봐야 매치 안 되므로 중단.
  const oldestWindowStartMs = Math.min(
    ...actives.map((a) => Date.parse(a.window_start)),
  )

  for (let page = 0; page < MAX_PAGES_PER_RUN; page += 1) {
    const events = await fetchEventsPage(baseUrl, page * EVENTS_PAGE_SIZE)
    pagesFetched += 1
    if (events.length === 0) break
    eventsScanned += events.length
    let allOlder = true
    for (const e of events) {
      const battle = matchBattle(e.TimeStamp, actives)
      if (battle) {
        rows.push({
          battle_id: battle.battle_id,
          event_id: e.EventId,
          occurred_at: e.TimeStamp,
          killer_name: e.Killer?.Name ?? null,
          killer_guild: e.Killer?.GuildName ?? null,
          victim_name: e.Victim?.Name ?? null,
          victim_guild: e.Victim?.GuildName ?? null,
          fame: e.TotalVictimKillFame ?? 0,
        })
      }
      const t = Date.parse(e.TimeStamp)
      if (Number.isFinite(t) && t >= oldestWindowStartMs) allOlder = false
    }
    if (allOlder) break
  }

  if (rows.length > 0) {
    const { error, count } = await db
      .from('battle_kill_snapshots')
      .upsert(rows, { onConflict: 'battle_id,event_id', ignoreDuplicates: true, count: 'exact' })
    if (error) throw new Error(`snapshot upsert failed: ${error.message}`)
    inserted = count ?? 0
  }

  if (actives.length > 0) {
    const nowIso = new Date().toISOString()
    await db
      .from('battles')
      .update({ snapshot_fetched_at: nowIso })
      .in(
        'id',
        actives.map((a) => a.battle_id),
      )
  }

  return {
    server,
    active_battles: actives.length,
    pages_fetched: pagesFetched,
    events_scanned: eventsScanned,
    snapshots_inserted: inserted,
  }
}

// 이벤트의 battle_started_at 이 세팅된 직후에 이 함수를 호출해 배틀 행을
// 선생성한다. 이미 있으면 no-op.
export async function ensureBattleForEvent(
  db: SupabaseClient,
  eventId: string,
  battleStartedAt: string,
  windowHours: number,
): Promise<void> {
  const { data: existing } = await db
    .from('battles')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle()
  if (existing) return
  const windowEnd = new Date(
    Date.parse(battleStartedAt) + windowHours * 60 * 60 * 1000,
  ).toISOString()
  await db.from('battles').insert({
    event_id: eventId,
    window_start: battleStartedAt,
    window_end: windowEnd,
  })
}
