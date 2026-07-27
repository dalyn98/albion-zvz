// 공개 길드 프로필 (`/g/<slug>`) 활동 섹션 — 최근 추적된 전투 1건 + 이번 주
// 탑킬러 3명. tenant_zvz_battle_records 와 killboard_events 를 직접 읽어 라이브
// 활동 시그널을 노출한다. 호출 페이지에서 공개 공통 데이터는 짧게 캐시한다.
//
// 가시성 게이팅은 호출자(공개 페이지)가 settings.showBattles / showLeaderboard
// 토글을 보고 결정. 이 모듈은 데이터만 모아 돌려준다.

import { getAdminClient } from '@/lib/supabase-admin'
import { discordAvatarUrl } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { loadActiveGuildProfileAvatars } from '@/lib/guild-profile-avatars'
import { getCurrentWeekStartIso } from '@/lib/timezone'
import {
  fetchMemberLeaderboardRollups,
  numberFromRollupValue,
  type MemberLeaderboardRollupRow,
} from '@/lib/member-leaderboard-rollups'
import {
  fetchMemberBattleParticipations,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from '@/lib/tracked-kills'
import { loadGuildBattleRollup } from '@/lib/guild-battle-rollup'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import type { BundleableRow } from '@/lib/battle-bundling'

export type BattleOutcome = 'win' | 'loss' | 'tie'

export interface RecentBattleSummary {
  startedAt: string
  outcome: BattleOutcome
  homeKills: number
  homeDeaths: number
  homeTeamSize: number
  primaryOpponentName: string | null
  sizeCategory: 'small' | 'middle' | 'large' | 'zerg'
}

export interface TopContributorSummary {
  // 안정 키 — Albion 캐릭터 ID. UI 라우팅 fallback 으로 사용.
  albionPlayerId: string
  // 본 함수의 모집단은 "Discord 로그인 한 길드원" 이므로 항상 채워짐.
  // 타입 호환성을 위해 nullable 시그니처는 유지.
  discordId: string | null
  name: string
  avatarUrl: string | null
  kills: number
}

interface TopContributorMemberMeta {
  discordId: string
  username: string
  avatar: string | null
}

export interface RecentTrackedBattleRow extends BundleableRow {
  started_at: string
  primary_opponent_name: string | null
  size_category: RecentBattleSummary['sizeCategory']
}

export function selectRecentTrackedBattleSummary(
  rows: ReadonlyArray<RecentTrackedBattleRow>,
  bundleSplits: boolean,
): RecentBattleSummary | null {
  if (bundleSplits) {
    const grouped = new Map<string, RecentTrackedBattleRow[]>()
    for (const row of rows) {
      const list = grouped.get(row.battle_record_id)
      if (list) list.push(row)
      else grouped.set(row.battle_record_id, [row])
    }

    const summaries: RecentBattleSummary[] = []
    for (const group of grouped.values()) {
      let homeKills = 0
      let homeDeaths = 0
      let homeTeamSize = 0
      let mainRow = group[0]
      for (const row of group) {
        homeKills += row.home_kills ?? 0
        homeDeaths += row.home_deaths ?? 0
        homeTeamSize = Math.max(homeTeamSize, row.home_team_size ?? 0)
        if ((row.main_opponent_team_size ?? 0) > (mainRow.main_opponent_team_size ?? 0)) {
          mainRow = row
        }
      }
      summaries.push({
        startedAt: mainRow.started_at,
        outcome: mainRow.outcome as BattleOutcome,
        homeKills,
        homeDeaths,
        homeTeamSize,
        primaryOpponentName: mainRow.primary_opponent_name,
        sizeCategory: mainRow.size_category,
      })
    }
    return summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
  }

  const latest = [...rows]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0]
  if (!latest) return null
  return {
    startedAt: latest.started_at,
    outcome: latest.outcome as BattleOutcome,
    homeKills: latest.home_kills ?? 0,
    homeDeaths: latest.home_deaths ?? 0,
    homeTeamSize: latest.home_team_size ?? 0,
    primaryOpponentName: latest.primary_opponent_name,
    sizeCategory: latest.size_category,
  }
}

// 공개 페이지 "전투기록" 카운트. /battles 와 동일하게 ZvZ 분류 + 길드별
// bundle_split_battles_in_stats 토글을 적용한다. 기존에 events 테이블을 세던
// 로직은 자동시작 이벤트가 모두 잡혀 실제 전투 수와 어긋났음 — 전투 record 기반
// ZvZ 분류 뷰가 진실 소스. 라이프타임 수라 row 가 많아질 수 있어 1000건 단위로 페이지 조회한다.
export async function loadTrackedBattleLifetimeCount(guildId: string): Promise<number> {
  return (await loadGuildBattleRollup(guildId)).battleCount
}

export async function loadRecentTrackedBattle(
  guildId: string,
): Promise<RecentBattleSummary | null> {
  const db = getAdminClient()
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'
  if (!bundleEnabled) {
    const { data } = await db
      .from('tenant_zvz_battle_records')
      .select(
        'battle_record_id, started_at, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size, primary_opponent_name, size_category',
      )
      .eq('guild_id', guildId)
      .order('started_at', { ascending: false })
      .limit(1)

    return selectRecentTrackedBattleSummary((data ?? []) as RecentTrackedBattleRow[], bundleEnabled)
  }

  const rows = await selectPagedRowsOrThrow<RecentTrackedBattleRow>({
    label: 'recent tracked battle bundled rows',
    buildQuery: () =>
      db
        .from('tenant_zvz_battle_records')
        .select(
          'battle_record_id, started_at, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size, primary_opponent_name, size_category',
        )
        .eq('guild_id', guildId)
        .order('started_at', { ascending: false })
        .order('battle_record_id', { ascending: true }) as unknown as SupabasePagedQuery<RecentTrackedBattleRow>,
  })

  return selectRecentTrackedBattleSummary(rows, bundleEnabled)
}

// 이번 주 (PT 월요일 00:00 ~ 현재) 길드원 킬 카운트 상위 N명. /leaderboard 와
// 동일한 판정 규칙을 적용 — tracked battle window 안의 killboard_events 만
// 인정해 1:1 갱킹/저인게이지 전투는 자동 제외된다. row 수가 큰 길드라도 cutoff
// 으로 이미 좁혀져 메모리 집계로 충분.
//
// 길드 공개 페이지와 /leaderboard 가 다른 숫자를 보여주던 버그(공개 페이지가
// 모든 killboard 이벤트를 셌음) 의 고정. 주 경계는 PT 월요일 00:00 (#204).
export async function loadTopContributorsThisWeek(
  guildId: string,
  limit: number = 3,
): Promise<TopContributorSummary[]> {
  const db = getAdminClient()
  const sinceIso = getCurrentWeekStartIso()
  const bundleSplits =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

  // 모집단: Discord 로그인 한 활성 길드원만 (guild_avatars). 정책: 업적/통계/
  // 리더보드는 "앱 내 가입한 길드원" 만 표시 — Albion API 로 동기화된 길드원이어도
  // Discord OAuth 로 앱에 가입하지 않았다면 노출하지 않는다. 길드원 카운트
  // (`길드원 N명`) 와 동일한 분모를 쓰기 위함.
  //
  // killboard_events 는 discord_id IS NOT NULL 게이트로 "사이트 가입 이후
  // 발생한 kill" 만 통과시킨다. 리더보드/멤버 상세/RPC 와 동일 정책.
  // (관련 메모: feedback_albion_zvz_stats_membership_policy)
  const [avatars, rpcRollups] =
    await Promise.all([
      loadActiveGuildProfileAvatars(guildId),
      fetchMemberLeaderboardRollups(db, guildId, sinceIso, bundleSplits),
    ])

  const metaByAlbionId = new Map<string, TopContributorMemberMeta>()
  for (const av of avatars) {
    if (!av.albionPlayerId) continue
    metaByAlbionId.set(av.albionPlayerId, {
      discordId: av.discordId,
      username: av.username,
      avatar: av.avatar,
    })
  }

  if (rpcRollups) {
    return topContributorsFromRollups(rpcRollups, metaByAlbionId, limit)
  }

  return loadTopContributorsThisWeekFallback(db, guildId, sinceIso, bundleSplits, metaByAlbionId, limit)
}

export function topContributorsFromRollups(
  rows: readonly MemberLeaderboardRollupRow[],
  metaByAlbionId: ReadonlyMap<string, TopContributorMemberMeta>,
  limit: number,
): TopContributorSummary[] {
  const contributors: TopContributorSummary[] = []
  for (const row of rows) {
    if (!row.albion_player_id) continue
    const meta = metaByAlbionId.get(row.albion_player_id)
    if (!meta) continue
    const kills = numberFromRollupValue(row.kills)
    if (kills === 0) continue
    contributors.push({
      albionPlayerId: row.albion_player_id,
      discordId: meta.discordId,
      name: meta.username,
      avatarUrl: discordAvatarUrl(meta.discordId, meta.avatar, 64),
      kills,
    })
  }
  return contributors
    .sort((a, b) => b.kills - a.kills)
    .slice(0, limit)
}

async function loadTopContributorsThisWeekFallback(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  sinceIso: string,
  bundleSplits: boolean,
  metaByAlbionId: ReadonlyMap<string, TopContributorMemberMeta>,
  limit: number,
): Promise<TopContributorSummary[]> {
  type KillRow = {
    event_id: number | string | null
    albion_player_id: string | null
    role: string | null
    occurred_at: string | null
    battle_id: number | null
  }
  const [killboardRows, trackedBattles, participations] = await Promise.all([
    selectPagedRowsOrThrow<KillRow>({
      label: 'weekly top contributors killboard events',
      buildQuery: () =>
        db
          .from('killboard_events')
          .select('event_id, albion_player_id, role, occurred_at, battle_id')
          .eq('guild_id', guildId)
          .gte('occurred_at', sinceIso)
          .not('discord_id', 'is', null)
          .order('occurred_at', { ascending: true })
          .order('event_id', { ascending: true }) as unknown as SupabasePagedQuery<KillRow>,
    }),
    fetchTrackedBattleWindows(db, guildId, sinceIso, { bundleSplits }),
    fetchMemberBattleParticipations(db, guildId, sinceIso),
  ])

  const killsByMember = new Map<string, KillRow[]>()
  for (const ke of killboardRows) {
    if (!ke.albion_player_id) continue
    let list = killsByMember.get(ke.albion_player_id)
    if (!list) {
      list = []
      killsByMember.set(ke.albion_player_id, list)
    }
    list.push(ke)
  }

  // killboard 만 보면 0K 멤버가 빠지지만 탑 킬러는 어차피 1킬 이상이라 굳이
  // 합집합을 쓰지 않아도 결과가 같다. 하지만 leaderboard 와 같은 코드 경로를
  // 쓰는 게 가독성/일관성 면에서 좋아 같은 패턴으로 작성.
  const allAlbionIds = new Set<string>([
    ...killsByMember.keys(),
    ...participations.byAlbionPlayerId.keys(),
  ])

  const aggs: Array<{ albionPlayerId: string; meta: TopContributorMemberMeta; kills: number }> = []
  for (const albionId of allAlbionIds) {
    const meta = metaByAlbionId.get(albionId)
    // 탈퇴자 + Discord 미연동 Albion 멤버 모두 제외 — guild_avatars 에 활성 행이
    // 없는 albion_player_id 는 표시하지 않는다 (정책: 앱 가입 길드원만 노출).
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
    for (const b of battles) killCount += b.killCount
    if (killCount === 0) continue
    aggs.push({ albionPlayerId: albionId, meta, kills: killCount })
  }

  return aggs
    .sort((a, b) => b.kills - a.kills)
    .slice(0, limit)
    .map((a) => ({
      albionPlayerId: a.albionPlayerId,
      discordId: a.meta.discordId,
      name: a.meta.username,
      avatarUrl: discordAvatarUrl(a.meta.discordId, a.meta.avatar, 64),
      kills: a.kills,
    }))
}
