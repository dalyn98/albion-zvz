// 길드 공개 페이지(/g/[slug])에서 길드원이 보는 본인 대시보드용 슬림 fetcher.
// /members/[discordId] 의 fetchMemberDetail 은 weapons / ranking RPC / 모든 events
// 등을 한꺼번에 끌어와 무겁다. 공개 페이지는 첫 진입 비용을 낮춰야 하므로 카드
// 4종에 필요한 최소 컬럼만 가져온다.

import { getAdminClient } from './supabase-admin'

const RECENT_LEDGER_LIMIT = 3
const RECENT_REGEAR_LIMIT = 3
const RECENT_KILL_LIMIT = 5

export type RegearStatusSummary = 'pending' | 'approved' | 'rejected'

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

export interface MemberKillEntry {
  event_id: string
  role: 'kill' | 'death'
  fame: number
  occurred_at: string
  opponent_name: string | null
  opponent_guild: string | null
}

export interface MemberDashboardSummary {
  balance: number
  pendingRegearCount: number
  recentLedger: MemberLedgerEntry[]
  recentRegears: MemberRegearEntry[]
  recentKills: MemberKillEntry[]
}

// 멤버가 길드에 등록되어 있지 않으면 null. 등록되어 있어도 활동이 없으면
// 카운트 0 / 빈 배열로 떨어진다 — 카드 컴포넌트가 "아직 활동 없음" 으로 표시.
export async function loadMemberDashboardSummary(
  discordId: string,
  guildId: string,
): Promise<MemberDashboardSummary | null> {
  const db = getAdminClient()

  const avatarRes = await db
    .from('guild_avatars')
    .select('discord_id, albion_player_id')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (avatarRes.error || !avatarRes.data) return null
  const albionPlayerId = (avatarRes.data.albion_player_id as string | null) ?? ''

  const [ledgerSum, recentLedgerRes, regearAggRes, recentRegearRes, recentKillRes] =
    await Promise.all([
      // balance = sum(delta). point_ledger 는 append-only 라 delta 합이 곧 잔액.
      db.from('point_ledger').select('delta').eq('guild_id', guildId).eq('discord_id', discordId),
      db
        .from('point_ledger')
        .select('id, delta, reason, memo, created_at')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false })
        .limit(RECENT_LEDGER_LIMIT),
      db
        .from('regear_requests')
        .select('status')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .eq('status', 'pending'),
      db
        .from('regear_requests')
        .select(
          'id, status, role_name, silver, payout_silver, event_title_snapshot, created_at',
        )
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false })
        .limit(RECENT_REGEAR_LIMIT),
      albionPlayerId
        ? db
            .from('killboard_events')
            .select('event_id, role, fame, occurred_at, opponent_name, opponent_guild')
            .eq('guild_id', guildId)
            .eq('albion_player_id', albionPlayerId)
            .order('occurred_at', { ascending: false })
            .limit(RECENT_KILL_LIMIT)
        : Promise.resolve({ data: [], error: null } as const),
    ])

  let balance = 0
  for (const row of ledgerSum.data ?? []) balance += Number(row.delta) || 0

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

  const recentKills: MemberKillEntry[] = (recentKillRes.data ?? []).map((r) => ({
    event_id: r.event_id as string,
    role: r.role as 'kill' | 'death',
    fame: Number(r.fame) || 0,
    occurred_at: r.occurred_at as string,
    opponent_name: (r.opponent_name as string | null) ?? null,
    opponent_guild: (r.opponent_guild as string | null) ?? null,
  }))

  return {
    balance,
    pendingRegearCount: regearAggRes.data?.length ?? 0,
    recentLedger,
    recentRegears,
    recentKills,
  }
}
