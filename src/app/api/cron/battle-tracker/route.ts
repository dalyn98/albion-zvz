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
  fetchBattleById,
  fetchRecentBattles,
  type AlbionBattle,
} from '@/lib/albion-battles'
import {
  buildBattleRecordRow,
  buildFinalMatchupRows,
  buildProvisionalTenantRow,
  type KillboardPair,
  type TenantBattleRow,
} from '@/lib/battle-tracking-helpers'

// killboard_events 가 hint 한 battle_id 중 battle_records 에 없는 것을 ID 로
// 직접 fetch 해 채우는 백필 윈도. /battles?sort=recent 가 인스턴스 간 결과
// 차이로 일부 battle 을 누락하므로 이 fallback 이 필요. 30분이면 cron 1회당 최대
// 30~60개 정도라 API 부하는 무시 가능.
const BACKFILL_LOOKBACK_MS = 30 * 60 * 1000
// 1 cron tick 에 너무 많은 battle 을 backfill 하면 maxDuration 위협 — 상한.
const MAX_BACKFILL_PER_TICK = 80

// Provisional → final 재평가 윈도. battle 종료 후 6h 안에 killboard_events 가
// 안정되어 매치업이 확정된다는 가정. 너무 짧으면(<1h) killboard sync 지연 시
// "교전 없음" 으로 잘못 판정될 위험, 너무 길면 매번 cron 마다 큰 SELECT.
const REEVALUATE_LOOKBACK_MS = 6 * 60 * 60 * 1000

// 5분 주기로 돌면서 home_guild_id + server 가 설정된 모든 테넌트의 홈 길드가
// 참여한 공개 전투를 수집한다. 규모 카테고리(small/middle/large/zerg) 는
// buildProvisionalTenantRow 가 max(home, mainOpp) 기준으로 자동 판정.
//
// 호출 규약: Authorization: Bearer <CRON_SECRET>. Vercel Pro native cron 으로
// 등록 (vercel.json) — Vercel 이 자동으로 Bearer 헤더를 붙인다. 수동 백필은
// /super-admin 의 "지금 동기화" 버튼이 ?pages=20 으로 깊게 호출.
//
// 동작:
//   1. tenants 순회 → server + homeGuild 를 가진 tenant 목록 수집.
//   2. server 별로 그룹 → 서버 당 fetchRecentBattles (50*pages 건).
//   3. 각 battle 을 battle_records 에 upsert (tenant 중립, (server,id) UNIQUE).
//   4. 해당 server 의 각 tenant 에 대해 provisional row upsert (force_key='__pending__').
//   5. 재평가 패스: 최근 6h 의 provisional row 들을 killboard_events 페어와
//      매치업 판정 → 확정된 force 별 row 분리/저장. 페어 0건이면 row 삭제.
//
// 페이지 크기: Albion API 가 limit ≤ 51 만 허용해 50/페이지. 기본 6페이지(=300건,
// ~20-30분 커버) → 5분 주기 cron 에 안전 마진. 수동 백필 시 ?pages=N
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
    tenant_provisional_upserted: number
    backfill_attempted: number
    backfill_battle_records_upserted: number
    backfill_tenant_provisional_upserted: number
    backfill_404: number
    matchups_evaluated: number
    matchups_finalized_rows: number
    matchups_deleted: number
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
        tenant_provisional_upserted: 0,
        backfill_attempted: 0,
        backfill_battle_records_upserted: 0,
        backfill_tenant_provisional_upserted: 0,
        backfill_404: 0,
        matchups_evaluated: 0,
        matchups_finalized_rows: 0,
        matchups_deleted: 0,
        errors,
      })
      continue
    }

    let battleRecordsUpserted = 0
    let tenantProvisionalUpserted = 0
    let backfillAttempted = 0
    let backfillBR = 0
    let backfillTR = 0
    let backfill404 = 0
    let matchupsEvaluated = 0
    let matchupsFinalizedRows = 0
    let matchupsDeleted = 0

    if (battles.length > 0) {
      // battle_records 에 먼저 upsert (tenant 무관). onConflict (server, id) 로
      // 중복 방지. 반환된 id 는 tenant row 작성에 필요.
      const battleRows = battles.map((b) => buildBattleRecordRow(b, server))
      const { data: upserted, error: upErr } = await db
        .from('battle_records')
        .upsert(battleRows, { onConflict: 'albion_server,albion_battle_id' })
        .select('id, albion_battle_id')
      if (upErr) {
        errors.push(`battle_records upsert: ${upErr.message}`)
      } else {
        battleRecordsUpserted = upserted?.length ?? 0
        const battleRecordIdMap = new Map<number, string>()
        for (const r of upserted ?? []) {
          battleRecordIdMap.set(r.albion_battle_id as number, r.id as string)
        }

        // 이 서버를 쓰는 tenant 들에 대해 각 battle 별 provisional row 작성.
        const serverTenants = tracking.filter((t) => t.server === server)
        const provisionalRows: TenantBattleRow[] = []
        for (const tenant of serverTenants) {
          for (const battle of battles) {
            const battleRecordId = battleRecordIdMap.get(battle.id)
            if (!battleRecordId) continue
            const row = buildProvisionalTenantRow({
              guildId: tenant.tenantId,
              battleRecordId,
              battle,
              homeGuildId: tenant.homeGuildId,
              startedAt: battle.startTime,
            })
            if (row) provisionalRows.push(row)
          }
        }

        if (provisionalRows.length > 0) {
          const { error: tErr } = await db
            .from('tenant_battle_records')
            .upsert(provisionalRows, {
              onConflict: 'guild_id,battle_record_id,main_opponent_force_key',
              ignoreDuplicates: true,
            })
          if (tErr) {
            errors.push(`provisional upsert: ${tErr.message}`)
          } else {
            tenantProvisionalUpserted = provisionalRows.length
          }
        }
      }
    }

    // === Backfill 패스 ===
    // killboard_events.battle_id 가 hint 한 battle 중 battle_records 에 없는
    // 것을 /battles/{id} 로 직접 fetch. /battles?sort=recent 의 인스턴스 간
    // 결과 차이로 누락된 길드 참여 전투를 잡아낸다.
    const sinceIso = new Date(Date.now() - BACKFILL_LOOKBACK_MS).toISOString()
    const serverTenantsForBackfill = tracking.filter((t) => t.server === server)
    const tenantIdsForServer = serverTenantsForBackfill.map((t) => t.tenantId)
    const { data: hintRows, error: hintErr } = await db
      .from('killboard_events')
      .select('battle_id, guild_id')
      .in('guild_id', tenantIdsForServer)
      .gte('occurred_at', sinceIso)
      .not('battle_id', 'is', null)
    if (hintErr) {
      errors.push(`killboard hint query: ${hintErr.message}`)
    } else if (hintRows && hintRows.length > 0) {
      const candidateIds = new Set<number>()
      for (const r of hintRows) {
        if (typeof r.battle_id === 'number') candidateIds.add(r.battle_id)
      }
      const candidateArr = [...candidateIds]
      const { data: existing } = await db
        .from('battle_records')
        .select('albion_battle_id')
        .eq('albion_server', server)
        .in('albion_battle_id', candidateArr)
      const existingSet = new Set(
        (existing ?? []).map((r) => r.albion_battle_id as number),
      )
      const missing = candidateArr
        .filter((id) => !existingSet.has(id))
        .slice(0, MAX_BACKFILL_PER_TICK)

      const fetchedBattles: AlbionBattle[] = []
      for (const id of missing) {
        backfillAttempted++
        try {
          const battle = await fetchBattleById(server, id)
          if (battle === null) {
            backfill404++
            continue
          }
          fetchedBattles.push(battle)
        } catch (e) {
          errors.push(
            `backfill battle ${id}: ${e instanceof Error ? e.message : String(e)}`,
          )
        }
      }

      if (fetchedBattles.length > 0) {
        const rows = fetchedBattles.map((b) => buildBattleRecordRow(b, server))
        const { data: upBR, error: brErr } = await db
          .from('battle_records')
          .upsert(rows, { onConflict: 'albion_server,albion_battle_id' })
          .select('id, albion_battle_id')
        if (brErr) {
          errors.push(`backfill battle_records upsert: ${brErr.message}`)
        } else {
          backfillBR = upBR?.length ?? 0
          const idMap = new Map<number, string>()
          for (const r of upBR ?? []) {
            idMap.set(r.albion_battle_id as number, r.id as string)
          }
          const backfillRows: TenantBattleRow[] = []
          for (const tenant of serverTenantsForBackfill) {
            for (const battle of fetchedBattles) {
              const battleRecordId = idMap.get(battle.id)
              if (!battleRecordId) continue
              const row = buildProvisionalTenantRow({
                guildId: tenant.tenantId,
                battleRecordId,
                battle,
                homeGuildId: tenant.homeGuildId,
                startedAt: battle.startTime,
              })
              if (row) backfillRows.push(row)
            }
          }
          if (backfillRows.length > 0) {
            const { error: tErr } = await db
              .from('tenant_battle_records')
              .upsert(backfillRows, {
                onConflict: 'guild_id,battle_record_id,main_opponent_force_key',
                ignoreDuplicates: true,
              })
            if (tErr) {
              errors.push(`backfill provisional upsert: ${tErr.message}`)
            } else {
              backfillTR = backfillRows.length
            }
          }
        }
      }
    }

    // === 매치업 재평가 패스 ===
    // 최근 6h provisional row 들을 가져와 killboard_events 와 매치업 판정.
    // 페어 ≥1 발견된 force 별로 row 분리 / 페어 0 이면 row 삭제.
    try {
      const reevaluateSince = new Date(Date.now() - REEVALUATE_LOOKBACK_MS).toISOString()
      const evalRes = await reevaluateMatchups({
        db,
        server,
        tenantTracking: serverTenantsForBackfill,
        sinceIso: reevaluateSince,
      })
      matchupsEvaluated = evalRes.evaluated
      matchupsFinalizedRows = evalRes.finalized
      matchupsDeleted = evalRes.deleted
      for (const e of evalRes.errors) errors.push(e)
    } catch (e) {
      errors.push(`reevaluate: ${e instanceof Error ? e.message : String(e)}`)
    }

    results.push({
      server,
      battles_fetched: battles.length,
      battle_records_upserted: battleRecordsUpserted,
      tenant_provisional_upserted: tenantProvisionalUpserted,
      backfill_attempted: backfillAttempted,
      backfill_battle_records_upserted: backfillBR,
      backfill_tenant_provisional_upserted: backfillTR,
      backfill_404: backfill404,
      matchups_evaluated: matchupsEvaluated,
      matchups_finalized_rows: matchupsFinalizedRows,
      matchups_deleted: matchupsDeleted,
      errors,
    })
  }

  // 자동 리기어의 stage 1 (tracked battle 매칭) 가드를 위한 sync 시각 기록.
  // 한 번이라도 fetch 가 성공한 이번 run 의 시작 시각(nowIso) 을 저장 — server 별
  // 일부 errors 가 있어도 tenant_battle_records upsert 는 시도된 상태이므로
  // auto-regear 가 "이번 cron 이후 데이터로 판단해도 됨" 으로 받아들인다.
  // killboard-sync 와 동일한 패턴(per-tenant upsert with onConflict).
  const nowIso = new Date().toISOString()
  for (const t of tracking) {
    await db
      .from('app_settings')
      .upsert(
        {
          guild_id: t.tenantId,
          key: 'last_battle_tracker_sync_at',
          value: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'guild_id,key' },
      )
  }

  return NextResponse.json({
    tracked_tenants: tracking.length,
    pages,
    servers: results,
  })
}

// 매치업 재평가. provisional row 별로:
//   1. 해당 battle 의 raw_battle 가져옴
//   2. killboard_events 에서 (guild_id, battle_id) 의 페어 (role + opponent_guild) 조회
//   3. buildFinalMatchupRows 로 force 별 row 생성
//   4. ≥1 row → 기존 (guild_id, battle_record_id) 의 provisional 행 삭제 후 final upsert
//      0 row → 기존 provisional 삭제 (교전 없음 = 같은 battle 에 참여만 했을 뿐)
async function reevaluateMatchups(input: {
  db: ReturnType<typeof getAdminClient>
  server: AlbionServer
  tenantTracking: TenantTrackingInfo[]
  sinceIso: string
}): Promise<{ evaluated: number; finalized: number; deleted: number; errors: string[] }> {
  const { db, server, tenantTracking, sinceIso } = input
  const errors: string[] = []
  let evaluated = 0
  let finalized = 0
  let deleted = 0

  if (tenantTracking.length === 0) {
    return { evaluated, finalized, deleted, errors }
  }
  const tenantIds = tenantTracking.map((t) => t.tenantId)
  const homeGuildByTenant = new Map(
    tenantTracking.map((t) => [t.tenantId, t.homeGuildId] as const),
  )

  // provisional row 조회 — 같은 (guild_id, battle_record_id) 가 1번씩만 나오게
  // force_key='__pending__' 으로 필터.
  const { data: provRows, error: provErr } = await db
    .from('tenant_battle_records')
    .select(
      'id, guild_id, battle_record_id, started_at, battle_records!inner(albion_battle_id, raw_battle)',
    )
    .in('guild_id', tenantIds)
    .eq('is_provisional', true)
    .eq('main_opponent_force_key', '__pending__')
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false })
    .limit(200)

  if (provErr) {
    errors.push(`provisional select: ${provErr.message}`)
    return { evaluated, finalized, deleted, errors }
  }
  if (!provRows || provRows.length === 0) {
    return { evaluated, finalized, deleted, errors }
  }

  const evaluatedAt = new Date().toISOString()

  for (const prov of provRows) {
    const tenantId = prov.guild_id as string
    const battleRecordId = prov.battle_record_id as string
    const homeGuildId = homeGuildByTenant.get(tenantId)
    if (!homeGuildId) continue
    const brJoin = prov.battle_records as
      | { albion_battle_id: number; raw_battle: AlbionBattle }
      | { albion_battle_id: number; raw_battle: AlbionBattle }[]
      | null
    const br = Array.isArray(brJoin) ? brJoin[0] : brJoin
    if (!br) continue
    const battle = br.raw_battle
    if (!battle) continue
    const albionBattleId = br.albion_battle_id

    evaluated++

    // killboard_events 에서 (guild_id, battle_id) pair 조회
    const { data: pairRows, error: pairErr } = await db
      .from('killboard_events')
      .select('role, opponent_guild, fame')
      .eq('guild_id', tenantId)
      .eq('battle_id', albionBattleId)
    if (pairErr) {
      errors.push(`killboard pairs (battle ${albionBattleId}): ${pairErr.message}`)
      continue
    }
    const pairs: KillboardPair[] = (pairRows ?? []).map((r) => ({
      role: r.role as 'killer' | 'victim',
      opponentGuild: (r.opponent_guild as string | null) ?? null,
      fame: (r.fame as number | null) ?? 0,
    }))

    const finalRows = buildFinalMatchupRows({
      guildId: tenantId,
      battleRecordId,
      battle,
      homeGuildId,
      startedAt: prov.started_at as string,
      killboardPairs: pairs,
      evaluatedAt,
    })

    // 같은 (guild_id, battle_record_id) 의 모든 row 삭제 (provisional 포함)
    const { error: delErr } = await db
      .from('tenant_battle_records')
      .delete()
      .eq('guild_id', tenantId)
      .eq('battle_record_id', battleRecordId)
    if (delErr) {
      errors.push(`delete provisional (battle ${albionBattleId}): ${delErr.message}`)
      continue
    }
    deleted++

    if (finalRows.length === 0) {
      // 교전 없음 — placeholder 만 삭제하고 끝.
      continue
    }

    const { error: insErr } = await db
      .from('tenant_battle_records')
      .insert(finalRows)
    if (insErr) {
      errors.push(`insert final (battle ${albionBattleId}): ${insErr.message}`)
      continue
    }
    finalized += finalRows.length
  }

  // ※ 서버 변수는 placeholder 호환을 위해 받아둠(추후 server 별 분기 시 사용).
  void server

  return { evaluated, finalized, deleted, errors }
}

export const maxDuration = 300
