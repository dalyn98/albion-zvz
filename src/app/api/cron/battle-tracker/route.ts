import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { listActiveTenants } from '@/lib/tenant'
import {
  ALBION_SERVERS,
  isAlbionServer,
  type AlbionServer,
} from '@/lib/albion-gameinfo'
import {
  fetchRecentBattles,
  type AlbionBattle,
} from '@/lib/albion-battles'
import {
  buildBattleRecordRow,
  buildTenantBattleRow,
  type TenantBattleRow,
} from '@/lib/battle-tracking-helpers'

// 5분 주기로 돌면서 home_guild_id + server 가 설정된 모든 테넌트의 홈 길드가
// 참여한 공개 전투를 수집한다. 규모 카테고리(small/middle/large/zerg) 는
// buildTenantBattleRow 가 자동 판정 — 어드민 토글/체크박스 제거.
//
// 호출 규약: Authorization: Bearer <CRON_SECRET>. Vercel Pro native cron 으로
// 등록 (vercel.json) — Vercel 이 자동으로 Bearer 헤더를 붙인다. 수동 백필은
// /super-admin 의 "지금 동기화" 버튼이 ?pages=20 으로 깊게 호출.
//
// 동작:
//   1. tenants 순회 → server + homeGuild 를 가진 tenant 목록 수집.
//   2. server 별로 그룹 → 서버 당 fetchRecentBattles (50*pages 건).
//   3. 각 battle 을 battle_records 에 upsert (tenant 중립, (server,id) UNIQUE).
//   4. 해당 server 의 각 tenant 에 대해 계산 → 자동 규모 분류 → tenant_
//      battle_records upsert.
//
// 페이지 크기: Albion API 가 limit ≤ 51 만 허용해 50/페이지. 기본 2페이지(=100건,
// 피크 타임 ~10분 커버) → 5분 주기 cron 에 안전 마진. 수동 백필 시 ?pages=N
// (1~20) 로 더 깊게 가져올 수 있음.

export const dynamic = 'force-dynamic'

interface TenantTrackingInfo {
  tenantId: string
  server: AlbionServer
  homeGuildId: string
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // pages 쿼리스트링으로 fetchRecentBattles 의 페이지 수 조절. Albion API 는
  // 전투가 끝난 직후 즉시 노출하지 않고 5~10분 publishing 지연이 있어, pages=2
  // (=100건) 로는 피크 시간대에 publishing 지연 동안 100건 이상 신규 전투가
  // 끼어들면서 누락이 발생함. 기본 6페이지(=300건, ~20-30분 커버) 로 안전 마진
  // 확보. 수동 백필은 ?pages=20 까지 허용 (50*20=1000건).
  const url = new URL(request.url)
  const pagesParam = Number.parseInt(url.searchParams.get('pages') ?? '', 10)
  const pages = Number.isFinite(pagesParam)
    ? Math.min(Math.max(pagesParam, 1), 20)
    : 6

  const db = getAdminClient()
  const tenants = await listActiveTenants()

  const tracking: TenantTrackingInfo[] = []
  for (const tenant of tenants) {
    const [homeGuildId, serverRaw] = await Promise.all([
      getAppSetting('albion_home_guild_id', '', tenant.id),
      getAppSetting('albion_server', 'east', tenant.id),
    ])
    if (!homeGuildId) continue
    if (!isAlbionServer(serverRaw)) continue
    tracking.push({
      tenantId: tenant.id,
      server: serverRaw,
      homeGuildId,
    })
  }

  if (tracking.length === 0) {
    return NextResponse.json({ skipped: 'no-tracked-tenants' })
  }

  const serversInUse: AlbionServer[] = ALBION_SERVERS.filter((s) =>
    tracking.some((t) => t.server === s),
  )

  const results: Array<{
    server: AlbionServer
    battles_fetched: number
    battle_records_upserted: number
    tenant_records_upserted: number
    errors: string[]
  }> = []

  for (const server of serversInUse) {
    const errors: string[] = []
    let battles: AlbionBattle[] = []
    try {
      battles = await fetchRecentBattles(server, pages)
    } catch (e) {
      errors.push(`fetchRecentBattles: ${e instanceof Error ? e.message : String(e)}`)
      results.push({
        server,
        battles_fetched: 0,
        battle_records_upserted: 0,
        tenant_records_upserted: 0,
        errors,
      })
      continue
    }

    if (battles.length === 0) {
      results.push({
        server,
        battles_fetched: 0,
        battle_records_upserted: 0,
        tenant_records_upserted: 0,
        errors,
      })
      continue
    }

    // battle_records 에 먼저 upsert (tenant 무관). onConflict (server, id) 로
    // 중복 방지. 반환된 id 는 tenant row 작성에 필요.
    const battleRows = battles.map((b) => buildBattleRecordRow(b, server))
    const { data: upserted, error: upErr } = await db
      .from('battle_records')
      .upsert(battleRows, { onConflict: 'albion_server,albion_battle_id' })
      .select('id, albion_battle_id')
    if (upErr) {
      errors.push(`battle_records upsert: ${upErr.message}`)
      results.push({
        server,
        battles_fetched: battles.length,
        battle_records_upserted: 0,
        tenant_records_upserted: 0,
        errors,
      })
      continue
    }
    const battleRecordIdMap = new Map<number, string>()
    for (const r of upserted ?? []) {
      battleRecordIdMap.set(r.albion_battle_id as number, r.id as string)
    }

    // 이 서버를 쓰는 tenant 들에 대해 각 battle 별로 계산 → 자동 규모 분류 → upsert.
    const serverTenants = tracking.filter((t) => t.server === server)
    const tenantRows: TenantBattleRow[] = []
    for (const tenant of serverTenants) {
      for (const battle of battles) {
        const battleRecordId = battleRecordIdMap.get(battle.id)
        if (!battleRecordId) continue
        const row = buildTenantBattleRow({
          guildId: tenant.tenantId,
          battleRecordId,
          battle,
          homeGuildId: tenant.homeGuildId,
          startedAt: battle.startTime,
        })
        if (row) tenantRows.push(row)
      }
    }

    let tenantUpserted = 0
    if (tenantRows.length > 0) {
      const { error: tErr } = await db
        .from('tenant_battle_records')
        .upsert(tenantRows, { onConflict: 'guild_id,battle_record_id' })
      if (tErr) {
        errors.push(`tenant_battle_records upsert: ${tErr.message}`)
      } else {
        tenantUpserted = tenantRows.length
      }
    }

    results.push({
      server,
      battles_fetched: battles.length,
      battle_records_upserted: upserted?.length ?? 0,
      tenant_records_upserted: tenantUpserted,
      errors,
    })
  }

  return NextResponse.json({
    tracked_tenants: tracking.length,
    pages,
    servers: results,
  })
}

export const maxDuration = 300
