import { NextResponse } from 'next/server'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
import { getSuperAdminSession } from '@/lib/super-admin'
import { isLikelyRoyalCluster } from '@/lib/albion-zone'
import {
  AUTO_REGEAR_ENDED_BUFFER_MS,
  AUTO_REGEAR_MATCH_TIMEOUT_MS,
  AUTO_REGEAR_PRE_PICK_MS,
} from '@/lib/auto-regear'
import { withNoStore } from '@/lib/no-store-response'

// dry-run 진단 엔드포인트. cron 의 모든 게이트를 read-only 로 추적해 어디서
// 막혀 청구 0건이 됐는지 즉시 확인. mark-processed/RPC insert 안 함.
//
// 사용: GET /api/admin/auto-regear-debug?event_id=<uuid>
//
// AGENTS.md 의 force-static 금지 룰 적용.
export const dynamic = 'force-dynamic'

function json(body: unknown, init?: ResponseInit) {
  return withNoStore(NextResponse.json(body, init))
}

export async function GET(request: Request) {
  const session = await getSuperAdminSession()
  if (!session) {
    return json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = await getSessionGuildId(session)
  const url = new URL(request.url)
  const eventId = url.searchParams.get('event_id')
  if (!eventId) {
    return json({ error: 'event_id required' }, { status: 400 })
  }

  const db = getAdminClient()

  // 1) app_settings 가드
  const { data: settingRows } = await db
    .from('app_settings')
    .select('key, value')
    .eq('guild_id', guildId)
    .in('key', [
      'regear_support_enabled',
      'auto_regear_enabled',
      'albion_home_guild_id',
      'regear_payout_rate_percent',
      'craft_regear_enabled',
      'last_killboard_sync_at',
      'last_battle_tracker_sync_at',
    ])
  const settings = new Map<string, string>(
    (settingRows ?? []).map((r) => [r.key as string, r.value as string]),
  )

  const regearSupported = settings.get('regear_support_enabled') === 'true'
  const autoEnabled = (settings.get('auto_regear_enabled') ?? 'false') === 'true'
  const homeGuildId = settings.get('albion_home_guild_id') ?? null
  const lastKillboardSyncAt = settings.get('last_killboard_sync_at') ?? null
  const lastBattleTrackerSyncAt = settings.get('last_battle_tracker_sync_at') ?? null

  // 2) event 조회
  const { data: event, error: eventErr } = await db
    .from('events')
    .select('id, title, battle_started_at, created_at, auto_regear_processed_at')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventErr) {
    return json({ error: eventErr.message }, { status: 500 })
  }
  if (!event) {
    return json({ error: 'event not found' }, { status: 404 })
  }

  const stages: Array<{ stage: string; ok: boolean; detail?: unknown }> = []

  stages.push({
    stage: 'app_settings',
    ok: regearSupported && autoEnabled && !!homeGuildId,
    detail: {
      regear_support_enabled: regearSupported,
      auto_regear_enabled: autoEnabled,
      albion_home_guild_id: homeGuildId,
      last_killboard_sync_at: lastKillboardSyncAt,
      last_battle_tracker_sync_at: lastBattleTrackerSyncAt,
    },
  })

  const battleStartedAt = event.battle_started_at as string | null
  const autoProcessedAt = event.auto_regear_processed_at as string | null

  stages.push({
    stage: 'event_basic',
    ok: !!battleStartedAt,
    detail: {
      title: event.title,
      battle_started_at: battleStartedAt,
      created_at: event.created_at,
      auto_regear_processed_at: autoProcessedAt,
    },
  })

  if (!battleStartedAt) {
    return json({ event_id: eventId, stages, conclusion: 'battle_started_at_null' })
  }

  // pre-pick cut
  const battleStartedMs = Date.parse(battleStartedAt)
  const preCutPassed = battleStartedMs <= Date.now() - AUTO_REGEAR_PRE_PICK_MS
  stages.push({
    stage: 'pre_pick_cut',
    ok: preCutPassed,
    detail: { battle_started_ms: battleStartedMs, age_minutes: (Date.now() - battleStartedMs) / 60000 },
  })

  // retroactive
  const createdMs = Date.parse(event.created_at as string)
  const isRetroactive = createdMs > battleStartedMs
  stages.push({
    stage: 'retroactive_cut',
    ok: !isRetroactive,
    detail: { created_ms: createdMs, battle_ms: battleStartedMs, retroactive: isRetroactive },
  })

  // 3) tracked battle 매칭
  const trackedBattles = await findTrackedBattleIdsForEvent(db, guildId, battleStartedAt)
  stages.push({
    stage: 'tracked_battle_match',
    ok: trackedBattles.length > 0,
    detail: {
      matched_count: trackedBattles.length,
      battles: trackedBattles.map((b) => ({
        albionBattleId: b.albionBattleId,
        clusterName: b.clusterName,
        endedAtIso: b.endedAtIso,
        is_royal: isLikelyRoyalCluster(b.clusterName),
      })),
    },
  })

  // 보조 진단: 같은 시간창 (battle_started_at - 15min ~ +4h) 안의 모든
  // tenant_battle_records 를 isHighEngagement 컷 없이 조회. 위 매칭에서
  // 빠진 후보 (low-engagement / provisional / albion_battle_id null 등) 식별.
  const lowerIso = new Date(battleStartedMs - 15 * 60 * 1000).toISOString()
  const upperIso = new Date(battleStartedMs + 4 * 60 * 60 * 1000).toISOString()
  const { data: allTbr } = await db
    .from('tenant_battle_records')
    .select(
      'started_at, home_kills, home_deaths, home_team_size, is_provisional, battle_records(albion_battle_id, cluster_name, ended_at)',
    )
    .eq('guild_id', guildId)
    .gte('started_at', lowerIso)
    .lte('started_at', upperIso)
  type TbrRow = {
    started_at: string
    home_kills: number
    home_deaths: number
    home_team_size: number
    is_provisional: boolean
    battle_records: { albion_battle_id: number | string | null; cluster_name: string | null; ended_at: string | null } | Array<{ albion_battle_id: number | string | null; cluster_name: string | null; ended_at: string | null }> | null
  }
  stages.push({
    stage: 'tenant_battle_records_in_window_unfiltered',
    ok: (allTbr ?? []).length > 0,
    detail: {
      count: (allTbr ?? []).length,
      rows: ((allTbr ?? []) as TbrRow[]).map((r) => {
        const br = Array.isArray(r.battle_records) ? r.battle_records[0] : r.battle_records
        return {
          started_at: r.started_at,
          home_kills: r.home_kills,
          home_deaths: r.home_deaths,
          home_team_size: r.home_team_size,
          is_provisional: r.is_provisional,
          albion_battle_id: br?.albion_battle_id ?? null,
          cluster_name: br?.cluster_name ?? null,
          ended_at: br?.ended_at ?? null,
        }
      }),
    },
  })

  if (trackedBattles.length === 0) {
    const matchTimeoutMs = battleStartedMs + AUTO_REGEAR_MATCH_TIMEOUT_MS
    return json({
      event_id: eventId,
      stages,
      conclusion: Date.now() > matchTimeoutMs ? 'no_tracked_battle_after_timeout' : 'deferred_battle_tracker_lag',
      meta: { match_timeout_at: new Date(matchTimeoutMs).toISOString() },
    })
  }

  const blackzoneBattles = trackedBattles.filter((b) => !isLikelyRoyalCluster(b.clusterName))
  stages.push({
    stage: 'blackzone_filter',
    ok: blackzoneBattles.length > 0,
    detail: { blackzone_count: blackzoneBattles.length },
  })

  if (blackzoneBattles.length === 0) {
    return json({ event_id: eventId, stages, conclusion: 'all_royal_zone' })
  }

  const trackedBattleIds = blackzoneBattles.map((b) => b.albionBattleId)

  // ended_at + 30분 + sync 게이트
  const latestEndedMs = blackzoneBattles.reduce((acc, b) => {
    const ms = Date.parse(b.endedAtIso)
    return Number.isFinite(ms) && ms > acc ? ms : acc
  }, 0)
  const readyAtMs = latestEndedMs + AUTO_REGEAR_ENDED_BUFFER_MS
  const lastKillboardMs = lastKillboardSyncAt ? Date.parse(lastKillboardSyncAt) : NaN
  const lastBtMs = lastBattleTrackerSyncAt ? Date.parse(lastBattleTrackerSyncAt) : NaN
  const readyTimePassed = Date.now() >= readyAtMs
  const killboardCaughtUp = Number.isFinite(lastKillboardMs) && lastKillboardMs >= readyAtMs
  const trackerCaughtUp = Number.isFinite(lastBtMs) && lastBtMs >= readyAtMs
  const syncGateOk = readyTimePassed && killboardCaughtUp && trackerCaughtUp
  stages.push({
    stage: 'sync_gate',
    ok: syncGateOk,
    detail: {
      latest_ended_at: new Date(latestEndedMs).toISOString(),
      ready_at: new Date(readyAtMs).toISOString(),
      ready_time_passed: readyTimePassed,
      killboard_caught_up: killboardCaughtUp,
      tracker_caught_up: trackerCaughtUp,
    },
  })

  // 4) 슬롯/parties 조회
  const { data: parties, error: partiesErr } = await db
    .from('parties')
    .select('id, slots:slots(assigned_discord_id, auto_regear_excluded, role_name)')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
  if (partiesErr) {
    return json({ error: partiesErr.message, stages }, { status: 500 })
  }
  type SlotRow = {
    assigned_discord_id: string | null
    auto_regear_excluded: boolean
    role_name: string | null
  }
  const slotByDiscord = new Map<string, SlotRow>()
  for (const p of (parties ?? []) as Array<{ slots: SlotRow[] | null }>) {
    for (const s of p.slots ?? []) {
      if (!s.assigned_discord_id) continue
      if (!slotByDiscord.has(s.assigned_discord_id)) slotByDiscord.set(s.assigned_discord_id, s)
    }
  }
  stages.push({
    stage: 'party_slots',
    ok: slotByDiscord.size > 0,
    detail: {
      slot_count: slotByDiscord.size,
      sample_role_names: Array.from(slotByDiscord.values()).slice(0, 10).map((s) => s.role_name),
    },
  })
  if (slotByDiscord.size === 0) {
    return json({ event_id: eventId, stages, conclusion: 'no_slots_assigned' })
  }

  // 5) role_rewards 매칭
  const { data: rewardRows } = await db
    .from('role_rewards')
    .select('role_name, silver')
    .eq('guild_id', guildId)
  const roleCapByName = new Map<string, number>()
  for (const r of (rewardRows ?? []) as Array<{ role_name: string; silver: number }>) {
    roleCapByName.set(r.role_name, Number.isFinite(r.silver) ? r.silver : 0)
  }
  stages.push({
    stage: 'role_rewards_table',
    ok: rewardRows != null && rewardRows.length > 0,
    detail: {
      total_roles: rewardRows?.length ?? 0,
      roles: (rewardRows ?? []).map((r) => ({ name: r.role_name, silver: r.silver })),
    },
  })

  // 6) killboard_events victim 조회
  const { data: victims, error: victimsErr } = await db
    .from('killboard_events')
    .select('event_id, discord_id, player_name, occurred_at, battle_id')
    .eq('guild_id', guildId)
    .eq('role', 'victim')
    .in('discord_id', Array.from(slotByDiscord.keys()))
    .in('battle_id', trackedBattleIds)
  if (victimsErr) {
    return json({ error: victimsErr.message, stages }, { status: 500 })
  }
  stages.push({
    stage: 'killboard_victim_match',
    ok: (victims ?? []).length > 0,
    detail: {
      matched_victim_count: (victims ?? []).length,
      tracked_battle_ids: trackedBattleIds,
      sample_victims: (victims ?? []).slice(0, 10).map((v) => ({
        event_id: v.event_id,
        discord_id: v.discord_id,
        player_name: v.player_name,
        battle_id: v.battle_id,
        occurred_at: v.occurred_at,
      })),
    },
  })

  // killboard_events 에 같은 이벤트의 victim 이 있는지 (battle_id 무관) 보조 진단
  const { data: anyVictims } = await db
    .from('killboard_events')
    .select('event_id, discord_id, player_name, battle_id, occurred_at')
    .eq('guild_id', guildId)
    .eq('role', 'victim')
    .in('discord_id', Array.from(slotByDiscord.keys()))
    .gte('occurred_at', new Date(battleStartedMs - 30 * 60 * 1000).toISOString())
    .lte('occurred_at', new Date(battleStartedMs + 6 * 60 * 60 * 1000).toISOString())
  stages.push({
    stage: 'killboard_victim_in_time_window_any_battle',
    ok: (anyVictims ?? []).length > 0,
    detail: {
      time_window_victim_count: (anyVictims ?? []).length,
      battle_ids_seen: Array.from(new Set((anyVictims ?? []).map((v) => v.battle_id))),
      sample_victims: (anyVictims ?? []).slice(0, 10).map((v) => ({
        discord_id: v.discord_id,
        player_name: v.player_name,
        battle_id: v.battle_id,
        occurred_at: v.occurred_at,
      })),
    },
  })

  // 7) victim 자격 분류
  const victimAnalysis = ((victims ?? []) as Array<{
    event_id: number
    discord_id: string
    player_name: string
    battle_id: number | null
    occurred_at: string
  }>).map((v) => {
    const slot = slotByDiscord.get(v.discord_id)
    if (!slot) return { ...v, decision: 'no_slot' }
    if (slot.auto_regear_excluded) return { ...v, decision: 'excluded', role_name: slot.role_name }
    const cap = slot.role_name ? roleCapByName.get(slot.role_name) : undefined
    if (!cap || cap <= 0) return { ...v, decision: 'no_role_cap', role_name: slot.role_name, role_cap: cap }
    return { ...v, decision: 'eligible', role_name: slot.role_name, role_cap: cap }
  })
  stages.push({
    stage: 'victim_classification',
    ok: victimAnalysis.some((v) => v.decision === 'eligible'),
    detail: {
      total: victimAnalysis.length,
      eligible: victimAnalysis.filter((v) => v.decision === 'eligible').length,
      no_slot: victimAnalysis.filter((v) => v.decision === 'no_slot').length,
      excluded: victimAnalysis.filter((v) => v.decision === 'excluded').length,
      no_role_cap: victimAnalysis.filter((v) => v.decision === 'no_role_cap').length,
      detail: victimAnalysis.slice(0, 20),
    },
  })

  // 8) 이 이벤트의 regear_requests 분포 (RPC NULL 의 진짜 원인 추적)
  const { data: rrRows } = await db
    .from('regear_requests')
    .select(
      'id, discord_id, username, role_name, status, auto_generated, killboard_event_id, created_at, admin_notes',
    )
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  type RrRow = {
    id: string
    discord_id: string
    username: string
    role_name: string
    status: string
    auto_generated: boolean
    killboard_event_id: number | null
    created_at: string
    admin_notes: string | null
  }
  const rrAll = (rrRows ?? []) as RrRow[]
  const rrAuto = rrAll.filter((r) => r.auto_generated)
  const rrManual = rrAll.filter((r) => !r.auto_generated)
  stages.push({
    stage: 'regear_requests_for_event',
    ok: true,
    detail: {
      total: rrAll.length,
      auto_count: rrAuto.length,
      manual_count: rrManual.length,
      auto_by_status: rrAuto.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        return acc
      }, {}),
      manual_by_status: rrManual.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1
        return acc
      }, {}),
      manual_sample: rrManual.slice(0, 10).map((r) => ({
        id: r.id,
        discord_id: r.discord_id,
        username: r.username,
        status: r.status,
        role_name: r.role_name,
        killboard_event_id: r.killboard_event_id,
        created_at: r.created_at,
      })),
      auto_sample: rrAuto.slice(0, 10).map((r) => ({
        id: r.id,
        discord_id: r.discord_id,
        username: r.username,
        status: r.status,
        role_name: r.role_name,
        killboard_event_id: r.killboard_event_id,
        created_at: r.created_at,
        admin_notes: r.admin_notes,
      })),
    },
  })

  // 9) 각 eligible victim 별로 RPC 가 NULL 반환할지 시뮬레이션
  const manualNonRejectedByDiscord = new Map<string, number>()
  for (const r of rrManual) {
    if (r.status === 'rejected') continue
    manualNonRejectedByDiscord.set(r.discord_id, (manualNonRejectedByDiscord.get(r.discord_id) ?? 0) + 1)
  }
  const existingAutoByEventKbid = new Set<string>()
  for (const r of rrAuto) {
    if (r.killboard_event_id !== null) {
      existingAutoByEventKbid.add(`${r.killboard_event_id}`)
    }
  }
  type EligibleV = {
    decision: string
    role_name: string | null
    role_cap: number | undefined
    event_id: number
    discord_id: string
    player_name: string
    battle_id: number | null
    occurred_at: string
  }
  const eligibleVictims = victimAnalysis.filter((v): v is EligibleV => v.decision === 'eligible')
  const rpcSimulation = eligibleVictims.map((v) => {
    const hasManual = (manualNonRejectedByDiscord.get(v.discord_id) ?? 0) > 0
    const hasAutoRow = existingAutoByEventKbid.has(`${v.event_id}`)
    let rpcOutcome: string
    if (hasAutoRow) {
      rpcOutcome = 'existing_auto_returned'
    } else if (hasManual) {
      rpcOutcome = 'null_manual_exists'
    } else {
      rpcOutcome = 'would_insert'
    }
    return {
      killboard_event_id: v.event_id,
      discord_id: v.discord_id,
      player_name: v.player_name,
      role_name: v.role_name,
      role_cap: v.role_cap,
      has_manual_non_rejected: hasManual,
      has_auto_row: hasAutoRow,
      rpc_outcome: rpcOutcome,
    }
  })
  const outcomeCounts = rpcSimulation.reduce<Record<string, number>>((acc, r) => {
    acc[r.rpc_outcome] = (acc[r.rpc_outcome] ?? 0) + 1
    return acc
  }, {})
  stages.push({
    stage: 'rpc_outcome_simulation',
    ok: (outcomeCounts.would_insert ?? 0) > 0,
    detail: {
      eligible_total: eligibleVictims.length,
      outcome_counts: outcomeCounts,
      detail: rpcSimulation.slice(0, 30),
    },
  })

  return json(
    {
      event_id: eventId,
      stages,
      conclusion: 'completed',
    },
  )
}
