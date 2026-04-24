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
  isSizeCategory,
  type AlbionBattle,
  type SizeCategory,
} from '@/lib/albion-battles'
import {
  buildBattleRecordRow,
  buildTenantBattleRow,
  type TenantBattleRow,
} from '@/lib/battle-tracking-helpers'

// 15분 주기로 돌면서 battle_tracking_enabled = true 인 테넌트들의 홈 길드가 참여한
// 공개 전투를 수집한다.
//
// 호출 규약: Authorization: Bearer <CRON_SECRET> 로 GET. .github/workflows/
// battle-tracker.yml (Vercel Hobby 플랜 정책상 GitHub Actions 사용).
//
// 동작:
//   1. tenants 순회 → enabled + sizes + server + homeGuild 를 가진 tenant 목록 수집.
//   2. server 별로 그룹 → 서버 당 fetchRecentBattles 1회 (limit=100).
//   3. 각 battle 을 battle_records 에 upsert (tenant 중립, (server,id) UNIQUE).
//   4. 해당 server 의 각 enabled tenant 에 대해 계산 → 규모 필터 → tenant_
//      battle_records upsert.
//
// Limit=100 이유: /battles 는 기본 sort=recent 이고 15분 tick 에 100건이면
// 대부분 상황에서 최근 1시간+ 가 커버돼 다음 폴링에서 누락 위험 작음. 부하도
// 안전한 범위.

export const dynamic = 'force-dynamic'

interface TenantTrackingInfo {
  tenantId: string
  server: AlbionServer
  homeGuildId: string
  sizes: Set<SizeCategory>
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

  const db = getAdminClient()
  const tenants = await listActiveTenants()

  const tracking: TenantTrackingInfo[] = []
  for (const tenant of tenants) {
    const [enabledRaw, sizesRaw, homeGuildId, serverRaw] = await Promise.all([
      getAppSetting('battle_tracking_enabled', 'false', tenant.id),
      getAppSetting('battle_tracking_sizes', '[]', tenant.id),
      getAppSetting('albion_home_guild_id', '', tenant.id),
      getAppSetting('albion_server', 'east', tenant.id),
    ])
    if (enabledRaw !== 'true') continue
    if (!homeGuildId) continue
    if (!isAlbionServer(serverRaw)) continue
    let sizes: SizeCategory[] = []
    try {
      const parsed = JSON.parse(sizesRaw)
      if (Array.isArray(parsed)) sizes = parsed.filter(isSizeCategory)
    } catch {
      continue
    }
    if (sizes.length === 0) continue
    tracking.push({
      tenantId: tenant.id,
      server: serverRaw,
      homeGuildId,
      sizes: new Set(sizes),
    })
  }

  if (tracking.length === 0) {
    return NextResponse.json({ skipped: 'no-enabled-tenants' })
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
      battles = await fetchRecentBattles(server, 100)
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

    // 이 서버를 쓰는 enabled tenant 들에 대해 각 battle 별로 계산 → 필터 → upsert.
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
          enabledSizes: tenant.sizes,
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
    enabled_tenants: tracking.length,
    servers: results,
  })
}
