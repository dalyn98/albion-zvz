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
  fetchMemberBattleParticipations,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from '@/lib/tracked-kills'
import { getMyPointsSummary } from '@/app/actions/regear'
import { getTenantTimezone } from '@/lib/timezone'

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
    avatarRes,
    killboardRes,
    regearRes,
    exchangeRes,
    donationRes,
    trackedBattles,
    participationsByMember,
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
    // mergeMemberBattles 의 키가 albion_player_id 라 본인 매핑을 먼저 얻어야
    // 0K0D 참여(탱커/힐러) 까지 합쳐진다. 미연동(Albion 인증 미완료) 멤버는
    // null → killBattles 만으로 fallback (기존 동작과 동일).
    db
      .from('guild_avatars')
      .select('albion_player_id')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle(),
    db
      .from('killboard_events')
      .select('role, occurred_at, battle_id')
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
    fetchMemberBattleParticipations(db, guildId),
  ])

  // killboard 기반 배틀 + raw_battle.players 기반 0K0D 참여 합집합. /members/[id]
  // 와 /leaderboard 가 같은 방식으로 집계하므로 /me 도 동일해야 페이지 간
  // 통계 (참여수/승패/생존/스트릭) 가 일치한다. (members-admin / leaderboard 와 동기화)
  const memberAlbionId = (avatarRes.data?.albion_player_id as string | null) ?? null
  const memberParticipations = memberAlbionId
    ? participationsByMember.byAlbionPlayerId.get(memberAlbionId)
    : undefined
  const killBattles = groupMemberKillsByBattle(killboardRes.data ?? [], trackedBattles)
  const battles = mergeMemberBattles(killBattles, memberParticipations, trackedBattles)

  let kills = 0
  let deaths = 0
  for (const b of battles) {
    kills += b.killCount
    deaths += b.deathCount
  }

  const survival = calcSurvivalFromBattles(
    battles.map((b) => ({ startedAt: b.startedAt, hadDeath: b.hadDeath })),
  )
  const tz = await getTenantTimezone(guildId)
  const streak = calcParticipationStreak(
    battles.map((b) => b.startedAt),
    Date.now(),
    tz,
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
