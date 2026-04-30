// 공개 길드 프로필 (`/g/<slug>`) 활동 섹션 — 최근 추적된 전투 1건 + 이번 주
// 탑킬러 3명. tenant_battle_records 와 killboard_events 를 직접 읽어 라이브
// 활동 시그널을 노출한다. 어드민 카운트와 달리 force-dynamic 페이지의 매 요청
// 새로 풀린다 (캐시 비용보다 단순함이 이득).
//
// 가시성 게이팅은 호출자(공개 페이지)가 settings.showBattles / showLeaderboard
// 토글을 보고 결정. 이 모듈은 데이터만 모아 돌려준다.

import { getAdminClient } from '@/lib/supabase-admin'
import { discordAvatarUrl } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { isHighEngagement } from '@/lib/low-engagement-cut'
import { bundleSplitBattles, type BundleableRow } from '@/lib/battle-bundling'

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
  discordId: string
  name: string
  avatarUrl: string | null
  kills: number
}

const TOP_CONTRIBUTORS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// 공개 페이지 "전투기록" 카운트. /battles 와 동일하게 low-engagement 컷 + 길드별
// bundle_split_battles_in_stats 토글을 적용한다. 기존에 events 테이블을 세던
// 로직은 자동시작 이벤트가 모두 잡혀 실제 전투 수와 어긋났음 — tenant_battle_records
// 가 진실 소스. 라이프타임 수라 row 가 많아질 수 있지만 force-dynamic 페이지라
// 매 요청 페치 + JS 필터로 충분 (대부분 길드는 수백 row 미만).
export async function loadTrackedBattleLifetimeCount(guildId: string): Promise<number> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenant_battle_records')
    .select(
      'battle_record_id, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size',
    )
    .eq('guild_id', guildId)

  const rows = (data ?? []) as BundleableRow[]
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

  if (bundleEnabled) {
    const bundled = bundleSplitBattles(rows)
    let count = 0
    for (const b of bundled) {
      if (
        isHighEngagement({
          homeKills: b.homeKills,
          homeDeaths: b.homeDeaths,
          homeTeamSize: b.homeTeamSize,
        })
      ) {
        count += 1
      }
    }
    return count
  }

  let count = 0
  for (const row of rows) {
    if (
      isHighEngagement({
        homeKills: row.home_kills,
        homeDeaths: row.home_deaths,
        homeTeamSize: row.home_team_size,
      })
    ) {
      count += 1
    }
  }
  return count
}

export async function loadRecentTrackedBattle(
  guildId: string,
): Promise<RecentBattleSummary | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenant_battle_records')
    .select(
      'started_at, outcome, home_kills, home_deaths, home_team_size, primary_opponent_name, size_category',
    )
    .eq('guild_id', guildId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    startedAt: data.started_at as string,
    outcome: data.outcome as BattleOutcome,
    homeKills: (data.home_kills as number) ?? 0,
    homeDeaths: (data.home_deaths as number) ?? 0,
    homeTeamSize: (data.home_team_size as number) ?? 0,
    primaryOpponentName: (data.primary_opponent_name as string | null) ?? null,
    sizeCategory: data.size_category as RecentBattleSummary['sizeCategory'],
  }
}

// 이번 주(롤링 7일) 길드원 킬 카운트 상위 N명. killboard_events 에서 이 길드의
// killer 행만 끌어와 메모리에서 grouping — leaderboard 랑 같은 패턴.
// 7일치 row 수가 큰 길드는 한 번 더 인덱스 활용을 위해 (guild_id, occurred_at)
// 으로 좁히고 시작 시각을 gte 로 자른다.
export async function loadTopContributorsThisWeek(
  guildId: string,
  limit: number = 3,
): Promise<TopContributorSummary[]> {
  const db = getAdminClient()
  const sinceIso = new Date(Date.now() - TOP_CONTRIBUTORS_WINDOW_MS).toISOString()

  const { data: kills } = await db
    .from('killboard_events')
    .select('discord_id')
    .eq('guild_id', guildId)
    .eq('role', 'killer')
    .gte('occurred_at', sinceIso)

  const counts = new Map<string, number>()
  for (const row of (kills ?? []) as { discord_id: string | null }[]) {
    const id = row.discord_id
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
  if (top.length === 0) return []

  const ids = top.map(([id]) => id)
  const { data: avatars } = await db
    .from('guild_avatars')
    .select('discord_id, username, avatar')
    .eq('guild_id', guildId)
    .in('discord_id', ids)

  const avatarMap = new Map<string, { username: string | null; avatar: string | null }>()
  for (const row of (avatars ?? []) as {
    discord_id: string
    username: string | null
    avatar: string | null
  }[]) {
    avatarMap.set(row.discord_id, { username: row.username, avatar: row.avatar })
  }

  return top.map(([discordId, kills]) => {
    const av = avatarMap.get(discordId)
    return {
      discordId,
      name: av?.username ?? '???',
      avatarUrl: discordAvatarUrl(discordId, av?.avatar ?? null, 64),
      kills,
    }
  })
}
