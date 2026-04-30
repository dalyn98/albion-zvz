import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
import { isLikelyRoyalCluster } from '@/lib/albion-zone'
import {
  AUTO_REGEAR_ENDED_BUFFER_MS,
  AUTO_REGEAR_MATCH_TIMEOUT_MS,
  AUTO_REGEAR_PRE_PICK_MS,
} from '@/lib/auto-regear'

// dry-run 진단 엔드포인트. cron 의 모든 게이트를 read-only 로 추적해 어디서
// 막혀 청구 0건이 됐는지 즉시 확인. mark-processed/RPC insert 안 함.
//
// 사용: GET /api/admin/auto-regear-debug?event_id=<uuid>
//
// AGENTS.md 의 force-static 금지 룰 적용.
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = await getSessionGuildId(session)
  const url = new URL(request.url)
  const eventId = url.searchParams.get('event_id')
  if (!eventId) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  }

  const db = getAdminClient()

  // 1) app_settings 가드
  const { data: settingRows } = await db
    .from('app_settings')
    .select('key, value')
    .eq('guild_id', guildId)
    .in('key', [
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
    return NextResponse.json({ error: eventErr.message }, { status: 500 })
  }
  if (!event) {
    return NextResponse.json({ error: 'event not found' }, { status: 404 })
  }

  const stages: Array<{ stage: string; ok: boolean; detail?: unknown }> = []

  stages.push({
    stage: 'app_settings',
    ok: autoEnabled && !!homeGuildId,
    detail: {
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
    return NextResponse.json({ event_id: eventId, stages, conclusion: 'battle_started_at_null' })
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

  if (trackedBattles.length === 0) {
    const matchTimeoutMs = battleStartedMs + AUTO_REGEAR_MATCH_TIMEOUT_MS
    return NextResponse.json({
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
    return NextResponse.json({ event_id: eventId, stages, conclusion: 'all_royal_zone' })
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
    return NextResponse.json({ error: partiesErr.message, stages }, { status: 500 })
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
    return NextResponse.json({ event_id: eventId, stages, conclusion: 'no_slots_assigned' })
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
    return NextResponse.json({ error: victimsErr.message, stages }, { status: 500 })
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

  return NextResponse.json(
    {
      event_id: eventId,
      stages,
      conclusion: 'completed',
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
