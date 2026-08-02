// 길드 공개 페이지(/g/[slug])에서 길드원이 보는 본인 대시보드용 슬림 fetcher.
// /members/[discordId] 의 fetchMemberDetail 은 실제 장비 관측 / 성취 / 모든
// events 등을 한꺼번에 끌어와 무겁다. 공개 페이지는 첫 진입 비용을 낮춰야
// 하므로 카드 4종에 필요한 최소 컬럼만 가져온다.

import { getAdminClient } from './supabase-admin'
import { getAppSetting } from './app-settings'
import {
  fetchTrackedBattleWindows,
  fetchMemberBattleParticipationsForMember,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from './tracked-kills'
import { getMemberPointBalance } from './point-ledger'
import type { BattleOutcome } from './guild-profile-activity'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from './supabase-pagination'
import { getGuildMemberDirectoryEntry } from './guild-member-directory'

const RECENT_LEDGER_LIMIT = 3
const RECENT_REGEAR_LIMIT = 3
const RECENT_BATTLE_LIMIT = 5

export type RegearStatusSummary = 'pending' | 'approved' | 'rejected'

export type BattleSizeCategory = 'small' | 'middle' | 'large' | 'zerg'

export interface MemberLedgerEntry {
  id: string
  delta: number
  reason: string
  memo: string | null
  created_at: string
}

export interface MemberRegearEntry {
  id: string
  status: RegearStatusSummary
  role_name: string
  silver: number
  payout_silver: number | null
  event_title: string | null
  created_at: string
}

// 본인 참여 최근 전투 한 건. battleId 는 tenant_zvz_battle_records.id 로,
// /battles/[id] 라우팅 키. myKills/myDeaths 는 본인의 K/D, homeKills/Deaths
// 는 길드 전체 합산 — 카드에서 둘 다 노출.
export interface MemberRecentBattleEntry {
  battleId: string
  startedAt: string
  outcome: BattleOutcome
  myKills: number
  myDeaths: number
  homeKills: number
  homeDeaths: number
  homeTeamSize: number
  primaryOpponentName: string | null
  sizeCategory: BattleSizeCategory
}

export interface MemberRecentBattleEnrichRow {
  id: string
  battle_record_id: string | null
  started_at: string
  home_kills: number | null
  home_deaths: number | null
  home_team_size: number | null
  primary_opponent_name: string | null
  size_category: string | null
  main_opponent_team_size: number | null
}

interface MemberRecentBattleEnrichment {
  battleId: string
  startedAt: string
  homeKills: number
  homeDeaths: number
  homeTeamSize: number
  primaryOpponentName: string | null
  sizeCategory: BattleSizeCategory
}

export interface MemberDashboardSummary {
  balance: number
  pendingRegearCount: number
  recentLedger: MemberLedgerEntry[]
  recentRegears: MemberRegearEntry[]
  recentBattles: MemberRecentBattleEntry[]
}

type MemberDashboardKillboardRow = {
  event_id: number | string | null
  role: string | null
  occurred_at: string | null
  battle_id: number | null
}

// 멤버가 길드에 등록되어 있지 않으면 null. 등록되어 있어도 활동이 없으면
// 카운트 0 / 빈 배열로 떨어진다 — 카드 컴포넌트가 "아직 활동 없음" 으로 표시.
export async function loadMemberDashboardSummary(
  discordId: string,
  guildId: string,
): Promise<MemberDashboardSummary | null> {
  const db = getAdminClient()

  const member = await getGuildMemberDirectoryEntry(guildId, discordId)
  if (!member) return null
  const albionPlayerId = member.albionPlayerId

  const bundleSplits =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'
  const recentLedgerQuery = db
    .from('point_ledger')
    .select('id, delta, reason, memo, created_at')
    .eq('guild_id', guildId)
    .eq('guild_member_id', member.guildMemberId)
    .order('created_at', { ascending: false })
    .limit(RECENT_LEDGER_LIMIT)
  const [pointBalance, recentLedgerRes, regearAggRes, recentRegearRes, recentBattles] =
    await Promise.all([
      getMemberPointBalance(db, guildId, discordId),
      recentLedgerQuery,
      db
        .from('regear_requests')
        .select('status')
        .eq('guild_id', guildId)
        .eq('guild_member_id', member.guildMemberId)
        .eq('status', 'pending'),
      db
        .from('regear_requests')
        .select(
          'id, status, role_name, silver, payout_silver, event_title_snapshot, created_at',
        )
        .eq('guild_id', guildId)
        .eq('guild_member_id', member.guildMemberId)
        .order('created_at', { ascending: false })
        .limit(RECENT_REGEAR_LIMIT),
      loadRecentMemberBattles(guildId, discordId, albionPlayerId, bundleSplits),
    ])

  const balance = pointBalance.error ? 0 : pointBalance.balance

  const recentLedger: MemberLedgerEntry[] = (recentLedgerRes.data ?? []).map((r) => ({
    id: r.id as string,
    delta: Number(r.delta) || 0,
    reason: (r.reason as string) ?? '',
    memo: (r.memo as string | null) ?? null,
    created_at: r.created_at as string,
  }))

  const recentRegears: MemberRegearEntry[] = (recentRegearRes.data ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as RegearStatusSummary,
    role_name: (r.role_name as string) ?? '',
    silver: Number(r.silver) || 0,
    payout_silver:
      r.payout_silver === null || r.payout_silver === undefined
        ? null
        : Number(r.payout_silver),
    event_title: (r.event_title_snapshot as string | null) ?? null,
    created_at: r.created_at as string,
  }))

  return {
    balance,
    pendingRegearCount: regearAggRes.data?.length ?? 0,
    recentLedger,
    recentRegears,
    recentBattles,
  }
}

// 본인 참여 최근 트래킹 전투를 멤버별 K/D + 길드 전체 K/D + 상대 정보로 합쳐
// 반환. 계산 흐름은 me-dashboard / members-admin / leaderboard 와 동일하게
// (1) tracked windows 로 engagement 컷 + bundleSplits 처리, (2) killboard 로
// 본인 K/D, (3) raw_battle.players RPC 로 0K0D 참여까지 수합. 그 뒤 최근 5건만
// tenant_zvz_battle_records 에서 길드 K/D · 상대 정보를 보강. 본인 참여가 없는 길드
// 전투는 자동 제외.
async function loadRecentMemberBattles(
  guildId: string,
  discordId: string,
  albionPlayerId: string | null,
  bundleSplits: boolean,
): Promise<MemberRecentBattleEntry[]> {
  const db = getAdminClient()

  const [trackedBattles, killboardRows, participationsByMember] = await Promise.all([
    fetchTrackedBattleWindows(db, guildId, null, { bundleSplits }),
    selectPagedRowsOrThrow<MemberDashboardKillboardRow>({
      label: 'guild profile member dashboard killboard events',
      buildQuery: () =>
        db
          .from('killboard_events')
          .select('event_id, role, occurred_at, battle_id')
          .eq('guild_id', guildId)
          .eq('discord_id', discordId)
          .order('occurred_at', { ascending: true })
          .order('event_id', { ascending: true }) as unknown as SupabasePagedQuery<MemberDashboardKillboardRow>,
    }),
    fetchMemberBattleParticipationsForMember(db, guildId, {
      albionPlayerId,
      discordId,
    }),
  ])

  const memberParticipations = albionPlayerId
    ? participationsByMember.byAlbionPlayerId.get(albionPlayerId)
    : undefined
  const killBattles = groupMemberKillsByBattle(killboardRows, trackedBattles)
  const battles = mergeMemberBattles(killBattles, memberParticipations, trackedBattles)
  if (battles.length === 0) return []

  // mergeMemberBattles 는 startedAt asc 정렬. 최근 5건만 추려서 enrichment.
  const topN = [...battles]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, RECENT_BATTLE_LIMIT)

  const startedAts = topN.map((b) => b.startedAt)
  const { data: enrichRaw } = await db
    .from('tenant_zvz_battle_records')
    .select(
      'id, battle_record_id, started_at, home_kills, home_deaths, home_team_size, primary_opponent_name, size_category, main_opponent_team_size',
    )
    .eq('guild_id', guildId)
    .in('started_at', startedAts)

  const enrichByStartedAt = buildRecentBattleEnrichmentByStartedAt(
    (enrichRaw ?? []) as MemberRecentBattleEnrichRow[],
  )

  const result: MemberRecentBattleEntry[] = []
  for (const b of topN) {
    const enrich = enrichByStartedAt.get(b.startedAt)
    if (!enrich) continue
    result.push({
      battleId: enrich.battleId,
      startedAt: b.startedAt,
      outcome: normalizeBattleOutcome(b.outcome),
      myKills: b.killCount,
      myDeaths: b.deathCount,
      homeKills: enrich.homeKills,
      homeDeaths: enrich.homeDeaths,
      homeTeamSize: enrich.homeTeamSize,
      primaryOpponentName: enrich.primaryOpponentName,
      sizeCategory: enrich.sizeCategory,
    })
  }
  return result
}

export function buildRecentBattleEnrichmentByStartedAt(
  rows: ReadonlyArray<MemberRecentBattleEnrichRow>,
): Map<string, MemberRecentBattleEnrichment> {
  interface Group {
    mainRow: MemberRecentBattleEnrichRow
    homeKills: number
    homeDeaths: number
    homeTeamSize: number
  }

  const grouped = new Map<string, Group>()
  for (const row of rows) {
    const groupKey = row.battle_record_id ?? row.started_at
    const existing = grouped.get(groupKey)
    const mainRow =
      !existing ||
      (row.main_opponent_team_size ?? 0) > (existing.mainRow.main_opponent_team_size ?? 0)
        ? row
        : existing.mainRow

    grouped.set(groupKey, {
      mainRow,
      homeKills: (existing?.homeKills ?? 0) + (row.home_kills ?? 0),
      homeDeaths: (existing?.homeDeaths ?? 0) + (row.home_deaths ?? 0),
      homeTeamSize: Math.max(existing?.homeTeamSize ?? 0, row.home_team_size ?? 0),
    })
  }

  const byStartedAt = new Map<string, MemberRecentBattleEnrichment>()
  for (const group of grouped.values()) {
    const row = group.mainRow
    const existing = byStartedAt.get(row.started_at)
    if (
      existing &&
      existing.homeTeamSize > group.homeTeamSize &&
      existing.homeKills + existing.homeDeaths >= group.homeKills + group.homeDeaths
    ) {
      continue
    }

    byStartedAt.set(row.started_at, {
      battleId: row.id,
      startedAt: row.started_at,
      homeKills: group.homeKills,
      homeDeaths: group.homeDeaths,
      homeTeamSize: group.homeTeamSize,
      primaryOpponentName: row.primary_opponent_name,
      sizeCategory: normalizeSizeCategory(row.size_category),
    })
  }

  return byStartedAt
}

function normalizeBattleOutcome(raw: string): BattleOutcome {
  if (raw === 'win' || raw === 'loss' || raw === 'tie') return raw
  return 'tie'
}

function normalizeSizeCategory(raw: string | null): BattleSizeCategory {
  if (raw === 'small' || raw === 'middle' || raw === 'large' || raw === 'zerg') return raw
  return 'small'
}
