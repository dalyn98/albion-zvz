'use server'

import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  computeOpponentGuildBreakdown,
  parseRawBattle,
  type OpponentGuildBreakdown,
  type SizeCategory,
} from '@/lib/albion-battles'

// 1~2명 스트래글러는 "집계 규모에 맞는 길드" 가 아니다 — small 카테고리 최소
// 인원 (10) 과 동일한 컷을 적용해 노이즈를 잘라낸다. tenant_battle_records 자체가
// 이미 opponent 측 합계 인원 < 10 이면 기록되지 않으므로, 같은 임계로 개별 길드도
// 거른다.
const OPPONENT_GUILD_MIN_TEAM_SIZE = 10

// 단일 tenant_battle_records 의 상세. 전투 헤더 정보 + 해당 전투 시간창 안에서
// 길드원이 낸 킬/데스 이벤트 목록. 길드원 판정은 guild_avatars 조인 — 탈퇴자
// 포함 (withdrawn_at 무시) 해야 과거 전투에서 탈퇴한 멤버의 킬도 보인다.

export interface BattleKillEvent {
  event_id: string
  // anonymized 모드일 때 null. cross-tenant 보기에서는 Discord identity 를
  // 노출하지 않고 albion 닉네임만 사용.
  discord_id: string | null
  username: string
  avatar: string | null
  role: 'killer' | 'victim'
  opponent_name: string | null
  opponent_guild: string | null
  opponent_alliance: string | null
  fame: number
  item_power: number | null
  occurred_at: string
}

// 같은 battle_record_id 를 추적 중인 다른 tenant. 사이트가 등록된 길드끼리
// 서로 시점을 바꿔 보기 위한 cross-link. 자기 자신은 제외.
export interface CrossTenantPerspective {
  slug: string
  name: string
  homeGuildName: string
}

export interface BattleDetail {
  id: string
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  endedAt: string
  homeGuildName: string
  homeAllianceName: string | null
  homeTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  opponentGuildNames: string[]
  opponentAllianceNames: string[]
  primaryOpponentName: string | null
  // 주 상대 (alliance 또는 단독 길드). UI 의 "v" 표기/카테고리 산정 기준.
  mainOpponentName: string
  mainOpponentKind: 'alliance' | 'guild' | 'pending' | 'legacy'
  mainOpponentTeamSize: number
  mainOpponentKills: number
  mainOpponentDeaths: number
  mainOpponentKillFame: number
  matchIndex: number
  matchTotal: number
  isProvisional: boolean
  sizeCategory: SizeCategory
  outcome: 'win' | 'loss' | 'tie'
  // 상대 측 길드별 분해. raw_battle 에서 직접 계산 — 1~2명 스트래글러 컷오프
  // (OPPONENT_GUILD_MIN_TEAM_SIZE) 적용. raw_battle 이 없는 구 행이면 빈 배열.
  opponentGuilds: OpponentGuildBreakdown[]
  // 전투 시간창 안에서 길드원이 낸 killboard 이벤트. occurred_at 오름차순.
  events: BattleKillEvent[]
  // anonymized 보기 (cross-tenant) 에서는 events 의 discord identity 가 가려지고
  // 이 플래그로 UI 가 멤버 상세 링크/아바타를 빼게 된다.
  anonymized: boolean
  // 같은 전투를 추적하는 다른 등록 tenant 목록 (자기 자신 제외). 비어있을 수도.
  crossTenants: CrossTenantPerspective[]
  // 'self' = 내 tenant 시점, 'cross' = 상대 tenant 시점 보기. 배너/뒤로가기 분기.
  perspectiveKind: 'self' | 'cross'
  // cross 일 때만 채워짐 — 표시용 라벨/배너에 사용.
  perspectiveTenantSlug: string | null
  perspectiveTenantName: string | null
}

// 매칭 창 padding — tracked-kills 와 동일한 15분. 전투 시작/끝 경계에서 놓치는
// 이벤트를 최소화. 과하게 잡혀도 동일 배틀 시간대라 UI 상 혼동은 없다.
const WINDOW_PADDING_MS = 15 * 60 * 1000

// 자기 tenant 시점 또는 cross-tenant 시점 모두 같은 detail shape 으로 반환.
// `perspectiveSlug` 가 주어지면 그 slug 의 등록된 tenant 시점으로 해석되어
// killboard 이벤트는 anonymized 모드 (Discord identity 가려짐) 로 내려간다.
//
// id 인자 의미:
//   - perspectiveSlug 미지정: 내 tenant 의 tenant_battle_records.id
//   - perspectiveSlug 지정: 같은 battle_records.id (battle_record_id) 를
//     공유하는 행 중 perspectiveSlug 의 tenant_battle_records 를 찾는다.
//     id 가 내 tenant 의 row 라도 cross 시 같은 battle_record_id 만 동일하면
//     그쪽 시점으로 이동.
export async function getBattleDetail(
  id: string,
  perspectiveSlug?: string,
): Promise<{
  detail: BattleDetail | null
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { detail: null, error: 'Unauthorized' }
    const myGuildId = await getSessionGuildId(session)
    const db = getAdminClient()

    // 내 tenant 의 row 부터 조회 — battle_record_id 와 cross-tenant 후보 산출에
    // 필요. 실패해도 cross 모드일 때는 직접 다른 행을 찾을 수 있지만, 본 페이지는
    // "내 길드 사이트에서 본 배틀" 진입 흐름이라 항상 내 row 가 존재해야 함.
    const { data: myRow, error: myErr } = await db
      .from('tenant_battle_records')
      .select(
        'id, battle_record_id, home_guild_id, home_guild_name, home_alliance_id, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, main_opponent_kills, main_opponent_deaths, main_opponent_kill_fame, match_index, match_total, is_provisional, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name, ended_at, raw_battle)',
      )
      .eq('guild_id', myGuildId)
      .eq('id', id)
      .maybeSingle()
    if (myErr) return { detail: null, error: myErr.message }
    if (!myRow) return { detail: null }

    const battleRecordId = myRow.battle_record_id as string

    // 같은 battle_record_id 를 추적하는 다른 active tenant 들. 자기 자신 제외.
    // 시점 전환 cross-link 후보로 노출.
    const { data: peerRows, error: peerErr } = await db
      .from('tenant_battle_records')
      .select(
        'guild_id, home_guild_name, tenants!inner(slug, name, status)',
      )
      .eq('battle_record_id', battleRecordId)
      .neq('guild_id', myGuildId)
    if (peerErr) return { detail: null, error: peerErr.message }

    type PeerRow = {
      guild_id: string
      home_guild_name: string
      tenants:
        | { slug: string; name: string; status: string }
        | { slug: string; name: string; status: string }[]
        | null
    }
    const crossTenants: CrossTenantPerspective[] = []
    const peerByGuildId = new Map<string, PeerRow>()
    for (const row of (peerRows ?? []) as PeerRow[]) {
      const tenant = Array.isArray(row.tenants) ? row.tenants[0] : row.tenants
      if (!tenant || tenant.status !== 'active') continue
      crossTenants.push({
        slug: tenant.slug,
        name: tenant.name,
        homeGuildName: row.home_guild_name,
      })
      peerByGuildId.set(row.guild_id, row)
    }

    // perspective 모드 결정. slug 가 비어있거나 자기 자신을 가리키면 self 모드.
    let activeRow = myRow
    let activeGuildId = myGuildId
    let perspectiveKind: 'self' | 'cross' = 'self'
    let perspectiveTenantSlug: string | null = null
    let perspectiveTenantName: string | null = null
    let anonymized = false

    if (perspectiveSlug) {
      const peer = crossTenants.find((p) => p.slug === perspectiveSlug)
      if (peer) {
        // peer 의 row 를 별도 조회. 위 peerRows 는 슬림 select 라 detail 에 부족.
        const peerGuildId = Array.from(peerByGuildId.entries()).find(
          ([, r]) => {
            const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants
            return t?.slug === perspectiveSlug
          },
        )?.[0]
        if (peerGuildId) {
          const { data: peerFull, error: peerFullErr } = await db
            .from('tenant_battle_records')
            .select(
              'id, battle_record_id, home_guild_id, home_guild_name, home_alliance_id, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, main_opponent_kills, main_opponent_deaths, main_opponent_kill_fame, match_index, match_total, is_provisional, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name, ended_at, raw_battle)',
            )
            .eq('guild_id', peerGuildId)
            .eq('battle_record_id', battleRecordId)
            .maybeSingle()
          if (peerFullErr) return { detail: null, error: peerFullErr.message }
          if (peerFull) {
            activeRow = peerFull
            activeGuildId = peerGuildId
            perspectiveKind = 'cross'
            perspectiveTenantSlug = peer.slug
            perspectiveTenantName = peer.name
            anonymized = true
          }
        }
      }
      // perspectiveSlug 가 지정됐는데 매칭되는 peer 가 없으면 그냥 self 로 fallback.
      // (URL 직접 입력 / stale 상태 등) 잘못된 slug 라도 페이지가 깨지진 않음.
    }

    const battle = Array.isArray(activeRow.battle_records)
      ? activeRow.battle_records[0]
      : activeRow.battle_records
    const endedAt = (battle?.ended_at as string | null) ?? (activeRow.started_at as string)

    // 상대 길드 분해: raw_battle 이 있으면 Albion API 원본에서 직접 측 분리.
    // parseRawBattle 로 read-time 검증 — 손상된/구버전 JSONB 가 들어와도
    // 페이지가 깨지지 않고 빈 배열로 degrade.
    const rawBattle = parseRawBattle(battle?.raw_battle)
    const opponentGuilds: OpponentGuildBreakdown[] = rawBattle
      ? computeOpponentGuildBreakdown(rawBattle, activeRow.home_guild_id as string, {
          minTeamSize: OPPONENT_GUILD_MIN_TEAM_SIZE,
          homeAllianceIdOverride: (activeRow.home_alliance_id as string | null) ?? null,
        })
      : []

    const startMs = Date.parse(activeRow.started_at as string)
    const endMs = Date.parse(endedAt)
    const windowStart = new Date(startMs - WINDOW_PADDING_MS).toISOString()
    const windowEnd = new Date(endMs + WINDOW_PADDING_MS).toISOString()

    // 전투 시간창 안의 길드원 killboard_events. self: Discord identity 노출,
    // cross: anonymized — albion_nickname 만 사용하고 discord 식별자는 가린다.
    // 두 케이스 모두 같은 select — anonymized 여부에 따라 매핑만 다름.
    const { data: events, error: eventsErr } = await db
      .from('killboard_events')
      .select(
        'event_id, role, fame, item_power, occurred_at, opponent_name, opponent_guild, opponent_alliance, discord_id, guild_avatars!inner(username, avatar, albion_nickname)',
      )
      .eq('guild_id', activeGuildId)
      .gte('occurred_at', windowStart)
      .lte('occurred_at', windowEnd)
      .order('occurred_at', { ascending: true })
    if (eventsErr) return { detail: null, error: eventsErr.message }

    type EventRow = {
      event_id: number | string | null
      role: string | null
      fame: number | null
      item_power: number | null
      occurred_at: string | null
      opponent_name: string | null
      opponent_guild: string | null
      opponent_alliance: string | null
      discord_id: string | null
      guild_avatars:
        | { username: string | null; avatar: string | null; albion_nickname: string | null }
        | { username: string | null; avatar: string | null; albion_nickname: string | null }[]
        | null
    }

    const battleEvents: BattleKillEvent[] = []
    for (const row of (events ?? []) as EventRow[]) {
      if (!row.discord_id || !row.occurred_at) continue
      if (row.role !== 'killer' && row.role !== 'victim') continue
      const avatar = Array.isArray(row.guild_avatars)
        ? row.guild_avatars[0]
        : row.guild_avatars
      if (!avatar) continue
      // anonymized: Albion 닉네임을 표시명으로. 없으면 row 자체를 스킵 — 표시할
      // 안전한 라벨이 없으면 그냥 안 보여주는 게 낫다.
      const displayName = anonymized
        ? avatar.albion_nickname ?? null
        : avatar.username ?? null
      if (!displayName) continue
      battleEvents.push({
        event_id: String(row.event_id ?? ''),
        discord_id: anonymized ? null : row.discord_id,
        username: displayName,
        avatar: anonymized ? null : avatar.avatar,
        role: row.role,
        opponent_name: row.opponent_name,
        opponent_guild: row.opponent_guild,
        opponent_alliance: row.opponent_alliance,
        fame: row.fame ?? 0,
        item_power: row.item_power,
        occurred_at: row.occurred_at,
      })
    }

    const detail: BattleDetail = {
      id: activeRow.id as string,
      albionBattleId: battle?.albion_battle_id as number,
      clusterName: (battle?.cluster_name as string | null) ?? null,
      startedAt: activeRow.started_at as string,
      endedAt,
      homeGuildName: activeRow.home_guild_name as string,
      homeAllianceName: (activeRow.home_alliance_name as string | null) ?? null,
      homeTeamSize: activeRow.home_team_size as number,
      homeKills: activeRow.home_kills as number,
      homeDeaths: activeRow.home_deaths as number,
      homeKillFame: activeRow.home_kill_fame as number,
      opponentTeamSize: activeRow.opponent_team_size as number,
      opponentKills: activeRow.opponent_kills as number,
      opponentDeaths: activeRow.opponent_deaths as number,
      opponentKillFame: activeRow.opponent_kill_fame as number,
      opponentGuildNames: (activeRow.opponent_guild_names as string[] | null) ?? [],
      opponentAllianceNames: (activeRow.opponent_alliance_names as string[] | null) ?? [],
      primaryOpponentName: (activeRow.primary_opponent_name as string | null) ?? null,
      mainOpponentName:
        (activeRow.main_opponent_force_name as string | null) ??
        (activeRow.primary_opponent_name as string | null) ??
        '-',
      mainOpponentKind:
        (activeRow.main_opponent_force_kind as
          | 'alliance'
          | 'guild'
          | 'pending'
          | 'legacy'
          | null) ?? 'legacy',
      mainOpponentTeamSize:
        (activeRow.main_opponent_team_size as number | null) ??
        (activeRow.opponent_team_size as number),
      mainOpponentKills:
        (activeRow.main_opponent_kills as number | null) ??
        (activeRow.opponent_kills as number),
      mainOpponentDeaths:
        (activeRow.main_opponent_deaths as number | null) ??
        (activeRow.opponent_deaths as number),
      mainOpponentKillFame:
        (activeRow.main_opponent_kill_fame as number | null) ??
        (activeRow.opponent_kill_fame as number),
      matchIndex: (activeRow.match_index as number | null) ?? 1,
      matchTotal: (activeRow.match_total as number | null) ?? 1,
      isProvisional: (activeRow.is_provisional as boolean | null) ?? false,
      sizeCategory: activeRow.size_category as SizeCategory,
      outcome: activeRow.outcome as 'win' | 'loss' | 'tie',
      opponentGuilds,
      events: battleEvents,
      anonymized,
      crossTenants,
      perspectiveKind,
      perspectiveTenantSlug,
      perspectiveTenantName,
    }
    return { detail }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : 'serverError' }
  }
}
