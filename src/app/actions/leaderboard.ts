'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  calcOutcomeStats,
  calcSurvivalFromBattles,
} from '@/lib/member-stats'
import {
  fetchMemberBattleParticipations,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from '@/lib/tracked-kills'

export type LeaderboardWindow = 'week' | 'month' | 'all'

export interface LeaderboardEntry {
  // 모든 길드 멤버를 식별하는 안정 키. UI 라우팅의 fallback 도 이 ID 로.
  albion_player_id: string
  // Discord 연동 멤버만 채워짐. null = 미연동 → /members/albion/[albion_player_id]
  // 로 라우팅, 풀 이미지 없음.
  discord_id: string | null
  // 연동 멤버는 Discord username, 미연동은 albion_player_name.
  username: string
  // Discord 아바타 hash. 미연동은 null.
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
  albion_player_id: string | null
  role: string | null
  occurred_at: string | null
  battle_id: number | null
}

export async function getLeaderboard(
  window: LeaderboardWindow = 'week',
): Promise<LeaderboardData | null> {
  const session = await getSession()
  if (!session) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const cutoff = cutoffFor(window)

  // 모집단: albion_guild_members (left_at IS NULL = 활성). guild_avatars 는
  // Discord username/avatar 를 채우기 위한 LEFT JOIN — 미연동 멤버는 albion
  // 닉네임을 username 으로 사용한다.
  const rosterQ = db
    .from('albion_guild_members')
    .select('albion_player_id, albion_player_name')
    .eq('guild_id', guildId)
    .is('left_at', null)

  const avatarsQ = db
    .from('guild_avatars')
    .select('discord_id, username, avatar, albion_player_id')
    .eq('guild_id', guildId)
    .is('withdrawn_at', null)
    .not('albion_player_id', 'is', null)

  let killboardQ = db
    .from('killboard_events')
    .select('albion_player_id, role, occurred_at, battle_id')
    .eq('guild_id', guildId)
  if (cutoff) killboardQ = killboardQ.gte('occurred_at', cutoff)

  const [rosterRes, avatarsRes, killboardRes, trackedBattles, participations] = await Promise.all([
    rosterQ,
    avatarsQ,
    killboardQ,
    fetchTrackedBattleWindows(db, guildId, cutoff),
    fetchMemberBattleParticipations(db, guildId, cutoff),
  ])

  // albion_player_id → 표시용 메타 (username/avatar/discord_id). 연동 멤버는
  // guild_avatars 우선, 미연동은 albion_player_name fallback.
  interface MemberMeta {
    discord_id: string | null
    username: string
    avatar: string | null
  }
  const metaByAlbionId = new Map<string, MemberMeta>()
  for (const row of rosterRes.data ?? []) {
    if (!row.albion_player_id) continue
    metaByAlbionId.set(row.albion_player_id, {
      discord_id: null,
      username: row.albion_player_name as string,
      avatar: null,
    })
  }
  for (const av of avatarsRes.data ?? []) {
    if (!av.albion_player_id || !av.discord_id || !av.username) continue
    // 로스터에 없는 행이라도 (sync timing 차이로) Discord 멤버는 신뢰.
    metaByAlbionId.set(av.albion_player_id as string, {
      discord_id: av.discord_id,
      username: av.username,
      avatar: av.avatar,
    })
  }

  // 멤버별로 killboard row 를 분리. groupMemberKillsByBattle 이 멤버 단위로
  // 배틀을 집계하므로 한 번에 전부 넘기면 멤버 구분이 사라진다.
  const killsByMember = new Map<string, KillboardRow[]>()
  for (const ke of (killboardRes.data ?? []) as KillboardRow[]) {
    if (!ke.albion_player_id) continue
    let list = killsByMember.get(ke.albion_player_id)
    if (!list) {
      list = []
      killsByMember.set(ke.albion_player_id, list)
    }
    list.push(ke)
  }

  interface Agg {
    albion_player_id: string
    discord_id: string | null
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
  // (killboard 기준 멤버) ∪ (raw_battle 기준 참여자). 0k0d 참여자는 killsByMember
  // 에 없지만 participations.byAlbionPlayerId 에는 있으므로 합집합이 필요.
  const allAlbionIds = new Set<string>([
    ...killsByMember.keys(),
    ...participations.byAlbionPlayerId.keys(),
  ])
  for (const albionId of allAlbionIds) {
    const meta = metaByAlbionId.get(albionId)
    // 로스터/아바타 둘 다에 없으면 이미 길드 탈퇴자 — 랭킹에서 제외.
    if (!meta) continue
    const kills = killsByMember.get(albionId) ?? []
    const killBattles = groupMemberKillsByBattle(kills, trackedBattles)
    const battles = mergeMemberBattles(
      killBattles,
      participations.byAlbionPlayerId.get(albionId),
      trackedBattles,
    )
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
      albion_player_id: albionId,
      discord_id: meta.discord_id,
      username: meta.username,
      avatar: meta.avatar,
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

  const baseEntry = (a: Agg): Pick<LeaderboardEntry, 'albion_player_id' | 'discord_id' | 'username' | 'avatar'> => ({
    albion_player_id: a.albion_player_id,
    discord_id: a.discord_id,
    username: a.username,
    avatar: a.avatar,
  })

  const kills: LeaderboardEntry[] = aggs
    .filter((a) => a.kills > 0)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, TOP_N)
    .map((a) => ({
      ...baseEntry(a),
      value: a.kills,
      kills: a.kills,
      deaths: a.deaths,
    }))

  const participation: LeaderboardEntry[] = aggs
    .filter((a) => a.participations > 0)
    .sort((a, b) => b.participations - a.participations)
    .slice(0, TOP_N)
    .map((a) => ({
      ...baseEntry(a),
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
      ...baseEntry(a),
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
      ...baseEntry(a),
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
      ...baseEntry(a),
      value: Math.round((a.winRate ?? 0) * 100),
      wins: a.wins,
      losses: a.losses,
      evaluatedEvents: a.evaluatedOutcomeEvents,
    }))

  return { window, kills, participation, survival, kd, winRate }
}
