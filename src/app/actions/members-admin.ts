'use server'

import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { requireAdmin } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import type { RegearType } from '@/types'

// 길드원 열람(목록/상세)은 로그인만 되어 있으면 모두 가능하게 열어주고,
// 포인트 조정 같은 mutation은 별도로 requireAdmin()을 거치게 둔다.
async function requireSession() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return getAdminClient()
}

export interface RoleCount {
  role: string
  count: number
}

export interface GuildMemberSummary {
  discord_id: string
  username: string
  avatar: string | null
  is_admin: boolean
  updated_at: string
  participation_count: number
  top_roles: RoleCount[]
}

export interface MemberEventEntry {
  event_id: string
  event_title: string
  role: string
  battle_started_at: string | null
  gather_at: string | null
  created_at: string
  outcome: 'win' | 'loss' | null
}

export interface MemberRegearEntry {
  id: string
  event_id: string | null
  event_title: string
  role_name: string
  silver: number
  request_type: RegearType
  claimed_silver: number | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
}

// 'exchange'는 기존 환전 요청(exchange_requests) 흐름, 'admin_adjust'는 관리자 수동
// 지급/차감(point_ledger.reason = 'admin_adjust'). UI에서는 같은 '환전 내역' 섹션에
// 섞여 보이지만 배지/금액 표시가 다르다.
export type MemberExchangeEntry =
  | {
      kind: 'exchange'
      id: string
      silver: number
      status: 'pending' | 'approved' | 'rejected'
      admin_notes: string | null
      created_at: string
      resolved_at: string | null
    }
  | {
      kind: 'admin_adjust'
      id: string
      delta: number
      memo: string | null
      created_at: string
    }

export interface GuildMemberDetail {
  discord_id: string
  username: string
  avatar: string | null
  updated_at: string
  participation_count: number
  role_breakdown: RoleCount[]
  events: MemberEventEntry[]
  regears: MemberRegearEntry[]
  exchanges: MemberExchangeEntry[]
  balance: number
  lifetime_earned: number
  lifetime_spent: number
}

export interface GuildAggregateStats {
  wins: number
  losses: number
  distinctOpponents: number
  startDate: string
  endDate: string
}

// /members 최상단 요약용. outcome 이 집계된(finalized_at 이 있고 outcome !== null)
// 이벤트들을 기준으로 승/패 합산, 그리고 그 범위의 event_battles 에서 등장한
// 상대 길드 종류 수를 센다. 관리자 설정의 날짜 필터(members_aggregate_*_date)
// 가 설정되면 events.battle_started_at 이 그 안에 들어오는 이벤트만 센다.
export async function getGuildAggregateStats(): Promise<{
  stats: GuildAggregateStats | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { stats: null, error: 'Unauthorized' }

    const [startDate, endDate] = await Promise.all([
      getAppSetting('members_aggregate_start_date', ''),
      getAppSetting('members_aggregate_end_date', ''),
    ])

    const db = getAdminClient()
    let eventQuery = db
      .from('events')
      .select('id, outcome, battle_started_at')
      .not('outcome', 'is', null)
    // Admin-entered dates are KST calendar days — anchor both bounds to KST
    // midnight so the filter includes everything from "YYYY-MM-DD 00:00 KST"
    // through "YYYY-MM-DD 23:59 KST", not the UTC equivalent that would
    // drift the window by 9 hours.
    if (startDate) eventQuery = eventQuery.gte('battle_started_at', `${startDate}T00:00:00+09:00`)
    if (endDate) eventQuery = eventQuery.lte('battle_started_at', `${endDate}T23:59:59+09:00`)

    const eventsRes = await eventQuery
    if (eventsRes.error) return { stats: null, error: eventsRes.error.message }
    const events = eventsRes.data ?? []
    const eventIds = events.map((e) => e.id)

    let wins = 0
    let losses = 0
    for (const e of events) {
      if (e.outcome === 'win') wins++
      else if (e.outcome === 'loss') losses++
    }

    let distinctOpponents = 0
    if (eventIds.length > 0) {
      const battlesRes = await db
        .from('event_battles')
        .select('opponent_guild_id, opponent_guild')
        .in('event_id', eventIds)
      if (battlesRes.error) return { stats: null, error: battlesRes.error.message }
      const keys = new Set<string>()
      for (const row of battlesRes.data ?? []) {
        // FK 가 백필된 행은 id 로, 아직 FK 가 연결 안 된 레거시 행은 정규화된
        // 이름으로 dedupe. 같은 길드가 두 방식으로 카운트돼 부풀지 않도록 우선순위:
        // id 가 있으면 id, 없으면 lowercase trim.
        if (row.opponent_guild_id) keys.add(`id:${row.opponent_guild_id}`)
        else if (row.opponent_guild) keys.add(`name:${row.opponent_guild.trim().toLowerCase()}`)
      }
      distinctOpponents = keys.size
    }

    return {
      stats: { wins, losses, distinctOpponents, startDate, endDate },
    }
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listGuildMembers(): Promise<{
  members: GuildMemberSummary[]
  error?: string
}> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireSession()

    const [avatarsRes, slotsRes] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, is_admin, updated_at'),
      db
        .from('slots')
        .select('assigned_discord_id, role_name, parties!inner(event_id)')
        .not('assigned_discord_id', 'is', null),
    ])
    if (avatarsRes.error) return { members: [], error: avatarsRes.error.message }
    if (slotsRes.error) return { members: [], error: slotsRes.error.message }

    const unassignedRoleLabel = tCommon('unassignedRole')
    interface Agg {
      events: Set<string>
      roles: Map<string, number>
    }
    const bucket = new Map<string, Agg>()
    for (const row of slotsRes.data ?? []) {
      const discordId = row.assigned_discord_id
      if (!discordId) continue
      const party = row.parties as { event_id: string } | { event_id: string }[] | null
      const eventId = Array.isArray(party) ? party[0]?.event_id : party?.event_id
      if (!eventId) continue
      let agg = bucket.get(discordId)
      if (!agg) {
        agg = { events: new Set(), roles: new Map() }
        bucket.set(discordId, agg)
      }
      agg.events.add(eventId)
      const role = row.role_name ?? unassignedRoleLabel
      agg.roles.set(role, (agg.roles.get(role) ?? 0) + 1)
    }

    const members: GuildMemberSummary[] = (avatarsRes.data ?? []).map((a) => {
      const agg = bucket.get(a.discord_id)
      const roles = agg
        ? Array.from(agg.roles.entries())
            .map(([role, count]) => ({ role, count }))
            .sort((x, y) => y.count - x.count)
        : []
      return {
        discord_id: a.discord_id,
        username: a.username,
        avatar: a.avatar,
        is_admin: a.is_admin ?? false,
        updated_at: a.updated_at,
        participation_count: agg?.events.size ?? 0,
        top_roles: roles.slice(0, 3),
      }
    })

    members.sort((a, b) => {
      if (b.participation_count !== a.participation_count) {
        return b.participation_count - a.participation_count
      }
      return a.username.localeCompare(b.username)
    })

    return { members }
  } catch (e) {
    return { members: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Core fetch — assumes caller has already authorized access to discordId.
// Both the admin-only `getGuildMemberDetail` and the self-only `getMyMemberDetail`
// funnel through this so they stay in lock-step.
async function fetchMemberDetail(discordId: string): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  try {
    const db = getAdminClient()

    const [avatarRes, slotsRes, regearsRes, exchangesRes, ledgerRes] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, updated_at')
        .eq('discord_id', discordId)
        .maybeSingle(),
      db
        .from('slots')
        .select(
          'role_name, parties!inner(event_id, events!inner(id, title, created_at, battle_started_at, gather_at, outcome))',
        )
        .eq('assigned_discord_id', discordId),
      db
        .from('regear_requests')
        .select(
          'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, status, admin_notes, created_at, resolved_at, events(title)',
        )
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false }),
      db
        .from('exchange_requests')
        .select('id, silver, status, admin_notes, created_at, resolved_at')
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false }),
      db
        .from('point_ledger')
        .select('id, delta, reason, memo, created_at')
        .eq('discord_id', discordId),
    ])

    if (avatarRes.error) return { detail: null, error: avatarRes.error.message }
    if (slotsRes.error) return { detail: null, error: slotsRes.error.message }
    if (regearsRes.error) return { detail: null, error: regearsRes.error.message }
    if (exchangesRes.error) return { detail: null, error: exchangesRes.error.message }
    if (ledgerRes.error) return { detail: null, error: ledgerRes.error.message }

    const avatar = avatarRes.data
    if (!avatar) return { detail: null }

    const unassignedRoleLabel = tCommon('unassignedRole')
    const deletedEventLabel = tCommon('deletedEvent')
    const eventsMap = new Map<string, MemberEventEntry>()
    const roleCounter = new Map<string, number>()
    for (const row of slotsRes.data ?? []) {
      const party = row.parties as
        | { event_id: string; events: { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null; outcome: 'win' | 'loss' | null } | { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null; outcome: 'win' | 'loss' | null }[] }
        | { event_id: string; events: { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null; outcome: 'win' | 'loss' | null } | { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null; outcome: 'win' | 'loss' | null }[] }[]
        | null
      const partyObj = Array.isArray(party) ? party[0] : party
      if (!partyObj) continue
      const event = Array.isArray(partyObj.events) ? partyObj.events[0] : partyObj.events
      if (!event) continue
      const role = row.role_name ?? unassignedRoleLabel
      roleCounter.set(role, (roleCounter.get(role) ?? 0) + 1)
      if (!eventsMap.has(event.id)) {
        eventsMap.set(event.id, {
          event_id: event.id,
          event_title: event.title,
          role,
          battle_started_at: event.battle_started_at,
          gather_at: event.gather_at,
          created_at: event.created_at,
          outcome: event.outcome,
        })
      }
    }

    const events = Array.from(eventsMap.values()).sort((a, b) => {
      const ak = a.battle_started_at ?? a.gather_at ?? a.created_at
      const bk = b.battle_started_at ?? b.gather_at ?? b.created_at
      return bk.localeCompare(ak)
    })

    const roleBreakdown: RoleCount[] = Array.from(roleCounter.entries())
      .map(([role, count]) => ({ role, count }))
      .sort((a, b) => b.count - a.count)

    const regears: MemberRegearEntry[] = (regearsRes.data ?? []).map((row) => {
      const event = row.events as { title?: string } | { title?: string }[] | null
      const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
      return {
        id: row.id,
        event_id: row.event_id ?? null,
        event_title: liveTitle || row.event_title_snapshot || deletedEventLabel,
        role_name: row.role_name,
        silver: row.silver,
        request_type: (row.request_type ?? 'death') as RegearType,
        claimed_silver: row.claimed_silver,
        status: row.status as MemberRegearEntry['status'],
        admin_notes: row.admin_notes,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      }
    })

    const exchangeEntries: MemberExchangeEntry[] = (exchangesRes.data ?? []).map((row) => ({
      kind: 'exchange',
      id: row.id,
      silver: row.silver,
      status: row.status as 'pending' | 'approved' | 'rejected',
      admin_notes: row.admin_notes,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
    }))

    let balance = 0
    let earned = 0
    let spent = 0
    const adjustEntries: MemberExchangeEntry[] = []
    for (const row of ledgerRes.data ?? []) {
      balance += row.delta
      if (row.delta > 0) earned += row.delta
      else spent += -row.delta
      if (row.reason === 'admin_adjust') {
        adjustEntries.push({
          kind: 'admin_adjust',
          id: row.id,
          delta: row.delta,
          memo: row.memo,
          created_at: row.created_at,
        })
      }
    }

    const exchanges: MemberExchangeEntry[] = [...exchangeEntries, ...adjustEntries].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    )

    return {
      detail: {
        discord_id: avatar.discord_id,
        username: avatar.username,
        avatar: avatar.avatar,
        updated_at: avatar.updated_at,
        participation_count: events.length,
        role_breakdown: roleBreakdown,
        events,
        regears,
        exchanges,
        balance,
        lifetime_earned: earned,
        lifetime_spent: spent,
      },
    }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function getGuildMemberDetail(discordId: string): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const session = await getSession()
  if (!session) return { detail: null, error: 'Unauthorized' }
  return fetchMemberDetail(discordId)
}

// Self-serve variant: logged-in members read their own detail.
// The session's discord_id is always used — a user cannot pass in another ID.
export async function getMyMemberDetail(): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const session = await getSession()
  if (!session) return { detail: null, error: 'Unauthorized' }
  return fetchMemberDetail(session.discordId)
}
