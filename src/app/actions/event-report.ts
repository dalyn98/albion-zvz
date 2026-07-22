'use server'

import { getSession, sessionHas, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import {
  buildEventReport,
  type EventReport,
  type EventReportBattle,
  type EventReportProfile,
  type EventReportSlot,
  type EventReportKillboard,
  type EventReportRegear,
  type EventReportBattleParticipation,
} from '@/lib/event-report'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
import { parseRawBattle } from '@/lib/albion-battles'
import { isLatestLootAuditSettled } from '@/lib/event-closeout'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { loadIsCrafter } from '@/lib/craft-task-mapping'
import {
  loadEventCraftDemand,
  type EventCraftDemand,
} from '@/lib/event-operations-server'

// battle_started_at 주변에서 tenant_battle_records 를 찾지 못한 legacy 이벤트의
// 표시 fallback. killboard 집계는 tracked battle_id 정확 매칭만 사용한다.
const BATTLE_DURATION_MS = 60 * 60 * 1000
const REGEAR_REVIEW_CAPS = [
  CAP.REGEAR_APPROVE,
  CAP.REGEAR_EDIT_PRICE,
  CAP.REGEAR_BULK_ACTION,
] as const
const LOOT_AUDIT_CAPS = [CAP.INVENTORY_MANAGE, CAP.CHEST_LOG_PASTE] as const
const CRAFT_DEMAND_CAPS = [
  CAP.INVENTORY_MANAGE,
  CAP.INVENTORY_DELIVER,
  CAP.CRAFT_TASK_CREATE,
  CAP.CRAFT_TASK_DELIVER,
  CAP.CRAFT_MASTER,
] as const

export interface EventReportLootAudit {
  id: string
  title: string
  status: 'open' | 'resolved' | 'archived'
  unresolvedFindingsCount: number
  missingEstimatedValue: number
  createdAt: string
}

export interface EventReportResult {
  event: {
    id: string
    title: string
    battle_started_at: string
    battle_ended_at: string
    category: string | null
  }
  report: EventReport
  operations: {
    canReviewRegear: boolean
    canAuditLoot: boolean
    canManageEvent: boolean
    canViewCraftDemand: boolean
    craftDemand: EventCraftDemand | null
    lootAuditRequired: boolean
    lootAuditSettled: boolean | null
    lootAudits: EventReportLootAudit[]
  }
}

export async function getEventReport(
  eventId: string,
): Promise<EventReportResult | null> {
  const session = await getSession()
  if (!session) return null
  if (session.eventScope && session.eventScope !== eventId) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const canReviewRegear = session.isAdmin || sessionHasAny(session, REGEAR_REVIEW_CAPS)
  const canAuditLoot = session.isAdmin || sessionHasAny(session, LOOT_AUDIT_CAPS)

  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, battle_started_at, category, status, created_by')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) throw new Error(`event report query failed: ${eventError.message}`)

  // draft 는 리포트 자체가 의미 없음. 공개 이벤트 중 전투 시작된 것만.
  if (!event || event.status === 'draft' || !event.battle_started_at) return null

  const canManageEvent =
    session.isAdmin ||
    sessionHas(session, CAP.EVENT_MANAGE) ||
    (sessionCanCreateOrManageEvents(session) && event.created_by === session.discordId)
  const canViewCraftDemand =
    canManageEvent ||
    canReviewRegear ||
    sessionHasAny(session, CRAFT_DEMAND_CAPS) ||
    (session.isMember && await loadIsCrafter(guildId, session.discordId))

  const battleStartedAt = new Date(event.battle_started_at)
  const startedIso = battleStartedAt.toISOString()
  const fallbackEndedIso = new Date(battleStartedAt.getTime() + BATTLE_DURATION_MS).toISOString()
  const trackedBattles = event.category === '전투'
    ? await findTrackedBattleIdsForEvent(db, guildId, startedIso)
    : []
  const battleIds = trackedBattles.map((b) => b.albionBattleId)
  const trackedEndedMs = Math.max(...trackedBattles.map((b) => Date.parse(b.endedAtIso)))
  const endedIso = Number.isFinite(trackedEndedMs)
    ? new Date(trackedEndedMs).toISOString()
    : fallbackEndedIso

  // event_battles 는 삭제됐지만 guild_battle_views 가 현재 전투 ledger 의 제품
  // read model 이다. 같은 Albion battle 의 direct 매치업들을 리포트에 연결하고,
  // killboard 는 그 battle id 집합으로만 집계해 다른 전투를 섞지 않는다.
  const [
    partiesRes,
    killboardRes,
    regearRes,
    battleRecordsRes,
    battleViewsRes,
    lootAuditsRes,
  ] = await Promise.all([
    db
      .from('parties')
      .select('slots(assigned_discord_id, role_name, is_hidden)')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
    battleIds.length > 0
      ? db
          .from('killboard_events')
          .select('discord_id, albion_player_id, role, occurred_at, battle_id')
          .eq('guild_id', guildId)
          .in('battle_id', battleIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('regear_requests')
      .select('status, payout_silver')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
    // battleIds 는 위의 findTrackedBattleIdsForEvent 에서 이미 guild_id 로 스코프된
    // 값이다. battle_records 자체는 tenant-neutral 원본 테이블이라 여기서는 해당
    // battle id 의 raw_battle 만 직접 읽는다.
    battleIds.length > 0
      ? db
          .from('battle_records')
          .select('albion_battle_id, raw_battle')
          .in('albion_battle_id', battleIds)
      : Promise.resolve({ data: [], error: null }),
    battleIds.length > 0
      ? db
          .from('guild_battle_views')
          .select(
            'id, albion_battle_id, started_at, opponent_force_name, result_estimate, status, evidence_source, view_policy, activity_kind, activity_source, activity_reason, evaluated_at, subject_kills, subject_deaths, subject_kill_fame, opponent_kills, opponent_deaths, opponent_kill_fame',
          )
          .eq('tenant_id', guildId)
          .eq('relation_scope', 'direct')
          .in('albion_battle_id', battleIds)
          .order('started_at', { ascending: true })
          .order('opponent_kill_fame', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    canReviewRegear || canAuditLoot
      ? db
          .from('loot_audits')
          .select(
            'id, title, status, unresolved_findings_count, missing_estimated_value, created_at',
          )
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  const queryError = [
    partiesRes.error,
    killboardRes.error,
    regearRes.error,
    battleRecordsRes.error,
    battleViewsRes.error,
    lootAuditsRes.error,
  ].find((error) => error !== null)
  if (queryError) throw new Error(`event report data failed: ${queryError.message}`)

  const slots: EventReportSlot[] = []
  for (const party of partiesRes.data ?? []) {
    const rawSlots = Array.isArray(party.slots) ? party.slots : []
    for (const slot of rawSlots) {
      if (slot.is_hidden) continue
      slots.push({
        assigned_discord_id: slot.assigned_discord_id ?? null,
        role_name: slot.role_name ?? null,
      })
    }
  }

  type KillboardRow = {
    discord_id: string | null
    albion_player_id: string | null
    role: string | null
    occurred_at: string | null
    battle_id: number | string | null
  }
  const killboard: EventReportKillboard[] = ((killboardRes.data ?? []) as KillboardRow[])
    .filter(
      (k): k is KillboardRow & { role: 'killer' | 'victim'; occurred_at: string } =>
        (!!k.discord_id || !!k.albion_player_id) &&
        !!k.occurred_at &&
        (k.role === 'killer' || k.role === 'victim'),
    )
    .map((k) => ({
      discord_id: k.discord_id ?? null,
      albion_player_id: k.albion_player_id ?? null,
      role: k.role,
      occurred_at: k.occurred_at,
      battle_id: normalizeBattleId(k.battle_id),
    }))

  const regear: EventReportRegear[] = (regearRes.data ?? []).map((r) => ({
    status: r.status as EventReportRegear['status'],
    payout_silver: r.payout_silver ?? null,
  }))

  type BattleViewRow = {
    id: string
    albion_battle_id: number | string | null
    started_at: string
    opponent_force_name: string | null
    result_estimate: string | null
    status: string | null
    evidence_source: string | null
    view_policy: string | null
    activity_kind: string | null
    activity_source: string | null
    activity_reason: string | null
    evaluated_at: string | null
    subject_kills: number | null
    subject_deaths: number | null
    subject_kill_fame: number | null
    opponent_kills: number | null
    opponent_deaths: number | null
    opponent_kill_fame: number | null
  }
  const battles: EventReportBattle[] = ((battleViewsRes.data ?? []) as BattleViewRow[])
    .flatMap((row, index) => {
      const albionBattleId = normalizeBattleId(row.albion_battle_id)
      if (albionBattleId === null || !row.id) return []
      return [{
        id: row.id,
        battle_number: index + 1,
        albion_battle_id: albionBattleId,
        started_at: row.started_at,
        opponent_force_name: row.opponent_force_name?.trim() || '-',
        result_estimate: normalizeBattleResult(row.result_estimate),
        projection_status: normalizeProjectionStatus(row.status),
        evidence_source: normalizeEvidenceSource(row.evidence_source),
        view_policy: normalizeViewPolicy(row.view_policy),
        activity_kind: normalizeActivityKind(row.activity_kind),
        activity_source: normalizeActivitySource(row.activity_source),
        activity_reason: row.activity_reason?.trim().slice(0, 120) || 'unknown',
        evaluated_at: row.evaluated_at || row.started_at,
        subject_kills: row.subject_kills ?? 0,
        subject_deaths: row.subject_deaths ?? 0,
        subject_kill_fame: row.subject_kill_fame ?? 0,
        opponent_kills: row.opponent_kills ?? 0,
        opponent_deaths: row.opponent_deaths ?? 0,
        opponent_kill_fame: row.opponent_kill_fame ?? 0,
      }]
    })

  type BattleRecordRow = { albion_battle_id: number | string | null; raw_battle: unknown }
  const rawParticipants: Array<{
    albionPlayerId: string
    albionName: string
    battleId: number
  }> = []
  const rawPlayerIds = new Set<string>()
  for (const row of (battleRecordsRes.data ?? []) as BattleRecordRow[]) {
    const battleId = normalizeBattleId(row.albion_battle_id)
    if (battleId === null) continue
    const battle = parseRawBattle(row.raw_battle)
    if (!battle) continue
    for (const player of Object.values(battle.players ?? {})) {
      if (!player.id) continue
      rawPlayerIds.add(player.id)
      rawParticipants.push({
        albionPlayerId: player.id,
        albionName: player.name || player.id,
        battleId,
      })
    }
  }

  const [participantAvatarsRes, rosterRes] =
    rawPlayerIds.size > 0
      ? await Promise.all([
          db
            .from('guild_avatars')
            .select('discord_id, username, avatar, albion_player_id')
            .eq('guild_id', guildId)
            .in('albion_player_id', [...rawPlayerIds]),
          db
            .from('albion_guild_members')
            .select('albion_player_id, albion_player_name')
            .eq('guild_id', guildId)
            .in('albion_player_id', [...rawPlayerIds]),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ]
  const avatarsByAlbionId = new Map<string, {
    discord_id: string | null
    username: string | null
    avatar: string | null
    albion_player_id: string | null
  }>()
  for (const row of participantAvatarsRes.data ?? []) {
    if (!row.albion_player_id) continue
    avatarsByAlbionId.set(row.albion_player_id, {
      discord_id: row.discord_id ?? null,
      username: row.username ?? null,
      avatar: row.avatar ?? null,
      albion_player_id: row.albion_player_id,
    })
  }
  const rosterNamesByAlbionId = new Map<string, string>()
  for (const row of rosterRes.data ?? []) {
    if (!row.albion_player_id) continue
    rosterNamesByAlbionId.set(row.albion_player_id, row.albion_player_name ?? row.albion_player_id)
  }

  const battleParticipations: EventReportBattleParticipation[] = rawParticipants
    .filter((p) => avatarsByAlbionId.has(p.albionPlayerId) || rosterNamesByAlbionId.has(p.albionPlayerId))
    .map((p) => {
      const avatar = avatarsByAlbionId.get(p.albionPlayerId)
      return {
        discord_id: avatar?.discord_id ?? null,
        albion_player_id: p.albionPlayerId,
        albion_name: avatar?.username ?? rosterNamesByAlbionId.get(p.albionPlayerId) ?? p.albionName,
        battle_id: p.battleId,
      }
    })

  const discordIds = new Set<string>()
  for (const s of slots) if (s.assigned_discord_id) discordIds.add(s.assigned_discord_id)
  for (const k of killboard) if (k.discord_id) discordIds.add(k.discord_id)
  for (const p of battleParticipations) if (p.discord_id) discordIds.add(p.discord_id)

  const profiles = new Map<string, EventReportProfile>()
  if (discordIds.size > 0) {
    const { data: avatarRows } = await db
      .from('guild_avatars')
      .select('discord_id, username, avatar')
      .eq('guild_id', guildId)
      .in('discord_id', [...discordIds])
    for (const a of avatarRows ?? []) {
      if (!a.discord_id || !a.username) continue
      profiles.set(a.discord_id, {
        discord_id: a.discord_id,
        username: a.username,
        avatar: a.avatar ?? null,
      })
    }
  }

  const report = buildEventReport({
    slots,
    killboard,
    trackedBattleIds: battleIds,
    battleParticipations,
    regear,
    battles,
    profiles,
  })

  const closeoutLootAudits = (lootAuditsRes.data ?? []).map((row) => ({
    status: normalizeLootAuditStatus(row.status),
    unresolvedFindingsCount: Number(row.unresolved_findings_count ?? 0),
  }))
  const lootAudits: EventReportLootAudit[] = canAuditLoot
    ? (lootAuditsRes.data ?? []).map((row) => ({
        id: row.id as string,
        title: row.title as string,
        status: normalizeLootAuditStatus(row.status),
        unresolvedFindingsCount: Number(row.unresolved_findings_count ?? 0),
        missingEstimatedValue: Number(row.missing_estimated_value ?? 0),
        createdAt: row.created_at as string,
      }))
    : []
  const craftDemand = canViewCraftDemand
    ? await loadEventCraftDemand(guildId, eventId)
    : null

  return {
    event: {
      id: event.id,
      title: event.title,
      battle_started_at: startedIso,
      battle_ended_at: endedIso,
      category: (event.category as string | null) ?? null,
    },
    report,
    operations: {
      canReviewRegear,
      canAuditLoot,
      canManageEvent,
      canViewCraftDemand,
      craftDemand,
      lootAuditRequired: event.category === '전투',
      lootAuditSettled:
        canReviewRegear || canAuditLoot
          ? isLatestLootAuditSettled(closeoutLootAudits)
          : null,
      lootAudits,
    },
  }
}

function normalizeBattleId(raw: number | string | null): number | null {
  if (raw === null) return null
  const id = typeof raw === 'number' ? raw : Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

function normalizeBattleResult(raw: string | null): EventReportBattle['result_estimate'] {
  return raw === 'advantage' || raw === 'disadvantage' || raw === 'even' ? raw : 'unclear'
}

function normalizeProjectionStatus(raw: string | null): EventReportBattle['projection_status'] {
  return raw === 'final' || raw === 'low_confidence' ? raw : 'provisional'
}

function normalizeEvidenceSource(raw: string | null): EventReportBattle['evidence_source'] {
  return raw === 'killboard_events' ? raw : 'battle_summary'
}

function normalizeViewPolicy(raw: string | null): EventReportBattle['view_policy'] {
  return raw === 'small_or_low_engagement' ? raw : 'default_meaningful'
}

function normalizeActivityKind(raw: string | null): EventReportBattle['activity_kind'] {
  if (
    raw === 'smallscale' ||
    raw === 'ganking' ||
    raw === 'low_engagement' ||
    raw === 'review' ||
    raw === 'excluded'
  ) {
    return raw
  }
  return 'zvz'
}

function normalizeActivitySource(raw: string | null): EventReportBattle['activity_source'] {
  if (raw === 'event_intent' || raw === 'manual') return raw
  return 'automatic'
}

function normalizeLootAuditStatus(raw: unknown): EventReportLootAudit['status'] {
  return raw === 'resolved' || raw === 'archived' ? raw : 'open'
}
