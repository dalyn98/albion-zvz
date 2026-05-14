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
import { getAppSetting } from '@/lib/app-settings'
import { getCurrentWeekStartIso } from '@/lib/timezone'

export type LeaderboardWindow = 'week' | 'month' | 'all'

export interface LeaderboardEntry {
  // Albion 캐릭터 ID. UI 라우팅 fallback 으로 사용.
  albion_player_id: string
  // 본 액션의 모집단은 "Discord 로그인 한 길드원" 이라 항상 채워짐. 타입 호환성을
  // 위해 nullable 시그니처는 유지 (LeaderboardEntry consumer 가 null 분기 가짐).
  discord_id: string | null
  // Discord username.
  username: string
  // Discord 아바타 hash.
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
  // 액션이 데이터를 만들어낸 시각. UI 의 "방금 업데이트" 칩 데이터 소스.
  // force-dynamic 라우트라 매 요청마다 새로 계산되므로 곧 stale 표시에 쓸 수 있다.
  fetchedAt: string
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

// 'week' 는 PT 월요일 00:00 (사이트 전역 #204) — 길드 공개 페이지의 "이번 주
// 탑 킬러" 와 같은 경계를 보게 한다. 'month' 는 직관적인 30일 롤링 (월 경계가
// 아니라 "최근 한 달" 의 의미 그대로).
function cutoffFor(window: LeaderboardWindow): string | null {
  if (window === 'all') return null
  if (window === 'week') return getCurrentWeekStartIso()
  return new Date(Date.now() - 30 * DAY_MS).toISOString()
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
  const bundleSplits =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

  // 모집단: Discord 로그인 한 활성 길드원만 (guild_avatars where withdrawn_at IS NULL).
  // 정책: 업적/통계/리더보드는 "앱 내 가입한 길드원" 만 표시 — Albion API 로
  // 동기화된 길드원이어도 OAuth 로 앱에 가입하지 않았다면 노출하지 않는다. 길드
  // 공개 페이지의 길드원 카운트(guild_avatars)와 분모를 일치시키기 위함.
  const avatarsQ = db
    .from('guild_avatars')
    .select('discord_id, username, avatar, albion_player_id')
    .eq('guild_id', guildId)
    .is('withdrawn_at', null)
    .not('albion_player_id', 'is', null)

  // discord_id IS NOT NULL 은 "가입 이후 발생 kill" 게이트. killboard sync 가
  // upsert 시 ignoreDuplicates=true 라 가입 전 미연동 sync 된 행은 discord_id=NULL
  // 인 채로 남는다. 따라서 이 필터가 자연스럽게 가입 후 kill 만 통과시킴.
  // 정책: 업적/통계/리더보드 = "사이트 가입자 + 가입 이후 기록".
  // (관련 메모: feedback_albion_zvz_stats_membership_policy)
  let killboardQ = db
    .from('killboard_events')
    .select('albion_player_id, role, occurred_at, battle_id')
    .eq('guild_id', guildId)
    .not('discord_id', 'is', null)
  if (cutoff) killboardQ = killboardQ.gte('occurred_at', cutoff)

  const [avatarsRes, killboardRes, trackedBattles, participations] = await Promise.all([
    avatarsQ,
    killboardQ,
    fetchTrackedBattleWindows(db, guildId, cutoff, { bundleSplits }),
    fetchMemberBattleParticipations(db, guildId, cutoff),
  ])

  // albion_player_id → 표시용 메타 (Discord username/avatar). 모집단에서 이미
  // Discord 연동 멤버만 남았으므로 단일 패스로 채운다.
  interface MemberMeta {
    discord_id: string
    username: string
    avatar: string | null
  }
  const metaByAlbionId = new Map<string, MemberMeta>()
  for (const av of avatarsRes.data ?? []) {
    if (!av.albion_player_id || !av.discord_id || !av.username) continue
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
    // 탈퇴자 + Discord 미연동 Albion 멤버 모두 제외 — guild_avatars 에 활성 행이
    // 없는 albion_player_id 는 랭킹에 노출하지 않는다 (정책: 앱 가입 길드원만).
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

  return { window, kills, participation, survival, kd, winRate, fetchedAt: new Date().toISOString() }
}
