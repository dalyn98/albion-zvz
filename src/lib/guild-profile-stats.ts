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
import { discordAvatarUrl } from '@/lib/discord-avatar'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { loadGuildBattleRollup } from '@/lib/guild-battle-rollup'
import { fetchTrackedBattleWindows, findTrackedBattleKey } from '@/lib/tracked-kills'
import { getGuild, isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { isMissingRpcError } from '@/lib/supabase-rpc-errors'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from '@/lib/supabase-pagination'

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
  const rollup = await loadGuildBattleRollup(guildId)
  const kills = rollup.totalKills
  const deaths = rollup.totalDeaths
  const wins = rollup.winCount
  const losses = rollup.lossCount
  const ties = rollup.tieCount

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
    evaluatedBattles: rollup.battleCount,
  }
}

export interface WeaponCategoryUsage {
  // extractWeaponCategory 결과 — 예: 'HOLYSTAFF', 'FIRESTAFF'. UI 가 i18n 라벨로 변환.
  category: string
  // 가장 최근 관측된 원본 item_id — 아이콘 렌더 용도.
  sampleItemId: string
  // 무기 카테고리가 관측된 tracked battle 수. 같은 battle 안의 중복 킬은 1회.
  count: number
}

export async function loadTopWeaponCategoriesLast30d(
  guildId: string,
): Promise<WeaponCategoryUsage[]> {
  const db = getAdminClient()
  const cutoffIso = new Date(Date.now() - ROLLING_WINDOW_DAYS * DAY_MS).toISOString()
  // tracked battle 안에서 발생한 killer 이벤트만 집계 — /battles 에 잡히지 않는
  // 1:1 갱킹·소규모 전투의 무기는 "주력 무기" 라기엔 노이즈에 가깝다. 통계 카운트
  // 과 동일하게 bundle_split 토글을 따라 매치업 분리 row 들을 1전투로 묶고,
  // 같은 전투에서 같은 카테고리가 여러 킬을 내도 "사용 전투 1회" 로 센다.
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'
  const tracked = await fetchTrackedBattleWindows(db, guildId, cutoffIso, {
    bundleSplits: bundleEnabled,
  })
  if (tracked.windows.length === 0) return []

  // discord_id NOT NULL — 사이트에 가입(Discord OAuth)한 길드원의 무기만 집계.
  // killboard_events 는 mig 091 부터 미연동 Albion 멤버 행도 담을 수 있어
  // 필터 없으면 사이트에 한 번도 들른 적 없는 길드원의 무기까지 섞인다.
  // 정책은 리더보드/탑킬러 (6d38235) 와 동일 — "앱 내 가입한 길드원 표시".
  type Row = {
    equipment: { MainHand?: { Type?: string } | null } | null
    occurred_at: string | null
    battle_id: number | string | null
  }
  const rows = await selectPagedRowsOrThrow<Row>({
    label: 'guild top weapon killboard events',
    buildQuery: () =>
      db
        .from('killboard_events')
        .select('equipment, occurred_at, battle_id')
        .eq('guild_id', guildId)
        .eq('role', 'killer')
        .gte('occurred_at', cutoffIso)
        .not('discord_id', 'is', null)
        .order('occurred_at', { ascending: true })
        .order('event_id', { ascending: true }) as unknown as SupabasePagedQuery<Row>,
  })
  const agg = new Map<string, { sampleId: string; battleKeys: Set<string> }>()
  for (const row of rows) {
    const mainHandType = row.equipment?.MainHand?.Type
    if (!mainHandType) continue
    const battleId =
      typeof row.battle_id === 'number'
        ? row.battle_id
        : typeof row.battle_id === 'string' && row.battle_id.length > 0
          ? Number(row.battle_id)
          : null
    const battleKey = findTrackedBattleKey(row.occurred_at, battleId, tracked)
    if (!battleKey) continue
    const category = extractWeaponCategory(mainHandType)
    if (!category) continue
    const cur = agg.get(category)
    if (cur) {
      cur.battleKeys.add(battleKey)
      cur.sampleId = mainHandType
    } else {
      agg.set(category, { sampleId: mainHandType, battleKeys: new Set([battleKey]) })
    }
  }

  return Array.from(agg.entries())
    .map(([category, v]) => ({ category, sampleItemId: v.sampleId, count: v.battleKeys.size }))
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
  const { data, error } = await db.rpc('guild_top_rivals', {
    p_guild_id: guildId,
    p_cutoff: cutoff,
    p_limit: TOP_RIVALS,
  })
  if (!error) {
    return ((data ?? []) as Array<{
      guild_name: string | null
      battle_count: number | string | null
      wins: number | string | null
      losses: number | string | null
      ties: number | string | null
    }>).map((row) => ({
      guildName: row.guild_name ?? '',
      battleCount: Number(row.battle_count ?? 0),
      wins: Number(row.wins ?? 0),
      losses: Number(row.losses ?? 0),
      ties: Number(row.ties ?? 0),
    })).filter((row) => row.guildName.length > 0)
  }
  if (!isMissingRpcError(error, 'guild_top_rivals')) {
    throw new Error(error.message)
  }

  type Row = { primary_opponent_name: string | null; outcome: string | null }
  const rows = await selectPagedRowsOrThrow<Row>({
    label: 'guild top rivals',
    buildQuery: () =>
      db
        .from('tenant_battle_records')
        .select('primary_opponent_name, outcome')
        .eq('guild_id', guildId)
        .eq('is_high_engagement', true)
        .gte('started_at', cutoff)
        .order('started_at', { ascending: true })
        .order('battle_record_id', { ascending: true }) as unknown as SupabasePagedQuery<Row>,
  })
  const agg = new Map<string, { count: number; wins: number; losses: number; ties: number }>()
  for (const row of rows) {
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
  // 어드민이 명시 입력한 디스코드 핸들 (친구추가/DM 용). NULL 또는 빈 값이면
  // username 으로 fallback. 카드 클릭 시 클립보드 복사 대상.
  publicDiscordHandle: string | null
}

export async function loadAdminTeam(guildId: string): Promise<AdminTeamMember[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('discord_id, username, avatar, public_discord_handle')
    .eq('guild_id', guildId)
    .eq('is_admin', true)
    .is('withdrawn_at', null)
    .order('username', { ascending: true })

  type Row = {
    discord_id: string | null
    username: string | null
    avatar: string | null
    public_discord_handle: string | null
  }
  const out: AdminTeamMember[] = []
  for (const row of (data ?? []) as Row[]) {
    if (!row.discord_id || !row.username) continue
    const handle = (row.public_discord_handle ?? '').trim()
    out.push({
      discordId: row.discord_id,
      username: row.username,
      avatarUrl: discordAvatarUrl(row.discord_id, row.avatar, 64),
      publicDiscordHandle: handle.length > 0 ? handle : null,
    })
  }
  return out
}

// 어드민의 명시 override (`guild_profile_server`) 가 비어 있을 때 fallback 으로
// tenant 의 `albion_server` 설정값을 그대로 사용. 한 길드는 단일 서버에 속하므로
// majority 계산 없이 직접 매핑이 정확. 둘 다 비어 있으면 null — 'east' 하드
// 디폴트는 west/eu 길드를 동부로 잘못 표기하므로 폐기. 호출자가 null 케이스를
// 처리해 HeroChip 등을 conditionally 렌더.
export async function resolveProfileServer(
  guildId: string,
  override: string,
): Promise<AlbionServer | null> {
  if (isAlbionServer(override)) {
    return override
  }
  const raw = await getAppSetting('albion_server', '', guildId)
  return isAlbionServer(raw) ? raw : null
}

export interface AllianceInfo {
  // 게임 내 표시 태그 (3-5자 대문자, 예: "MGM"). pill 텍스트.
  tag: string
  // 풀네임. API 응답이 자주 null 이라 optional. 호버 tooltip / aria 용도.
  name: string | null
}

// Albion Gameinfo `/guilds/{id}` 응답에서 alliance 정보 추출. 홈 길드 ID 가
// 미설정이거나 길드가 alliance 미가입이면 null 반환 — 호출 측에서 hero pill
// 자체를 안 그린다.
//
// fetchJson 내부 캐시(5분 revalidate) 에 의존 — 페이지가 force-dynamic 이라
// 매 요청 새로 풀리지만 같은 길드 ID 의 호출은 그 윈도우 안에서 캐시 히트.
export async function loadAllianceInfo(
  guildId: string,
  override: string,
): Promise<AllianceInfo | null> {
  const homeGuildId = (await getAppSetting('albion_home_guild_id', '', guildId)).trim()
  if (!homeGuildId) return null
  const server = await resolveProfileServer(guildId, override)
  if (!server) return null
  const guild = await getGuild(server, homeGuildId)
  const tag = guild?.AllianceTag?.trim()
  if (!tag) return null
  const rawName = guild?.AllianceName?.trim()
  return { tag, name: rawName && rawName.length > 0 ? rawName : null }
}
