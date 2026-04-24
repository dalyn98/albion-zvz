'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  calcOutcomeStats,
  calcSurvivalAndDeathlessStreak,
  type ParticipatedEvent,
} from '@/lib/member-stats'
import {
  fetchTrackedBattleWindows,
  findTrackedOutcome,
  isWithinTrackedWindow,
} from '@/lib/tracked-kills'

export type LeaderboardWindow = 'week' | 'month' | 'all'

export interface LeaderboardEntry {
  discord_id: string
  username: string
  avatar: string | null
  value: number
  // 전투 지표일 때만 사용. K/D 카드에서 kills/deaths 를 함께 보여주기 위함.
  kills?: number
  deaths?: number
  // 생존률 지표일 때만 사용. 작은 표본을 감추는 게 아니라 표본 크기도 함께 노출.
  evaluatedEvents?: number
  // 승률 지표일 때만 사용. 승/패 원시 카운트도 함께 노출.
  wins?: number
  losses?: number
}

export interface LeaderboardData {
  window: LeaderboardWindow
  kills: LeaderboardEntry[]
  participation: LeaderboardEntry[]
  survival: LeaderboardEntry[]
  kd: LeaderboardEntry[]
  winRate: LeaderboardEntry[]
}

const TOP_N = 10
// 생존률 순위는 표본이 작을수록 우연히 100% 가 나오기 쉬우므로 최소 참여 이벤트
// 수를 요구. 주간 창에서도 의미있는 값이 나오도록 5 로 타이트하게.
const MIN_EVALUATED_FOR_SURVIVAL_RANK = 5
// K/D 도 단 한 번의 킬로 랭킹 올라오는 것을 막음. 킬+데스 합계 5 이상.
const MIN_EVENTS_FOR_KD_RANK = 5
// 승률도 표본이 너무 작으면 의미 없음. 5전 이상 확정된 경우만.
const MIN_EVALUATED_FOR_WINRATE_RANK = 5

const DAY_MS = 24 * 60 * 60 * 1000

function cutoffFor(window: LeaderboardWindow): string | null {
  if (window === 'all') return null
  const days = window === 'week' ? 7 : 30
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

type KillboardRow = {
  discord_id: string | null
  role: string | null
  occurred_at: string | null
}

type SlotEvent = {
  id: string
  battle_started_at: string | null
}

type SlotRow = {
  assigned_discord_id: string | null
  role_name: string | null
  parties:
    | { events: SlotEvent | SlotEvent[] }
    | Array<{ events: SlotEvent | SlotEvent[] }>
    | null
}

// 생존률 판정에서 제외할 역할. DPS 는 최전방 딜러 특성상 사망률이 높아
// 생존률 지표에서 구조적으로 불리하다.
// (feedback_albion_zvz_achievement_rules.md 규칙 2)
const SURVIVAL_EXCLUDED_ROLES: ReadonlySet<string> = new Set(['Dps'])

export async function getLeaderboard(
  window: LeaderboardWindow = 'week',
): Promise<LeaderboardData | null> {
  const session = await getSession()
  if (!session) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const cutoff = cutoffFor(window)

  const avatarsQ = db
    .from('guild_avatars')
    .select('discord_id, username, avatar')
    .eq('guild_id', guildId)
    .is('withdrawn_at', null)

  let killboardQ = db
    .from('killboard_events')
    .select('discord_id, role, occurred_at')
    .eq('guild_id', guildId)
  if (cutoff) killboardQ = killboardQ.gte('occurred_at', cutoff)

  // 참여 집계: slots → parties → events, battle_started_at 있는 것만 "실제 참여"
  // 로 간주. window 가 있으면 JS 에서 cutoff 적용 (nested 필터는 Supabase 에서
  // 가독성이 떨어지므로 단순화). role_name 은 생존률 집계에서 DPS 를 제외하기
  // 위해 함께 읽는다.
  const slotsQ = db
    .from('slots')
    .select(
      'assigned_discord_id, role_name, parties!inner(events!inner(id, battle_started_at))',
    )
    .eq('guild_id', guildId)
    .not('assigned_discord_id', 'is', null)

  const [avatarsRes, killboardRes, slotsRes, trackedWindows] = await Promise.all([
    avatarsQ,
    killboardQ,
    slotsQ,
    fetchTrackedBattleWindows(db, guildId, cutoff),
  ])

  const avatarMap = new Map<string, { username: string; avatar: string | null }>()
  for (const a of avatarsRes.data ?? []) {
    if (a.discord_id && a.username) {
      avatarMap.set(a.discord_id, { username: a.username, avatar: a.avatar })
    }
  }

  interface CombatAgg {
    kills: number
    deaths: number
    victimTimes: string[]
  }
  const combat = new Map<string, CombatAgg>()
  // tenant_battle_records 판정 필터를 통과한 전투 시간창에 속한 킬/데스만
  // 업적·통계에 반영. 1:1 갱킹/소규모 전투는 여기서 자연스럽게 배제된다.
  for (const ke of (killboardRes.data ?? []) as KillboardRow[]) {
    if (!ke.discord_id) continue
    if (!ke.occurred_at) continue
    if (!isWithinTrackedWindow(ke.occurred_at, trackedWindows)) continue
    let entry = combat.get(ke.discord_id)
    if (!entry) {
      entry = { kills: 0, deaths: 0, victimTimes: [] }
      combat.set(ke.discord_id, entry)
    }
    if (ke.role === 'killer') entry.kills += 1
    else if (ke.role === 'victim') {
      entry.deaths += 1
      entry.victimTimes.push(ke.occurred_at)
    }
  }

  // 참여 이벤트 세트. DPS 참여로만 기록된 이벤트는 생존률 계산에서 제외해야
  // 하므로 (member, event) 별로 역할도 함께 추적한다. 한 이벤트에서 여러 역할
  // 슬롯을 맡은 경우(거의 없지만 가능) 비-DPS 역할이 하나라도 있으면 평가 대상.
  interface MemberEventParticipation {
    startedAt: string
    isDpsOnly: boolean
  }
  const participationEvents = new Map<string, Map<string, MemberEventParticipation>>()
  for (const row of (slotsRes.data ?? []) as SlotRow[]) {
    const discordId = row.assigned_discord_id
    if (!discordId) continue
    const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
    if (!party) continue
    const event = Array.isArray(party.events) ? party.events[0] : party.events
    if (!event || !event.battle_started_at) continue
    if (cutoff && event.battle_started_at < cutoff) continue
    let memberEvents = participationEvents.get(discordId)
    if (!memberEvents) {
      memberEvents = new Map()
      participationEvents.set(discordId, memberEvents)
    }
    const isDps = !!row.role_name && SURVIVAL_EXCLUDED_ROLES.has(row.role_name)
    const existing = memberEvents.get(event.id)
    if (!existing) {
      memberEvents.set(event.id, {
        startedAt: event.battle_started_at,
        isDpsOnly: isDps,
      })
    } else if (existing.isDpsOnly && !isDps) {
      existing.isDpsOnly = false
    }
  }

  const discordIds = new Set<string>([
    ...combat.keys(),
    ...participationEvents.keys(),
  ])

  interface Agg {
    discord_id: string
    username: string
    avatar: string | null
    kills: number
    deaths: number
    participations: number
    survivalRate: number | null
    evaluatedEvents: number
    wins: number
    losses: number
    winRate: number | null
    evaluatedOutcomeEvents: number
  }
  const aggs: Agg[] = []
  for (const discordId of discordIds) {
    const profile = avatarMap.get(discordId)
    // 탈퇴자/비멤버는 랭킹에서 제외 (이름이 안 보임).
    if (!profile) continue
    const c = combat.get(discordId) ?? { kills: 0, deaths: 0, victimTimes: [] }
    const memberEvents = participationEvents.get(discordId)
    const allEntries = memberEvents ? Array.from(memberEvents.entries()) : []
    // 참여 집계는 모든 역할 포함. 생존률 계산만 DPS-only 참여를 제외.
    const survivalInput: ParticipatedEvent[] = allEntries
      .filter(([, v]) => !v.isDpsOnly)
      .map(([eventId, v]) => ({ eventId, startedAt: v.startedAt }))
    const survival = calcSurvivalAndDeathlessStreak(survivalInput, c.victimTimes)
    // 승률: 각 참여 이벤트의 battle_started_at 을 tenant_battle_records 창에
    // 매칭해 outcome 을 꺼낸다. 역할과 무관하게 파티 전체가 공유하는 판정.
    const outcome = calcOutcomeStats(
      allEntries.map(([, v]) => findTrackedOutcome(v.startedAt, trackedWindows)),
    )
    aggs.push({
      discord_id: discordId,
      username: profile.username,
      avatar: profile.avatar,
      kills: c.kills,
      deaths: c.deaths,
      participations: allEntries.length,
      survivalRate: survival.survivalRate,
      evaluatedEvents: survival.evaluatedEvents,
      wins: outcome.wins,
      losses: outcome.losses,
      winRate: outcome.winRate,
      evaluatedOutcomeEvents: outcome.evaluatedEvents,
    })
  }

  const kills: LeaderboardEntry[] = aggs
    .filter((a) => a.kills > 0)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, TOP_N)
    .map((a) => ({
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      value: a.kills,
      kills: a.kills,
      deaths: a.deaths,
    }))

  const participation: LeaderboardEntry[] = aggs
    .filter((a) => a.participations > 0)
    .sort((a, b) => b.participations - a.participations)
    .slice(0, TOP_N)
    .map((a) => ({
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      value: a.participations,
    }))

  const survival: LeaderboardEntry[] = aggs
    .filter(
      (a) =>
        a.evaluatedEvents >= MIN_EVALUATED_FOR_SURVIVAL_RANK && a.survivalRate != null,
    )
    .sort((a, b) => (b.survivalRate! - a.survivalRate!) || (b.evaluatedEvents - a.evaluatedEvents))
    .slice(0, TOP_N)
    .map((a) => ({
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      value: Math.round((a.survivalRate ?? 0) * 100),
      evaluatedEvents: a.evaluatedEvents,
    }))

  const kd: LeaderboardEntry[] = aggs
    .filter((a) => a.kills + a.deaths >= MIN_EVENTS_FOR_KD_RANK && a.kills > 0)
    .map((a) => ({
      ...a,
      ratio: a.deaths === 0 ? a.kills : a.kills / a.deaths,
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, TOP_N)
    .map((a) => ({
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      value: Math.round(a.ratio * 100) / 100,
      kills: a.kills,
      deaths: a.deaths,
    }))

  const winRate: LeaderboardEntry[] = aggs
    .filter(
      (a) =>
        a.evaluatedOutcomeEvents >= MIN_EVALUATED_FOR_WINRATE_RANK && a.winRate != null,
    )
    .sort(
      (a, b) =>
        (b.winRate! - a.winRate!) || (b.evaluatedOutcomeEvents - a.evaluatedOutcomeEvents),
    )
    .slice(0, TOP_N)
    .map((a) => ({
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      value: Math.round((a.winRate ?? 0) * 100),
      wins: a.wins,
      losses: a.losses,
      evaluatedEvents: a.evaluatedOutcomeEvents,
    }))

  return { window, kills, participation, survival, kd, winRate }
}
