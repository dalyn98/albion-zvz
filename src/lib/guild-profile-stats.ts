// 공개 길드 프로필 (`/g/<slug>`) 의 자동 추출 통계 — 어드민이 자유 텍스트로
// 채우는 hero / event-schedule 섹션과 달리 이 파일의 값들은 길드 활동 데이터
// (tenant_battle_records, killboard_events, albion_guild_members, guild_avatars)
// 에서 그대로 합산해 노출한다.
//
// 가시성 게이팅은 호출자가 결정 (settings.show* + enabled 토글). 이 모듈은
// 데이터만 모아 돌려준다.
//
// 30일 윈도우 메트릭 (무기 분포 / 라이벌 길드) 은 "최근 활동" 의 의미 그대로
// 30일 롤링. 라이프타임 메트릭 (K/D, 승률) 은 cutoff 없음.

import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { isHighEngagement } from '@/lib/low-engagement-cut'
import { bundleSplitBattles, type BundleableRow } from '@/lib/battle-bundling'
import { discordAvatarUrl } from '@/lib/discord-avatar'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { fetchTrackedBattleWindows, isWithinTrackedWindow } from '@/lib/tracked-kills'

const DAY_MS = 24 * 60 * 60 * 1000
const ROLLING_WINDOW_DAYS = 30
const TOP_WEAPONS = 5
const TOP_RIVALS = 3

export interface LifetimeBattleStats {
  // 합산 킬 / 사망 (high-engagement 컷 + 옵션 번들 적용 후).
  kills: number
  deaths: number
  // 비율 — deaths 0 일 때 kills 그대로 (Infinity 대신 큰 수). 표시 측이 처리.
  kdRatio: number | null
  // 승률 분모는 win+loss (tie 제외 — 의미 없는 동률은 흐릿하게).
  wins: number
  losses: number
  ties: number
  // 분모 0 면 null (소표본 길드는 표시 X).
  winRate: number | null
  // 컷 이후 의미 있다고 평가된 전투 수 (UI 신뢰도 표시용).
  evaluatedBattles: number
}

export async function loadLifetimeBattleStats(
  guildId: string,
): Promise<LifetimeBattleStats> {
  const db = getAdminClient()
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

  const { data } = await db
    .from('tenant_battle_records')
    .select(
      'battle_record_id, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size',
    )
    .eq('guild_id', guildId)

  const rows = (data ?? []) as BundleableRow[]
  const evaluated = bundleEnabled
    ? bundleSplitBattles(rows).map((b) => ({
        outcome: b.outcome,
        homeKills: b.homeKills,
        homeDeaths: b.homeDeaths,
        homeTeamSize: b.homeTeamSize,
      }))
    : rows.map((r) => ({
        outcome: r.outcome,
        homeKills: r.home_kills,
        homeDeaths: r.home_deaths,
        homeTeamSize: r.home_team_size,
      }))

  let kills = 0
  let deaths = 0
  let wins = 0
  let losses = 0
  let ties = 0
  let count = 0
  for (const b of evaluated) {
    if (!isHighEngagement(b)) continue
    count += 1
    kills += b.homeKills
    deaths += b.homeDeaths
    if (b.outcome === 'win') wins += 1
    else if (b.outcome === 'loss') losses += 1
    else if (b.outcome === 'tie') ties += 1
  }

  const decided = wins + losses
  return {
    kills,
    deaths,
    // deaths === 0 일 때는 kills 자체를 비율로 노출 — 표시 측이 "∞" 처럼 다룸.
    kdRatio: kills + deaths === 0 ? null : deaths === 0 ? kills : kills / deaths,
    wins,
    losses,
    ties,
    winRate: decided === 0 ? null : wins / decided,
    evaluatedBattles: count,
  }
}

export interface AverageItemPowerStats {
  // 활성 (left_at IS NULL) 알비온 길드원의 평균 IP. 멤버 0 또는 평균 0 이면 null.
  avgIp: number | null
  // 평균 산정에 들어간 멤버 수 (UI 신뢰도 라벨 — "N명 기준").
  sampleSize: number
}

export async function loadAverageItemPower(
  guildId: string,
): Promise<AverageItemPowerStats> {
  const db = getAdminClient()
  const { data } = await db
    .from('albion_guild_members')
    .select('average_item_power')
    .eq('guild_id', guildId)
    .is('left_at', null)

  const rows = (data ?? []) as Array<{ average_item_power: number | null }>
  let total = 0
  let n = 0
  for (const r of rows) {
    const ip = r.average_item_power ?? 0
    if (ip <= 0) continue
    total += ip
    n += 1
  }
  return {
    avgIp: n === 0 ? null : Math.round(total / n),
    sampleSize: n,
  }
}

export interface WeaponCategoryUsage {
  // extractWeaponCategory 결과 — 예: 'HOLYSTAFF', 'FIRESTAFF'. UI 가 i18n 라벨로 변환.
  category: string
  // 가장 최근 관측된 원본 item_id — 아이콘 렌더 용도.
  sampleItemId: string
  // 무기 카테고리 사용 건수 (killer 행 기준, 분포 비율은 호출자가 합으로 나눔).
  count: number
}

export async function loadTopWeaponCategoriesLast30d(
  guildId: string,
): Promise<WeaponCategoryUsage[]> {
  const db = getAdminClient()
  const cutoffIso = new Date(Date.now() - ROLLING_WINDOW_DAYS * DAY_MS).toISOString()
  // tracked battle 안에서 발생한 killer 이벤트만 집계 — /battles 에 잡히지 않는
  // 1:1 갱킹·소규모 전투의 무기는 "주력 무기" 라기엔 노이즈에 가깝다. 통계 카운트
  // 과 동일하게 bundle_split 토글을 따라 매치업 분리 row 들을 1전투로 묶는다.
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'
  const tracked = await fetchTrackedBattleWindows(db, guildId, cutoffIso, {
    bundleSplits: bundleEnabled,
  })
  if (tracked.windows.length === 0) return []

  const { data } = await db
    .from('killboard_events')
    .select('equipment, occurred_at, battle_id')
    .eq('guild_id', guildId)
    .eq('role', 'killer')
    .gte('occurred_at', cutoffIso)

  type Row = {
    equipment: { MainHand?: { Type?: string } | null } | null
    occurred_at: string | null
    battle_id: number | string | null
  }
  const agg = new Map<string, { sampleId: string; count: number }>()
  for (const row of (data ?? []) as Row[]) {
    const mainHandType = row.equipment?.MainHand?.Type
    if (!mainHandType) continue
    const battleId =
      typeof row.battle_id === 'number'
        ? row.battle_id
        : typeof row.battle_id === 'string' && row.battle_id.length > 0
          ? Number(row.battle_id)
          : null
    if (!isWithinTrackedWindow(row.occurred_at, battleId, tracked)) continue
    const category = extractWeaponCategory(mainHandType)
    if (!category) continue
    const cur = agg.get(category)
    if (cur) {
      cur.count += 1
      cur.sampleId = mainHandType
    } else {
      agg.set(category, { sampleId: mainHandType, count: 1 })
    }
  }

  return Array.from(agg.entries())
    .map(([category, v]) => ({ category, sampleItemId: v.sampleId, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_WEAPONS)
}

export interface RivalGuild {
  // primary_opponent_name 그대로 (Albion guild name).
  guildName: string
  // 매치업 행 카운트 (번들 X — 한 albion battle 에 여러 force 가 있으면 각각).
  battleCount: number
  // 우리 측 outcome 분포 (UI 에서 "vs X: 5승 3패" 처럼).
  wins: number
  losses: number
  ties: number
}

export async function loadTopRivalsLast30d(
  guildId: string,
): Promise<RivalGuild[]> {
  const db = getAdminClient()
  const cutoff = new Date(Date.now() - ROLLING_WINDOW_DAYS * DAY_MS).toISOString()
  const { data } = await db
    .from('tenant_battle_records')
    .select('primary_opponent_name, outcome')
    .eq('guild_id', guildId)
    .gte('started_at', cutoff)

  type Row = { primary_opponent_name: string | null; outcome: string | null }
  const agg = new Map<string, { count: number; wins: number; losses: number; ties: number }>()
  for (const row of (data ?? []) as Row[]) {
    const name = row.primary_opponent_name?.trim()
    if (!name) continue
    let entry = agg.get(name)
    if (!entry) {
      entry = { count: 0, wins: 0, losses: 0, ties: 0 }
      agg.set(name, entry)
    }
    entry.count += 1
    if (row.outcome === 'win') entry.wins += 1
    else if (row.outcome === 'loss') entry.losses += 1
    else if (row.outcome === 'tie') entry.ties += 1
  }

  return Array.from(agg.entries())
    .map(([guildName, v]) => ({ guildName, battleCount: v.count, ...v }))
    .sort((a, b) => b.battleCount - a.battleCount)
    .slice(0, TOP_RIVALS)
}

export interface AdminTeamMember {
  discordId: string
  username: string
  avatarUrl: string | null
}

export async function loadAdminTeam(guildId: string): Promise<AdminTeamMember[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('discord_id, username, avatar')
    .eq('guild_id', guildId)
    .eq('is_admin', true)
    .is('withdrawn_at', null)
    .order('username', { ascending: true })

  type Row = { discord_id: string | null; username: string | null; avatar: string | null }
  const out: AdminTeamMember[] = []
  for (const row of (data ?? []) as Row[]) {
    if (!row.discord_id || !row.username) continue
    out.push({
      discordId: row.discord_id,
      username: row.username,
      avatarUrl: discordAvatarUrl(row.discord_id, row.avatar, 64),
    })
  }
  return out
}

// 어드민의 명시 override (`guild_profile_server`) 가 비어 있을 때 fallback 으로
// tenant 의 `albion_server` 설정값을 그대로 사용. 한 길드는 단일 서버에 속하므로
// majority 계산 없이 직접 매핑이 정확. albion_server 도 비어 있으면 'east' 하드
// 디폴트 (앱 전역 fallback 과 일치).
export async function resolveProfileServer(
  guildId: string,
  override: string,
): Promise<'east' | 'west' | 'europe'> {
  if (override === 'east' || override === 'west' || override === 'europe') {
    return override
  }
  const raw = await getAppSetting('albion_server', 'east', guildId)
  if (raw === 'east' || raw === 'west' || raw === 'europe') return raw
  return 'east'
}
