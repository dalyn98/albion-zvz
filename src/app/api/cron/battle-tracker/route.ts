import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { listActiveTenants } from '@/lib/tenant'
import {
  ALBION_SERVERS,
  getGuild,
  isAlbionServer,
  type AlbionServer,
} from '@/lib/albion-gameinfo'
import {
  fetchBattleById,
  fetchRecentBattles,
  type AlbionBattle,
} from '@/lib/albion-battles'
import {
  buildBattleForceEdgeRows,
  buildBattleForceSummaryRows,
  buildBattleRecordRow,
  buildFinalMatchupRows,
  buildProvisionalTenantRow,
  type BattleForceEdgeEvent,
  type KillboardPair,
  type TenantBattleRow,
} from '@/lib/battle-tracking-helpers'
import { upsertBattleLedgerShadow } from '@/lib/battle-ledger-shadow-db'
import { refreshBattleProjectionDiffs } from '@/lib/battle-ledger-diff-db'
import { withCronRun } from '@/lib/cron-run'
import { parseBoundedInt } from '@/lib/parse-bounded-int'

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
const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off'])

function truthyFlag(value: string | null | undefined): boolean | null {
  if (value === null || value === undefined) return null
  const normalized = value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  return null
}

function isShadowSyncEnabled(url: URL): boolean {
  const queryOverride = truthyFlag(url.searchParams.get('shadow'))
  if (queryOverride !== null) return queryOverride
  return truthyFlag(process.env.BATTLE_LEDGER_SHADOW_SYNC_ENABLED) === true
}

function isProjectionDiffSyncEnabled(url: URL, shadowSyncEnabled: boolean): boolean {
  if (!shadowSyncEnabled) return false
  const queryOverride = truthyFlag(url.searchParams.get('projection_diffs'))
  if (queryOverride !== null) return queryOverride
  return truthyFlag(process.env.BATTLE_LEDGER_PROJECTION_DIFF_SYNC_ENABLED) === true
}

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
  homeGuildName: string
  homeAllianceId: string | null
}

interface TenantTrackingSettingRow {
  guild_id: string | null
  key: string | null
  value: string | null
}

async function loadTrackingSettings(
  db: ReturnType<typeof getAdminClient>,
  tenantIds: readonly string[],
): Promise<Map<string, Map<string, string>>> {
  if (tenantIds.length === 0) return new Map()
  const { data, error } = await db
    .from('app_settings')
    .select('guild_id, key, value')
    .in('guild_id', tenantIds)
    .in('key', ['albion_home_guild_id', 'albion_home_guild_name', 'albion_server'])

  if (error) {
    throw new Error(`tracking settings select: ${error.message}`)
  }

  const byTenant = new Map<string, Map<string, string>>()
  for (const row of (data ?? []) as TenantTrackingSettingRow[]) {
    if (!row.guild_id || !row.key || typeof row.value !== 'string') continue
    const settings = byTenant.get(row.guild_id) ?? new Map<string, string>()
    settings.set(row.key, row.value)
    byTenant.set(row.guild_id, settings)
  }
  return byTenant
}

function normalizeAlbionBattleId(value: number | string | null | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'battle-tracker', leaseSeconds: 600 }, async ({ db }) => {
  // pages 쿼리스트링으로 fetchRecentBattles 의 페이지 수 조절. Albion API 는
  // 전투가 끝난 직후 즉시 노출하지 않고 5~10분 publishing 지연이 있어, pages=2
  // (=100건) 로는 피크 시간대에 publishing 지연 동안 100건 이상 신규 전투가
  // 끼어들면서 누락이 발생함. 기본 6페이지(=300건, ~20-30분 커버) 로 안전 마진
  // 확보. 수동 백필은 ?pages=20 까지 허용 (50*20=1000건).
  const url = new URL(request.url)
  const pages = parseBoundedInt(url.searchParams.get('pages'), 1, 20) ?? 6
  const shadowSyncEnabled = isShadowSyncEnabled(url)
  const projectionDiffSyncEnabled = isProjectionDiffSyncEnabled(url, shadowSyncEnabled)

  const tenants = await listActiveTenants()
  const settingsByTenant = await loadTrackingSettings(db, tenants.map((tenant) => tenant.id))

  const tracking: TenantTrackingInfo[] = []
  for (const tenant of tenants) {
    const settings = settingsByTenant.get(tenant.id)
    const homeGuildId = settings?.get('albion_home_guild_id')?.trim() ?? ''
    const homeGuildNameRaw = settings?.get('albion_home_guild_name') ?? ''
    const serverRaw = settings?.get('albion_server') ?? ''
    if (!homeGuildId) continue
    // albion_server row 가 없으면 ('' 반환) skip — 'east' 로 silent 폴백하면
    // west/eu tenant 가 잘못된 server API 로 추적되어 battle_records 가 오염된다.
    if (!isAlbionServer(serverRaw)) continue
    const needsGuildLookup = shadowSyncEnabled || homeGuildNameRaw.trim().length === 0
    const guild = needsGuildLookup ? await getGuild(serverRaw, homeGuildId) : null
    tracking.push({
      tenantId: tenant.id,
      server: serverRaw,
      homeGuildId,
      homeGuildName: homeGuildNameRaw.trim() || guild?.Name || homeGuildId,
      homeAllianceId: guild?.AllianceId?.trim() || null,
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
    shadow_registry_entities: number
    shadow_snapshots: number
    shadow_participants: number
    shadow_projections: number
    projection_diffs_compared_battles: number
    projection_diffs_active: number
    projection_diffs_inserted: number
    projection_diffs_refreshed: number
    projection_diffs_reactivated: number
    projection_diffs_resolved: number
    force_summaries_upserted: number
    force_edges_upserted: number
    matchups_evaluated: number
    matchups_finalized_rows: number
    matchups_deleted: number
    errors: string[]
  }> = []
  const serversWithRecentBattleFetch = new Set<AlbionServer>()

  for (const server of serversInUse) {
    const errors: string[] = []
    let battles: AlbionBattle[] = []
    try {
      battles = await fetchRecentBattles(server, pages)
      serversWithRecentBattleFetch.add(server)
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
        shadow_registry_entities: 0,
        shadow_snapshots: 0,
        shadow_participants: 0,
        shadow_projections: 0,
        projection_diffs_compared_battles: 0,
        projection_diffs_active: 0,
        projection_diffs_inserted: 0,
        projection_diffs_refreshed: 0,
        projection_diffs_reactivated: 0,
        projection_diffs_resolved: 0,
        force_summaries_upserted: 0,
        force_edges_upserted: 0,
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
    let shadowRegistryEntities = 0
    let shadowSnapshots = 0
    let shadowParticipants = 0
    let shadowProjections = 0
    let projectionDiffsComparedBattles = 0
    let projectionDiffsActive = 0
    let projectionDiffsInserted = 0
    let projectionDiffsRefreshed = 0
    let projectionDiffsReactivated = 0
    let projectionDiffsResolved = 0
    let forceSummariesUpserted = 0
    let forceEdgesUpserted = 0
    let matchupsEvaluated = 0
    let matchupsFinalizedRows = 0
    let matchupsDeleted = 0
    const comparisonBattleRecordIds = new Set<string>()

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
          const battleRecordId = r.id as string
          battleRecordIdMap.set(r.albion_battle_id as number, battleRecordId)
          comparisonBattleRecordIds.add(battleRecordId)
        }

        // 이 서버를 쓰는 tenant 들에 대해 각 battle 별 provisional row 작성.
        const serverTenants = tracking.filter((t) => t.server === server)
        if (shadowSyncEnabled) {
          const shadowRes = await upsertBattleLedgerShadow({
            db,
            server,
            battles,
            battleRecordIdMap,
            tenants: serverTenants,
            fetchedAt: new Date().toISOString(),
          })
          shadowRegistryEntities += shadowRes.registryEntities
          shadowSnapshots += shadowRes.snapshots
          shadowParticipants += shadowRes.participants
          shadowProjections += shadowRes.projections
          for (const e of shadowRes.errors) errors.push(e)
        }

        const provisionalRows: TenantBattleRow[] = []
        const forceSummaryBattles = new Map<string, AlbionBattle>()
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
            if (row) {
              provisionalRows.push(row)
              forceSummaryBattles.set(battleRecordId, battle)
            }
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
            const forceSummaryRes = await upsertBattleForceSummaries(
              db,
              forceSummaryBattles,
            )
            forceSummariesUpserted += forceSummaryRes.upserted
            for (const e of forceSummaryRes.errors) errors.push(e)
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
            const battleRecordId = r.id as string
            idMap.set(r.albion_battle_id as number, battleRecordId)
            comparisonBattleRecordIds.add(battleRecordId)
          }
          if (shadowSyncEnabled) {
            const shadowRes = await upsertBattleLedgerShadow({
              db,
              server,
              battles: fetchedBattles,
              battleRecordIdMap: idMap,
              tenants: serverTenantsForBackfill,
              fetchedAt: new Date().toISOString(),
            })
            shadowRegistryEntities += shadowRes.registryEntities
            shadowSnapshots += shadowRes.snapshots
            shadowParticipants += shadowRes.participants
            shadowProjections += shadowRes.projections
            for (const e of shadowRes.errors) errors.push(e)
          }

          const backfillRows: TenantBattleRow[] = []
          const forceSummaryBattles = new Map<string, AlbionBattle>()
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
              if (row) {
                backfillRows.push(row)
                forceSummaryBattles.set(battleRecordId, battle)
              }
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
              const forceSummaryRes = await upsertBattleForceSummaries(
                db,
                forceSummaryBattles,
              )
              forceSummariesUpserted += forceSummaryRes.upserted
              for (const e of forceSummaryRes.errors) errors.push(e)
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
      forceEdgesUpserted += evalRes.forceEdgesUpserted
      for (const battleRecordId of evalRes.battleRecordIds) {
        comparisonBattleRecordIds.add(battleRecordId)
      }
      for (const e of evalRes.errors) errors.push(e)
    } catch (e) {
      errors.push(`reevaluate: ${e instanceof Error ? e.message : String(e)}`)
    }

    if (projectionDiffSyncEnabled) {
      const diffRes = await refreshBattleProjectionDiffs({
        db,
        battleRecordIds: [...comparisonBattleRecordIds],
        subjects: serverTenantsForBackfill.map((tenant) => ({
          tenantId: tenant.tenantId,
          homeGuildId: tenant.homeGuildId,
          homeGuildName: tenant.homeGuildName,
        })),
        comparedAt: new Date().toISOString(),
      })
      projectionDiffsComparedBattles = diffRes.comparedBattleRecords
      projectionDiffsActive = diffRes.activeDiffs
      projectionDiffsInserted = diffRes.insertedDiffs
      projectionDiffsRefreshed = diffRes.refreshedDiffs
      projectionDiffsReactivated = diffRes.reactivatedDiffs
      projectionDiffsResolved = diffRes.resolvedDiffs
      for (const e of diffRes.errors) errors.push(e)
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
      shadow_registry_entities: shadowRegistryEntities,
      shadow_snapshots: shadowSnapshots,
      shadow_participants: shadowParticipants,
      shadow_projections: shadowProjections,
      projection_diffs_compared_battles: projectionDiffsComparedBattles,
      projection_diffs_active: projectionDiffsActive,
      projection_diffs_inserted: projectionDiffsInserted,
      projection_diffs_refreshed: projectionDiffsRefreshed,
      projection_diffs_reactivated: projectionDiffsReactivated,
      projection_diffs_resolved: projectionDiffsResolved,
      force_summaries_upserted: forceSummariesUpserted,
      force_edges_upserted: forceEdgesUpserted,
      matchups_evaluated: matchupsEvaluated,
      matchups_finalized_rows: matchupsFinalizedRows,
      matchups_deleted: matchupsDeleted,
      errors,
    })
  }

  // 자동 리기어의 stage 1 (tracked battle 매칭) 가드를 위한 sync 시각 기록.
  // 해당 tenant 의 Albion server 에서 recent battles fetch 자체가 성공한 경우만 저장.
  // 서버 fetch 실패까지 성공 시각으로 찍으면 auto-regear 가 아직 동기화되지 않은
  // 데이터를 "확인 완료"로 오인할 수 있다. 이후 backfill/reevaluate 일부 errors 는
  // 결과 payload 에 남기되, recent fetch 성공 tenant 는 다음 stage 진행을 허용한다.
  // killboard-sync 와 동일한 패턴(per-tenant upsert with onConflict).
  const nowIso = new Date().toISOString()
  const syncTimestampTenants = tracking.filter((t) => serversWithRecentBattleFetch.has(t.server))
  for (const t of syncTimestampTenants) {
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
    sync_timestamped_tenants: syncTimestampTenants.length,
    pages,
    shadow_sync_enabled: shadowSyncEnabled,
    projection_diff_sync_enabled: projectionDiffSyncEnabled,
    servers: results,
  })
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
}): Promise<{
  evaluated: number
  finalized: number
  deleted: number
  forceEdgesUpserted: number
  battleRecordIds: string[]
  errors: string[]
}> {
  const { db, server, tenantTracking, sinceIso } = input
  const errors: string[] = []
  let evaluated = 0
  let finalized = 0
  let deleted = 0
  let forceEdgesUpserted = 0
  const battleRecordIds = new Set<string>()
  const forceEdgesEvaluatedBattleRecordIds = new Set<string>()

  if (tenantTracking.length === 0) {
    return { evaluated, finalized, deleted, forceEdgesUpserted, battleRecordIds: [], errors }
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
    return { evaluated, finalized, deleted, forceEdgesUpserted, battleRecordIds: [], errors }
  }
  if (!provRows || provRows.length === 0) {
    return { evaluated, finalized, deleted, forceEdgesUpserted, battleRecordIds: [], errors }
  }

  const evaluatedAt = new Date().toISOString()
  const albionBattleIds = Array.from(
    new Set(
      provRows
        .map((prov) => {
          const brJoin = prov.battle_records as
            | { albion_battle_id: number | string | null; raw_battle: AlbionBattle }
            | { albion_battle_id: number | string | null; raw_battle: AlbionBattle }[]
            | null
          const br = Array.isArray(brJoin) ? brJoin[0] : brJoin
          return normalizeAlbionBattleId(br?.albion_battle_id)
        })
        .filter((id): id is string => id !== null),
    ),
  )
  const pairsByTenantBattle = new Map<string, KillboardPair[]>()
  const edgeEventsByBattle = new Map<string, BattleForceEdgeEvent[]>()
  if (albionBattleIds.length > 0) {
    const { data: pairRows, error: pairErr } = await db
      .from('killboard_events')
      .select('event_id, guild_id, battle_id, role, opponent_guild, opponent_alliance, fame')
      .in('guild_id', tenantIds)
      .in('battle_id', albionBattleIds)
    if (pairErr) {
      errors.push(`killboard pairs batch: ${pairErr.message}`)
      return { evaluated, finalized, deleted, forceEdgesUpserted, battleRecordIds: [...battleRecordIds], errors }
    }
    for (const row of pairRows ?? []) {
      const guildId = row.guild_id as string | null
      const battleId = row.battle_id as number | string | null
      const battleIdKey = normalizeAlbionBattleId(battleId)
      const role = row.role as 'killer' | 'victim' | null
      if (!guildId || !battleIdKey || (role !== 'killer' && role !== 'victim')) continue
      const key = `${guildId}:${battleIdKey}`
      const list = pairsByTenantBattle.get(key) ?? []
      list.push({
        role,
        opponentGuild: (row.opponent_guild as string | null) ?? null,
        fame: (row.fame as number | null) ?? 0,
      })
      pairsByTenantBattle.set(key, list)

      const sourceHomeGuildId = homeGuildByTenant.get(guildId)
      const eventId = row.event_id as number | string | null
      if (!sourceHomeGuildId || eventId === null || eventId === undefined) continue
      const edgeEvents = edgeEventsByBattle.get(battleIdKey) ?? []
      edgeEvents.push({
        eventId: String(eventId),
        sourceHomeGuildId,
        role,
        opponentGuild: (row.opponent_guild as string | null) ?? null,
        opponentAlliance: (row.opponent_alliance as string | null) ?? null,
        fame: (row.fame as number | null) ?? 0,
      })
      edgeEventsByBattle.set(battleIdKey, edgeEvents)
    }
  }

  for (const prov of provRows) {
    const tenantId = prov.guild_id as string
    const battleRecordId = prov.battle_record_id as string
    battleRecordIds.add(battleRecordId)
    const homeGuildId = homeGuildByTenant.get(tenantId)
    if (!homeGuildId) continue
    const brJoin = prov.battle_records as
      | { albion_battle_id: number | string | null; raw_battle: AlbionBattle }
      | { albion_battle_id: number | string | null; raw_battle: AlbionBattle }[]
      | null
    const br = Array.isArray(brJoin) ? brJoin[0] : brJoin
    if (!br) continue
    const battle = br.raw_battle
    if (!battle) continue
    const albionBattleId = normalizeAlbionBattleId(br.albion_battle_id)
    if (!albionBattleId) continue

    evaluated++
    const pairs = pairsByTenantBattle.get(`${tenantId}:${albionBattleId}`) ?? []
    if (!forceEdgesEvaluatedBattleRecordIds.has(battleRecordId)) {
      const edgeRows = buildBattleForceEdgeRows({
        battleRecordId,
        battle,
        events: edgeEventsByBattle.get(albionBattleId) ?? [],
        evaluatedAt,
      })
      if (edgeRows.length > 0) {
        const { error: edgeErr } = await db
          .from('battle_force_edges')
          .upsert(edgeRows, {
            onConflict: 'battle_record_id,force_level,force_a_key,force_b_key',
          })
        if (edgeErr) errors.push(`force edges upsert (battle ${albionBattleId}): ${edgeErr.message}`)
        else forceEdgesUpserted += edgeRows.length
      }
      forceEdgesEvaluatedBattleRecordIds.add(battleRecordId)
    }

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

      return { evaluated, finalized, deleted, forceEdgesUpserted, battleRecordIds: [...battleRecordIds], errors }
}

async function upsertBattleForceSummaries(
  db: ReturnType<typeof getAdminClient>,
  battlesByRecordId: ReadonlyMap<string, AlbionBattle>,
): Promise<{ upserted: number; errors: string[] }> {
  const rows = Array.from(battlesByRecordId.entries()).flatMap(([battleRecordId, battle]) =>
    buildBattleForceSummaryRows(battleRecordId, battle),
  )
  if (rows.length === 0) return { upserted: 0, errors: [] }
  const { error } = await db
    .from('battle_force_summaries')
    .upsert(rows, { onConflict: 'battle_record_id,force_level,force_key' })
  if (error) return { upserted: 0, errors: [`force summaries upsert: ${error.message}`] }
  return { upserted: rows.length, errors: [] }
}

export const maxDuration = 300
