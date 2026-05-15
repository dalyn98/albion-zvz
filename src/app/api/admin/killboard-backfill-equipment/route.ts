import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveAlbionServer } from '@/lib/killboard'
import type { AlbionServer } from '@/lib/albion-gameinfo'

// 관리자 전용 일회성 백필. killboard_events 의 role='killer' 행은 예전 sync
// 설계상 equipment 가 null 로 저장됐다. 0데스 킬러(DPS 등) 의 무기 통계를
// 가능하게 하려면 Albion /events/{id} 에서 Killer.Equipment 를 받아 채워야 한다.
//
// 기본은 tenant_battle_records 시간창 안의 행만 (업적/통계에 반영되는 범위).
// all=1 쿼리스트링으로 전체 범위 확장 가능.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SERVER_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}

const API_DELAY_MS = 250

interface AlbionEventResponse {
  EventId: number
  Killer: { Equipment?: Record<string, unknown> | null }
  Victim: { Equipment?: Record<string, unknown> | null }
}

async function fetchEvent(baseUrl: string, eventId: number): Promise<AlbionEventResponse | null> {
  const url = `${baseUrl}/events/${eventId}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'albion-zvz-backfill/1.0' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as AlbionEventResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  const url = new URL(req.url)
  const scope = url.searchParams.get('all') === '1' ? 'all' : 'tracked'

  // tenant_battle_records 창 안의 killer + null equipment 만 대상.
  // 2-way JOIN 은 PostgREST 필터 체인으로 가능하지만, in-window 계산은
  // RPC 나 SQL 쪽이 간편 — 관리 API 로 한 번에 내린다.
  const { data: targetRows, error: queryError } =
    scope === 'tracked'
      ? await db.rpc('killboard_killer_rows_needing_equipment', { p_guild_id: guildId })
      : await db
          .from('killboard_events')
          .select('event_id')
          .eq('guild_id', guildId)
          .eq('role', 'killer')
          .is('equipment', null)
  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 })
  }

  const eventIds = Array.from(
    new Set(
      ((targetRows as Array<{ event_id: number | null }> | null) ?? [])
        .map((r) => r.event_id)
        .filter((id): id is number => typeof id === 'number'),
    ),
  )

  let server: AlbionServer
  try {
    server = await resolveAlbionServer(guildId)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'albion_server not configured' },
      { status: 400 },
    )
  }
  const baseUrl = SERVER_ENDPOINTS[server]

  let updated = 0
  let missingRemote = 0
  const errors: Array<{ event_id: number; message: string }> = []

  for (const eventId of eventIds) {
    try {
      const event = await fetchEvent(baseUrl, eventId)
      await sleep(API_DELAY_MS)
      if (!event) {
        missingRemote += 1
        continue
      }
      const killerEquipment = event.Killer?.Equipment ?? null
      if (!killerEquipment) continue
      const { error, count } = await db
        .from('killboard_events')
        .update({ equipment: killerEquipment }, { count: 'exact' })
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
        .eq('role', 'killer')
        .is('equipment', null)
      if (error) {
        errors.push({ event_id: eventId, message: error.message })
      } else {
        updated += count ?? 0
      }
    } catch (e) {
      errors.push({
        event_id: eventId,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json(
    {
      scope,
      server,
      candidate_events: eventIds.length,
      rows_updated: updated,
      events_missing_remote: missingRemote,
      errors,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
