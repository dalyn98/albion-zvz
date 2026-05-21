'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  buildEventReport,
  type EventReport,
  type EventReportProfile,
  type EventReportSlot,
  type EventReportKillboard,
  type EventReportRegear,
} from '@/lib/event-report'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'

// battle_started_at 주변에서 tenant_battle_records 를 찾지 못한 legacy 이벤트의
// 표시 fallback. killboard 집계는 tracked battle_id 정확 매칭만 사용한다.
const BATTLE_DURATION_MS = 60 * 60 * 1000

export interface EventReportResult {
  event: {
    id: string
    title: string
    battle_started_at: string
    battle_ended_at: string
    outcome: 'win' | 'loss' | null
    finalized_at: string | null
    category: string | null
  }
  report: EventReport
}

export async function getEventReport(
  eventId: string,
): Promise<EventReportResult | null> {
  const session = await getSession()
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()
  const db = getAdminClient()

  const { data: event } = await db
    .from('events')
    .select('id, title, battle_started_at, outcome, finalized_at, category, status')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()

  // draft 는 리포트 자체가 의미 없음. 공개 이벤트 중 전투 시작된 것만.
  if (!event || event.status === 'draft' || !event.battle_started_at) return null

  const battleStartedAt = new Date(event.battle_started_at)
  const startedIso = battleStartedAt.toISOString()
  const fallbackEndedIso = new Date(battleStartedAt.getTime() + BATTLE_DURATION_MS).toISOString()
  const trackedBattles = await findTrackedBattleIdsForEvent(db, guildId, startedIso)
  const battleIds = trackedBattles.map((b) => b.albionBattleId)
  const trackedEndedMs = Math.max(...trackedBattles.map((b) => Date.parse(b.endedAtIso)))
  const endedIso = Number.isFinite(trackedEndedMs)
    ? new Date(trackedEndedMs).toISOString()
    : fallbackEndedIso

  // event_battles 테이블은 더 이상 존재하지 않는다 — 전투 기록은 별도 cron 이
  // tenant_battle_records 에 적재한다. report.battles 는 빈 배열로 유지
  // (UI 가 length>0 가드). killboard 는 추적된 battle_id 로만 집계해 이벤트
  // 시간대의 솔로 갱킹/다른 전투를 섞지 않는다.
  const [partiesRes, killboardRes, regearRes] = await Promise.all([
    db
      .from('parties')
      .select('slots(assigned_discord_id, role_name, is_hidden)')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
    battleIds.length > 0
      ? db
          .from('killboard_events')
          .select('discord_id, role, occurred_at')
          .eq('guild_id', guildId)
          .not('discord_id', 'is', null)
          .in('battle_id', battleIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from('regear_requests')
      .select('status, payout_silver')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
  ])

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

  type KillboardRow = { discord_id: string | null; role: string | null; occurred_at: string | null }
  const killboard: EventReportKillboard[] = ((killboardRes.data ?? []) as KillboardRow[])
    .filter(
      (k): k is { discord_id: string; role: 'killer' | 'victim'; occurred_at: string } =>
        !!k.discord_id &&
        !!k.occurred_at &&
        (k.role === 'killer' || k.role === 'victim'),
    )
    .map((k) => ({
      discord_id: k.discord_id,
      role: k.role,
      occurred_at: k.occurred_at,
    }))

  const regear: EventReportRegear[] = (regearRes.data ?? []).map((r) => ({
    status: r.status as EventReportRegear['status'],
    payout_silver: r.payout_silver ?? null,
  }))

  const discordIds = new Set<string>()
  for (const s of slots) if (s.assigned_discord_id) discordIds.add(s.assigned_discord_id)
  for (const k of killboard) discordIds.add(k.discord_id)

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

  const report = buildEventReport({ slots, killboard, regear, battles: [], profiles })

  return {
    event: {
      id: event.id,
      title: event.title,
      battle_started_at: startedIso,
      battle_ended_at: endedIso,
      outcome: (event.outcome as 'win' | 'loss' | null) ?? null,
      finalized_at: event.finalized_at ?? null,
      category: (event.category as string | null) ?? null,
    },
    report,
  }
}
