import { NextResponse } from 'next/server'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveAlbionServer } from '@/lib/killboard'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { getSuperAdminSession } from '@/lib/super-admin'
import { withNoStore } from '@/lib/no-store-response'

// 슈퍼어드민 전용 일회성 백필. killboard_events.battle_id 는 마이그 096 부터 채워지므로
// 그 이전 sync 행은 NULL. tracked-kills 매칭이 battle_id 정확 매칭을 우선하기 때문에
// 기존 NULL 행은 시간창 폴백에 의지하게 된다 — 1:1 갱킹이 동시간대 트래킹 배틀에
// 잘못 흡수되는 원인. 이 엔드포인트는 멤버별 /players/{id}/{kills,deaths} 응답에서
// EventId → BattleId 매핑을 받아 NULL 행을 UPDATE 한다.
//
// killboard-sync 는 ignoreDuplicates: true 로 upsert 하므로 재동기화로는 NULL 이
// 채워지지 않아 별도 백필이 필요하다.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

// /players/{id}/{kills,deaths} 한 번에 최대 50건. range=month 로 최근 30일치를
// 한 번의 호출로 충분히 커버.
const PLAYER_EVENTS_LIMIT = 50
const API_DELAY_MS = 250

function json(body: unknown, init?: ResponseInit) {
  return withNoStore(NextResponse.json(body, init))
}

interface PlayerEventResponse {
  EventId: number
  BattleId?: number
}

async function fetchPlayerEvents(
  baseUrl: string,
  playerId: string,
  kind: 'kills' | 'deaths',
): Promise<PlayerEventResponse[]> {
  const url = `${baseUrl}/players/${encodeURIComponent(playerId)}/${kind}?range=month&limit=${PLAYER_EVENTS_LIMIT}&offset=0`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-backfill/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as PlayerEventResponse[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST() {
  const session = await getSuperAdminSession()
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  // NULL 행을 가진 distinct albion_player_id 를 모은다. left_at 무관 — 이미
  // 떠난 멤버의 과거 killboard 행도 통계에서 살아 있으므로 백필 필요.
  const { data: nullRows, error: queryError } = await db
    .from('killboard_events')
    .select('albion_player_id, event_id')
    .eq('guild_id', guildId)
    .is('battle_id', null)
    .not('albion_player_id', 'is', null)
  if (queryError) {
    return json({ error: queryError.message }, { status: 500 })
  }

  const nullEventCount = nullRows?.length ?? 0
  const playerIds = Array.from(
    new Set(
      (nullRows ?? [])
        .map((r) => r.albion_player_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  )

  // resolveAlbionServer 는 미설정 시 throw — 운영자가 backfill 누른 시점에
  // 명시 설정이 비어 있는 거 자체가 사고이므로 400 으로 분명히 표면화.
  let server: AlbionServer
  try {
    server = await resolveAlbionServer(guildId)
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : 'albion_server not configured' },
      { status: 400 },
    )
  }
  const baseUrl = SERVER_ENDPOINTS[server]

  // event_id → battle_id 매핑. 같은 event_id 가 killer/victim 양쪽에서 잡힐 수
  // 있지만 BattleId 는 동일하므로 마지막 값으로 덮어써도 무방.
  const eventToBattle = new Map<number, number>()
  const errors: Array<{ player_id: string; step: string; message: string }> = []

  for (const playerId of playerIds) {
    try {
      const kills = await fetchPlayerEvents(baseUrl, playerId, 'kills')
      await sleep(API_DELAY_MS)
      const deaths = await fetchPlayerEvents(baseUrl, playerId, 'deaths')
      await sleep(API_DELAY_MS)
      for (const e of [...kills, ...deaths]) {
        if (typeof e.EventId === 'number' && typeof e.BattleId === 'number') {
          eventToBattle.set(e.EventId, e.BattleId)
        }
      }
    } catch (e) {
      errors.push({
        player_id: playerId,
        step: 'fetch',
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // event_id 단위로 UPDATE. killer/victim 두 행이 동시에 영향받으므로 role
  // 필터는 걸지 않는다.
  let updated = 0
  let unmatched = 0
  for (const [eventId, battleId] of eventToBattle) {
    const { error, count } = await db
      .from('killboard_events')
      .update({ battle_id: battleId }, { count: 'exact' })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .is('battle_id', null)
    if (error) {
      errors.push({
        player_id: '',
        step: `update event=${eventId}`,
        message: error.message,
      })
    } else {
      updated += count ?? 0
    }
  }

  // 매칭 못 한 NULL 행 — Albion API 의 month 윈도우 밖이라 응답에 없음.
  unmatched = Math.max(0, nullEventCount - updated)

  return json({
    server,
    null_rows_before: nullEventCount,
    distinct_players: playerIds.length,
    events_resolved_from_api: eventToBattle.size,
    rows_updated: updated,
    rows_still_null: unmatched,
    errors,
  })
}
