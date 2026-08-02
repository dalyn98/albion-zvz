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
  fetchMemberBattleParticipationsForMember,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from '@/lib/tracked-kills'
import { getMyPointsSummary } from '@/app/actions/regear'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getCurrentWeekStartIso } from '@/lib/timezone'
import { getAppSetting } from '@/lib/app-settings'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import { getMemberPendingRequestCounts } from '@/lib/member-pending-counts'
import { resolveStableMemberOwnership } from '@/lib/stable-member-ownership'

export type MyDashboardNextEventKind = 'assigned' | 'pending' | 'tentative' | 'available'

export interface MyDashboardNextEvent {
  id: string
  title: string
  gather_at: string | null
  gather_time: string
  role_name: string | null
  kind: MyDashboardNextEventKind
}

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
  // 이번 주 서브셋 (PT 월요일 00:00 ~ 현재) — battles 배열에서 startedAt 으로 필터해
  // 같은 판정 규칙(low-engagement 컷 + tracked window) 을 그대로 받는다. 위젯에서
  // 0이면 숨김 처리. 주 경계는 timezone.ts:getCurrentWeekStartIso (PT 기반).
  weekBattleCount: number
  weekKills: number
  weekDeaths: number
  weekWins: number
  weekLosses: number
  nextUpcomingEvent: {
    id: string
    title: string
    gather_at: string | null
    gather_time: string
    role_name: string | null
  } | null
  nextActionEvent: MyDashboardNextEvent | null
  pendingRegearCount: number
  pendingExchangeCount: number
  pendingDonationCount: number
}

type MyDashboardKillboardRow = {
  event_id: number | string | null
  role: string | null
  occurred_at: string | null
  battle_id: number | null
}

type UpcomingSlotEvent = {
  id: string
  title: string
  gather_at: string | null
  gather_time: string
  status?: string
}

type UpcomingSlotRow = {
  role_name: string | null
  parties:
    | { events: UpcomingSlotEvent | UpcomingSlotEvent[] }
    | Array<{ events: UpcomingSlotEvent | UpcomingSlotEvent[] }>
    | null
}

type UpcomingTentativeRow = {
  events: UpcomingSlotEvent | UpcomingSlotEvent[] | null
}

type OpenEventRow = UpcomingSlotEvent & {
  battle_started_at: string | null
  parties:
    | Array<{
        slots:
          | Array<{
              assigned_discord_id: string | null
              requested_discord_id: string | null
              is_hidden: boolean
            }>
          | null
      }>
    | null
}

function getSlotEvent(row: UpcomingSlotRow): UpcomingSlotEvent | null {
  const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
  if (!party) return null
  const event = Array.isArray(party.events) ? party.events[0] : party.events
  return event ?? null
}

function getTentativeEvent(row: UpcomingTentativeRow): UpcomingSlotEvent | null {
  if (!row.events) return null
  return Array.isArray(row.events) ? row.events[0] ?? null : row.events
}

function isEarlierEvent(
  candidate: Pick<MyDashboardNextEvent, 'gather_at'>,
  current: Pick<MyDashboardNextEvent, 'gather_at'> | null,
): boolean {
  if (!candidate.gather_at) return false
  if (!current?.gather_at) return true
  return candidate.gather_at < current.gather_at
}

export async function getMyDashboard(): Promise<MyDashboardData | null> {
  const session = await getSession()
  if (!session || !session.isMember) return null
  if (isLocalGuildAccountRestrictedFromResources(session)) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const ownership = await resolveStableMemberOwnership(db, guildId, session.discordId)

  const nowIso = new Date().toISOString()
  const bundleSplits =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'
  let upcomingSlotsQuery = db
    .from('slots')
    .select(
      'role_name, parties!inner(events!inner(id, title, gather_at, gather_time, status))',
    )
    .eq('guild_id', guildId)
  let pendingSlotsQuery = db
    .from('slots')
    .select(
      'role_name, parties!inner(events!inner(id, title, gather_at, gather_time, status))',
    )
    .eq('guild_id', guildId)
  let tentativeQuery = db
    .from('event_tentative_signups')
    .select(
      'events!inner(id, title, gather_at, gather_time, status, tentative_snapshot_version_id)',
    )
    .eq('guild_id', guildId)
  if (ownership.guildMemberId) {
    upcomingSlotsQuery = upcomingSlotsQuery.eq(
      'assigned_guild_member_id',
      ownership.guildMemberId,
    )
    pendingSlotsQuery = pendingSlotsQuery.eq(
      'requested_guild_member_id',
      ownership.guildMemberId,
    )
    tentativeQuery = tentativeQuery.eq('guild_member_id', ownership.guildMemberId)
  } else {
    upcomingSlotsQuery = upcomingSlotsQuery.eq('assigned_discord_id', session.discordId)
    pendingSlotsQuery = pendingSlotsQuery.eq('requested_discord_id', session.discordId)
    tentativeQuery = tentativeQuery.eq('discord_id', session.discordId)
  }

  const [
    pointsSummary,
    upcomingSlotsRes,
    pendingSlotsRes,
    tentativeRes,
    openEventsRes,
    avatarRes,
    killboardRows,
    pendingCounts,
    trackedBattles,
    participationsByMember,
  ] = await Promise.all([
    getMyPointsSummary(),
    // 스케줄링 UI 용. "다음 이벤트" 카드에만 쓰이므로 gather_at > now() 로 제한해
    // 과거 참여 이력은 읽지 않는다. 통계는 killboard 에서만 나온다.
    upcomingSlotsQuery
      .eq('parties.events.status', 'published')
      .gt('parties.events.gather_at', nowIso),
    pendingSlotsQuery
      .eq('parties.events.status', 'published')
      .gt('parties.events.gather_at', nowIso),
    tentativeQuery
      .eq('events.status', 'published')
      .is('events.battle_started_at', null)
      .is('events.tentative_snapshot_version_id', null)
      .gt('events.gather_at', nowIso),
    db
      .from('events')
      .select(
        'id, title, gather_at, gather_time, battle_started_at, parties(slots(assigned_discord_id, requested_discord_id, is_hidden))',
      )
      .eq('guild_id', guildId)
      .eq('status', 'published')
      .is('battle_started_at', null)
      .gt('gather_at', nowIso)
      .order('gather_at', { ascending: true, nullsFirst: false })
      .limit(12),
    // mergeMemberBattles 의 키가 albion_player_id 라 본인 매핑을 먼저 얻어야
    // 0K0D 참여(탱커/힐러) 까지 합쳐진다. 미연동(Albion 인증 미완료) 멤버는
    // null → killBattles 만으로 fallback (기존 동작과 동일).
    db
      .from('guild_avatars')
      .select('albion_player_id')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .maybeSingle(),
    selectPagedRowsOrThrow<MyDashboardKillboardRow>({
      label: 'my dashboard killboard events',
      buildQuery: () =>
        db
          .from('killboard_events')
          .select('event_id, role, occurred_at, battle_id')
          .eq('guild_id', guildId)
          .eq('discord_id', session.discordId)
          .order('occurred_at', { ascending: true })
          .order('event_id', { ascending: true }) as unknown as SupabasePagedQuery<MyDashboardKillboardRow>,
    }),
    getMemberPendingRequestCounts(db, guildId, session.discordId),
    fetchTrackedBattleWindows(db, guildId, null, { bundleSplits }),
    fetchMemberBattleParticipationsForMember(db, guildId, { discordId: session.discordId }),
  ])

  // killboard 기반 배틀 + raw_battle.players 기반 0K0D 참여 합집합. /members/[id]
  // 와 /leaderboard 가 같은 방식으로 집계하므로 /me 도 동일해야 페이지 간
  // 통계 (참여수/승패/생존/스트릭) 가 일치한다. (members-admin / leaderboard 와 동기화)
  const memberAlbionId = (avatarRes.data?.albion_player_id as string | null) ?? null
  const memberParticipations = memberAlbionId
    ? participationsByMember.byAlbionPlayerId.get(memberAlbionId)
    : undefined
  const killBattles = groupMemberKillsByBattle(killboardRows, trackedBattles)
  const battles = mergeMemberBattles(killBattles, memberParticipations, trackedBattles)

  let kills = 0
  let deaths = 0
  for (const b of battles) {
    kills += b.killCount
    deaths += b.deathCount
  }

  const weekCutoffMs = Date.parse(getCurrentWeekStartIso())
  let weekBattleCount = 0
  let weekKills = 0
  let weekDeaths = 0
  let weekWins = 0
  let weekLosses = 0
  for (const b of battles) {
    const ts = Date.parse(b.startedAt)
    if (Number.isNaN(ts) || ts < weekCutoffMs) continue
    weekBattleCount += 1
    weekKills += b.killCount
    weekDeaths += b.deathCount
    if (b.outcome === 'win') weekWins += 1
    else if (b.outcome === 'loss') weekLosses += 1
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
  const nextActions: MyDashboardNextEvent[] = []
  for (const row of (upcomingSlotsRes.data ?? []) as UpcomingSlotRow[]) {
    const event = getSlotEvent(row)
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
    nextActions.push({
      id: event.id,
      title: event.title,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      role_name: row.role_name,
      kind: 'assigned',
    })
  }

  for (const row of (pendingSlotsRes.data ?? []) as UpcomingSlotRow[]) {
    const event = getSlotEvent(row)
    if (!event?.gather_at) continue
    nextActions.push({
      id: event.id,
      title: event.title,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      role_name: row.role_name,
      kind: 'pending',
    })
  }

  for (const row of (tentativeRes.data ?? []) as UpcomingTentativeRow[]) {
    const event = getTentativeEvent(row)
    if (!event?.gather_at) continue
    nextActions.push({
      id: event.id,
      title: event.title,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      role_name: null,
      kind: 'tentative',
    })
  }

  let nextAvailable: MyDashboardNextEvent | null = null
  const occupiedEventIds = new Set(nextActions.map((event) => event.id))
  for (const event of (openEventsRes.data ?? []) as OpenEventRow[]) {
    if (!event.gather_at || event.battle_started_at || occupiedEventIds.has(event.id)) continue
    const hasOpenSlot = (event.parties ?? []).some((party) =>
      (party.slots ?? []).some(
        (slot) => !slot.is_hidden && !slot.assigned_discord_id && !slot.requested_discord_id,
      ),
    )
    if (!hasOpenSlot) continue
    const candidate: MyDashboardNextEvent = {
      id: event.id,
      title: event.title,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      role_name: null,
      kind: 'available',
    }
    if (isEarlierEvent(candidate, nextAvailable)) {
      nextAvailable = candidate
    }
  }
  if (nextAvailable) {
    nextActions.push(nextAvailable)
  }

  const nextActionEvent = nextActions.reduce<MyDashboardNextEvent | null>(
    (current, event) => (isEarlierEvent(event, current) ? event : current),
    null,
  )

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
    weekBattleCount,
    weekKills,
    weekDeaths,
    weekWins,
    weekLosses,
    nextUpcomingEvent: upcoming,
    nextActionEvent,
    pendingRegearCount: pendingCounts.regear,
    pendingExchangeCount: pendingCounts.exchange,
    pendingDonationCount: pendingCounts.donation,
  }
}
