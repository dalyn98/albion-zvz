'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  calcOutcomeStats,
  calcSurvivalFromBattles,
} from '@/lib/member-stats'
import {
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
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
// 생존률 순위는 표본이 작을수록 우연히 100% 가 나오기 쉬우므로 최소 참여 배틀
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

  const [avatarsRes, killboardRes, trackedWindows] = await Promise.all([
    avatarsQ,
    killboardQ,
    fetchTrackedBattleWindows(db, guildId, cutoff),
  ])

  const avatarMap = new Map<string, { username: string; avatar: string | null }>()
  for (const a of avatarsRes.data ?? []) {
    if (a.discord_id && a.username) {
      avatarMap.set(a.discord_id, { username: a.username, avatar: a.avatar })
    }
  }

  // 멤버별로 killboard row 를 분리. groupMemberKillsByBattle 이 멤버 단위로
  // 배틀을 집계하므로 한 번에 전부 넘기면 멤버 구분이 사라진다.
  const killsByMember = new Map<string, KillboardRow[]>()
  for (const ke of (killboardRes.data ?? []) as KillboardRow[]) {
    if (!ke.discord_id) continue
    let list = killsByMember.get(ke.discord_id)
    if (!list) {
      list = []
      killsByMember.set(ke.discord_id, list)
    }
    list.push(ke)
  }

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
  for (const [discordId, kills] of killsByMember) {
    const profile = avatarMap.get(discordId)
    // 탈퇴자/비멤버는 랭킹에서 제외 (이름이 안 보임).
    if (!profile) continue
    const battles = groupMemberKillsByBattle(kills, trackedWindows)
    if (battles.length === 0) continue
    let killCount = 0
    let deathCount = 0
    for (const b of battles) {
      killCount += b.killCount
      deathCount += b.deathCount
    }
    const survival = calcSurvivalFromBattles(
      battles.map((b) => ({ startedAt: b.startedAt, hadDeath: b.hadDeath })),
    )
    const outcome = calcOutcomeStats(battles.map((b) => b.outcome))
    aggs.push({
      discord_id: discordId,
      username: profile.username,
      avatar: profile.avatar,
      kills: killCount,
      deaths: deathCount,
      participations: battles.length,
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
