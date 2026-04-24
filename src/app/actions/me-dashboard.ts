'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  calcParticipationStreak,
  calcSurvivalAndDeathlessStreak,
} from '@/lib/member-stats'
import { getMyPointsSummary } from '@/app/actions/regear'

export interface MyDashboardData {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
  kills: number
  deaths: number
  survivalRate: number | null
  evaluatedEvents: number
  currentDeathlessStreak: number
  participationCount: number
  participationCurrentStreak: number
  nextUpcomingEvent: {
    id: string
    title: string
    gather_at: string | null
    gather_time: string
    role_name: string | null
  } | null
  pendingRegearCount: number
  pendingExchangeCount: number
  pendingDonationCount: number
}

type SlotEvent = {
  id: string
  title: string
  gather_at: string | null
  gather_time: string
  battle_started_at: string | null
}

type SlotRow = {
  role_name: string | null
  parties:
    | { events: SlotEvent | SlotEvent[] }
    | Array<{ events: SlotEvent | SlotEvent[] }>
    | null
}

export async function getMyDashboard(): Promise<MyDashboardData | null> {
  const session = await getSession()
  if (!session || !session.isMember) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  const [
    pointsSummary,
    slotsRes,
    killboardRes,
    regearRes,
    exchangeRes,
    donationRes,
  ] = await Promise.all([
    getMyPointsSummary(),
    db
      .from('slots')
      .select(
        'role_name, parties!inner(events!inner(id, title, gather_at, gather_time, battle_started_at))',
      )
      .eq('guild_id', guildId)
      .eq('assigned_discord_id', session.discordId),
    db
      .from('killboard_events')
      .select('role, occurred_at')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId),
    db
      .from('regear_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending'),
    db
      .from('exchange_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending'),
    db
      .from('donation_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending'),
  ])

  const nowIso = new Date().toISOString()
  const byEvent = new Map<
    string,
    {
      id: string
      title: string
      role: string | null
      gather_at: string | null
      gather_time: string
      battle_started_at: string | null
    }
  >()
  for (const row of (slotsRes.data ?? []) as SlotRow[]) {
    const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
    if (!party) continue
    const event = Array.isArray(party.events) ? party.events[0] : party.events
    if (!event) continue
    if (byEvent.has(event.id)) continue
    byEvent.set(event.id, {
      id: event.id,
      title: event.title,
      role: row.role_name,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      battle_started_at: event.battle_started_at,
    })
  }

  const events = Array.from(byEvent.values())

  const pastParticipated = events
    .filter((e): e is typeof e & { battle_started_at: string } => e.battle_started_at != null)
    .map((e) => ({ eventId: e.id, startedAt: e.battle_started_at }))

  let kills = 0
  let deaths = 0
  const victimOccurrences: string[] = []
  for (const ke of killboardRes.data ?? []) {
    if (ke.role === 'killer') kills += 1
    else if (ke.role === 'victim') {
      deaths += 1
      if (ke.occurred_at) victimOccurrences.push(ke.occurred_at)
    }
  }

  const survival = calcSurvivalAndDeathlessStreak(pastParticipated, victimOccurrences)
  const participationDates = pastParticipated.map((e) => e.startedAt)
  const streak = calcParticipationStreak(participationDates, Date.now())

  const upcoming = events
    .filter((e) => e.gather_at != null && e.gather_at > nowIso)
    .sort((a, b) => (a.gather_at! < b.gather_at! ? -1 : 1))[0]

  return {
    balance: pointsSummary.summary?.balance ?? 0,
    lifetimeEarned: pointsSummary.summary?.lifetimeEarned ?? 0,
    lifetimeSpent: pointsSummary.summary?.lifetimeSpent ?? 0,
    kills,
    deaths,
    survivalRate: survival.survivalRate,
    evaluatedEvents: survival.evaluatedEvents,
    currentDeathlessStreak: survival.currentDeathlessStreak,
    participationCount: pastParticipated.length,
    participationCurrentStreak: streak.currentStreak,
    nextUpcomingEvent: upcoming
      ? {
          id: upcoming.id,
          title: upcoming.title,
          gather_at: upcoming.gather_at,
          gather_time: upcoming.gather_time,
          role_name: upcoming.role,
        }
      : null,
    pendingRegearCount: regearRes.count ?? 0,
    pendingExchangeCount: exchangeRes.count ?? 0,
    pendingDonationCount: donationRes.count ?? 0,
  }
}
