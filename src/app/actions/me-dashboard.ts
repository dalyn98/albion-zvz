'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  calcOutcomeStats,
  calcParticipationStreak,
  calcSurvivalFromBattles,
} from '@/lib/member-stats'
import {
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
} from '@/lib/tracked-kills'
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
  longestDeathlessStreak: number
  participationCount: number
  participationCurrentStreak: number
  participationLongestStreak: number
  // outcome(win/loss) 이 확정된 참여 배틀만 집계. tie 등은 evaluated 에서 제외.
  wins: number
  losses: number
  winRate: number | null
  evaluatedOutcomeEvents: number
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

type UpcomingSlotEvent = {
  id: string
  title: string
  gather_at: string | null
  gather_time: string
}

type UpcomingSlotRow = {
  role_name: string | null
  parties:
    | { events: UpcomingSlotEvent | UpcomingSlotEvent[] }
    | Array<{ events: UpcomingSlotEvent | UpcomingSlotEvent[] }>
    | null
}

export async function getMyDashboard(): Promise<MyDashboardData | null> {
  const session = await getSession()
  if (!session || !session.isMember) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  const nowIso = new Date().toISOString()

  const [
    pointsSummary,
    upcomingSlotsRes,
    killboardRes,
    regearRes,
    exchangeRes,
    donationRes,
    trackedWindows,
  ] = await Promise.all([
    getMyPointsSummary(),
    // 스케줄링 UI 용. "다음 이벤트" 카드에만 쓰이므로 gather_at > now() 로 제한해
    // 과거 참여 이력은 읽지 않는다. 통계는 killboard 에서만 나온다.
    db
      .from('slots')
      .select(
        'role_name, parties!inner(events!inner(id, title, gather_at, gather_time))',
      )
      .eq('guild_id', guildId)
      .eq('assigned_discord_id', session.discordId)
      .gt('parties.events.gather_at', nowIso),
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
    fetchTrackedBattleWindows(db, guildId),
  ])

  // 참여 배틀 = 멤버의 killboard 가 한 건이라도 있는 트래킹 배틀. 이 배열이
  // 모든 통계 (참여수/승패/생존/스트릭/킬/데스) 의 단일 소스.
  const battles = groupMemberKillsByBattle(killboardRes.data ?? [], trackedWindows)

  let kills = 0
  let deaths = 0
  for (const b of battles) {
    kills += b.killCount
    deaths += b.deathCount
  }

  const survival = calcSurvivalFromBattles(
    battles.map((b) => ({ startedAt: b.startedAt, hadDeath: b.hadDeath })),
  )
  const streak = calcParticipationStreak(
    battles.map((b) => b.startedAt),
    Date.now(),
  )
  const outcomeStats = calcOutcomeStats(battles.map((b) => b.outcome))

  // 다음 이벤트: 이미 gather_at > now() 로 필터했으니 임의의 1건이 아니라
  // 가장 이른 것만 고르면 된다.
  let upcoming: {
    id: string
    title: string
    gather_at: string | null
    gather_time: string
    role_name: string | null
  } | null = null
  for (const row of (upcomingSlotsRes.data ?? []) as UpcomingSlotRow[]) {
    const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
    if (!party) continue
    const event = Array.isArray(party.events) ? party.events[0] : party.events
    if (!event || !event.gather_at) continue
    if (!upcoming || event.gather_at < (upcoming.gather_at ?? '')) {
      upcoming = {
        id: event.id,
        title: event.title,
        gather_at: event.gather_at,
        gather_time: event.gather_time,
        role_name: row.role_name,
      }
    }
  }

  return {
    balance: pointsSummary.summary?.balance ?? 0,
    lifetimeEarned: pointsSummary.summary?.lifetimeEarned ?? 0,
    lifetimeSpent: pointsSummary.summary?.lifetimeSpent ?? 0,
    kills,
    deaths,
    survivalRate: survival.survivalRate,
    evaluatedEvents: survival.evaluatedEvents,
    currentDeathlessStreak: survival.currentDeathlessStreak,
    longestDeathlessStreak: survival.longestDeathlessStreak,
    participationCount: battles.length,
    participationCurrentStreak: streak.currentStreak,
    participationLongestStreak: streak.longestStreak,
    wins: outcomeStats.wins,
    losses: outcomeStats.losses,
    winRate: outcomeStats.winRate,
    evaluatedOutcomeEvents: outcomeStats.evaluatedEvents,
    nextUpcomingEvent: upcoming,
    pendingRegearCount: regearRes.count ?? 0,
    pendingExchangeCount: exchangeRes.count ?? 0,
    pendingDonationCount: donationRes.count ?? 0,
  }
}
