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
import { getCurrentWeekStartIso } from '@/lib/timezone'
import {
  fetchMemberBattleParticipations,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from '@/lib/tracked-kills'

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
    .eq('is_high_engagement', true)
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
  const [avatarsRes, killboardRes, trackedBattles, participations] =
    await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, albion_player_id')
        .eq('guild_id', guildId)
        .is('withdrawn_at', null)
        .not('albion_player_id', 'is', null),
      db
        .from('killboard_events')
        .select('albion_player_id, role, occurred_at, battle_id')
        .eq('guild_id', guildId)
        .gte('occurred_at', sinceIso)
        .not('discord_id', 'is', null),
      fetchTrackedBattleWindows(db, guildId, sinceIso, { bundleSplits }),
      fetchMemberBattleParticipations(db, guildId, sinceIso),
    ])

  interface MemberMeta {
    discordId: string
    username: string
    avatar: string | null
  }
  const metaByAlbionId = new Map<string, MemberMeta>()
  for (const av of avatarsRes.data ?? []) {
    if (!av.albion_player_id || !av.discord_id || !av.username) continue
    metaByAlbionId.set(av.albion_player_id as string, {
      discordId: av.discord_id as string,
      username: av.username as string,
      avatar: (av.avatar as string | null) ?? null,
    })
  }

  type KillRow = {
    albion_player_id: string | null
    role: string | null
    occurred_at: string | null
    battle_id: number | null
  }
  const killsByMember = new Map<string, KillRow[]>()
  for (const ke of (killboardRes.data ?? []) as KillRow[]) {
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

  const aggs: Array<{ albionPlayerId: string; meta: MemberMeta; kills: number }> = []
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
