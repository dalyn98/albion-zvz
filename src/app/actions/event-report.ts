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
  type EventReportBattle,
} from '@/lib/event-report'

// battle_started_at + 1h 를 "전투 종료" 로 본다. killboard 는 이 시간창 안에
// 발생한 길드 이벤트만 이 이벤트 소속으로 집계한다.
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
  const battleEndedAt = new Date(battleStartedAt.getTime() + BATTLE_DURATION_MS)
  const startedIso = battleStartedAt.toISOString()
  const endedIso = battleEndedAt.toISOString()

  const [partiesRes, killboardRes, regearRes, battlesRes] = await Promise.all([
    db
      .from('parties')
      .select('slots(assigned_discord_id, role_name, is_hidden)')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
    db
      .from('killboard_events')
      .select('discord_id, role, occurred_at')
      .eq('guild_id', guildId)
      .gte('occurred_at', startedIso)
      .lte('occurred_at', endedIso),
    db
      .from('regear_requests')
      .select('status, payout_silver')
      .eq('guild_id', guildId)
      .eq('event_id', eventId),
    db
      .from('event_battles')
      .select('battle_number, opponent_guild, outcome')
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

  const killboard: EventReportKillboard[] = (killboardRes.data ?? []).map((k) => ({
    discord_id: k.discord_id,
    role: k.role as 'killer' | 'victim',
    occurred_at: k.occurred_at,
  }))

  const regear: EventReportRegear[] = (regearRes.data ?? []).map((r) => ({
    status: r.status as EventReportRegear['status'],
    payout_silver: r.payout_silver ?? null,
  }))

  const battles: EventReportBattle[] = (battlesRes.data ?? []).map((b) => ({
    battle_number: b.battle_number,
    opponent_guild: b.opponent_guild,
    outcome: b.outcome as 'win' | 'loss',
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

  const report = buildEventReport({ slots, killboard, regear, battles, profiles })

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
