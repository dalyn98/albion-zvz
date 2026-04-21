'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { requireAdmin } from '@/lib/auth'
import { getAppSetting } from '@/lib/app-settings'
import { isLocale } from '@/i18n/locales'
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

export interface WeaponCount {
  // item id when the slot used a bundled item (so the UI can render the
  // render.albiononline.com icon); null for free-text entries.
  weapon_id: string | null
  weapon_name: string
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
  // Attendance rate across events whose battle has started. NULL when the
  // member has no decidable events (everything's upcoming/cancelled) — the
  // list UI displays "—" in that case.
  attendance_rate: number | null
  // Same denominator as `attendance_rate` — lets the UI show "(5/7)" next
  // to the percent so low-sample members aren't ranked misleadingly.
  attended_count: number
  decidable_count: number
  // null = 아직 언어 선택 안한 사용자 (환영 페이지 유도 대상)
  preferred_language: 'ko' | 'en' | 'ja' | null
}

export interface MemberEventEntry {
  event_id: string
  event_title: string
  role: string
  battle_started_at: string | null
  gather_at: string | null
  created_at: string
  outcome: 'win' | 'loss' | null
  // Per-battle breakdown for this event (from event_battles). Used for
  // aggregate totals that count each battle separately rather than each event.
  battle_wins: number
  battle_losses: number
  // Per-event attendance. 'attended' = at least one assigned slot for this
  // member has attended_at set. 'no_show' = event battle started but no slot
  // was marked attended. 'unknown' = battle hasn't started yet (upcoming or
  // cancelled event) so attendance isn't decidable.
  attendance: 'attended' | 'no_show' | 'unknown'
  // Count of event_battles where this member was the recorded MVP. Summed
  // per event so the detail card can flag stand-out performances.
  mvp_count: number
}

export interface MemberRegearEntry {
  id: string
  event_id: string | null
  event_title: string
  role_name: string
  silver: number
  request_type: RegearType
  claimed_silver: number | null
  // Actual credited amount for approved rows (migration 044). NULL otherwise.
  payout_silver: number | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_at: string
  resolved_at: string | null
  handled_by_username: string | null
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
      handled_by_username: string | null
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
  preferred_language: 'ko' | 'en' | 'ja' | null
  participation_count: number
  role_breakdown: RoleCount[]
  events: MemberEventEntry[]
  // Top weapons the member brought, sorted by usage count desc. Aggregation
  // uses coalesce(assigned_weapon, weapon) so template slots without a
  // weapon_options pick still count toward the member's preference profile.
  weapon_breakdown: WeaponCount[]
  regears: MemberRegearEntry[]
  exchanges: MemberExchangeEntry[]
  balance: number
  lifetime_earned: number
  lifetime_spent: number
  // Attendance stats across all events the member signed up for. Rate is
  // attended / (attended + no_show) rounded to two digits — events where
  // the battle never started ('unknown') are excluded from the denominator
  // so cancelled/upcoming signups don't hurt the rate.
  attendance_stats: {
    attended: number
    no_show: number
    unknown: number
    rate: number | null
  }
  // Total MVP selections across the member's history. A single event can
  // contribute multiple MVPs if they had standout performances in more
  // than one battle of that event.
  total_mvps: number
}

export interface GuildAggregateStats {
  wins: number
  losses: number
  distinctOpponents: number
  startDate: string
  endDate: string
}

// /members 최상단 요약용. event_battles 의 outcome 을 그대로 세서 전투 단위로
// 승/패를 합산한다 (한 이벤트에서 2번 싸워 모두 이기면 2승). 같은 쿼리에서
// 등장한 상대 길드 종류 수도 센다. 관리자 설정의 날짜 필터는
// events.battle_started_at 에 적용한다.
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
    // Admin-entered dates are KST calendar days — anchor both bounds to KST
    // midnight so the filter includes everything from "YYYY-MM-DD 00:00 KST"
    // through "YYYY-MM-DD 23:59 KST", not the UTC equivalent that would
    // drift the window by 9 hours.
    let battleQuery = db
      .from('event_battles')
      .select('outcome, opponent_guild_id, opponent_guild, events!inner(battle_started_at)')
    if (startDate)
      battleQuery = battleQuery.gte('events.battle_started_at', `${startDate}T00:00:00+09:00`)
    if (endDate)
      battleQuery = battleQuery.lte('events.battle_started_at', `${endDate}T23:59:59+09:00`)

    const battlesRes = await battleQuery
    if (battlesRes.error) return { stats: null, error: battlesRes.error.message }

    let wins = 0
    let losses = 0
    // FK 가 백필된 행은 id 로, 아직 FK 가 연결 안 된 레거시 행은 정규화된
    // 이름으로 dedupe. 같은 길드가 두 방식으로 카운트돼 부풀지 않도록 우선순위:
    // id 가 있으면 id, 없으면 lowercase trim.
    const opponentKeys = new Set<string>()
    for (const row of battlesRes.data ?? []) {
      if (row.outcome === 'win') wins++
      else if (row.outcome === 'loss') losses++
      if (row.opponent_guild_id) opponentKeys.add(`id:${row.opponent_guild_id}`)
      else if (row.opponent_guild)
        opponentKeys.add(`name:${row.opponent_guild.trim().toLowerCase()}`)
    }

    return {
      stats: { wins, losses, distinctOpponents: opponentKeys.size, startDate, endDate },
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
        .select('discord_id, username, avatar, is_admin, updated_at, preferred_language'),
      db
        .from('slots')
        .select(
          'assigned_discord_id, role_name, attended_at, parties!inner(event_id, events!inner(id, battle_started_at))',
        )
        .not('assigned_discord_id', 'is', null),
    ])
    if (avatarsRes.error) return { members: [], error: avatarsRes.error.message }
    if (slotsRes.error) return { members: [], error: slotsRes.error.message }

    const unassignedRoleLabel = tCommon('unassignedRole')
    interface Agg {
      events: Set<string>
      roles: Map<string, number>
      attendedEvents: Set<string>
      decidableEvents: Set<string>
    }
    const bucket = new Map<string, Agg>()
    for (const row of slotsRes.data ?? []) {
      const discordId = row.assigned_discord_id
      if (!discordId) continue
      const party = row.parties as
        | { event_id: string; events: { id: string; battle_started_at: string | null } | { id: string; battle_started_at: string | null }[] }
        | { event_id: string; events: { id: string; battle_started_at: string | null } | { id: string; battle_started_at: string | null }[] }[]
        | null
      const partyObj = Array.isArray(party) ? party[0] : party
      const eventId = partyObj?.event_id
      if (!eventId) continue
      const event = partyObj
        ? Array.isArray(partyObj.events)
          ? partyObj.events[0]
          : partyObj.events
        : null
      let agg = bucket.get(discordId)
      if (!agg) {
        agg = {
          events: new Set(),
          roles: new Map(),
          attendedEvents: new Set(),
          decidableEvents: new Set(),
        }
        bucket.set(discordId, agg)
      }
      agg.events.add(eventId)
      const role = row.role_name ?? unassignedRoleLabel
      agg.roles.set(role, (agg.roles.get(role) ?? 0) + 1)
      if (event?.battle_started_at) {
        agg.decidableEvents.add(eventId)
        if (row.attended_at) agg.attendedEvents.add(eventId)
      }
    }

    const members: GuildMemberSummary[] = (avatarsRes.data ?? []).map((a) => {
      const agg = bucket.get(a.discord_id)
      const roles = agg
        ? Array.from(agg.roles.entries())
            .map(([role, count]) => ({ role, count }))
            .sort((x, y) => y.count - x.count)
        : []
      const decidable = agg?.decidableEvents.size ?? 0
      const attended = agg?.attendedEvents.size ?? 0
      const rate = decidable > 0 ? Math.round((attended / decidable) * 1000) / 10 : null
      return {
        discord_id: a.discord_id,
        username: a.username,
        avatar: a.avatar,
        is_admin: a.is_admin ?? false,
        updated_at: a.updated_at,
        participation_count: agg?.events.size ?? 0,
        top_roles: roles.slice(0, 3),
        attendance_rate: rate,
        attended_count: attended,
        decidable_count: decidable,
        preferred_language: isLocale(a.preferred_language) ? a.preferred_language : null,
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

export interface GuildGuestSummary {
  discord_id: string
  username: string
  avatar: string | null
  joined_at: string
  participation_count: number
  top_roles: RoleCount[]
  preferred_language: 'ko' | 'en' | 'ja' | null
}

// Lists everyone in the `guests` table with their slot participation counts.
// Mirrors listGuildMembers but pulls from guests + counts slot assignments.
export async function listGuildGuests(): Promise<{
  guests: GuildGuestSummary[]
  error?: string
}> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireSession()

    const [guestsRes, slotsRes] = await Promise.all([
      db
        .from('guests')
        .select('discord_id, username, avatar, joined_at, preferred_language')
        .order('joined_at', { ascending: false }),
      db
        .from('slots')
        .select('assigned_discord_id, role_name, parties!inner(event_id)')
        .not('assigned_discord_id', 'is', null),
    ])
    if (guestsRes.error) return { guests: [], error: guestsRes.error.message }
    if (slotsRes.error) return { guests: [], error: slotsRes.error.message }

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

    const guests: GuildGuestSummary[] = (guestsRes.data ?? []).map((g) => {
      const agg = bucket.get(g.discord_id)
      const roles = agg
        ? Array.from(agg.roles.entries())
            .map(([role, count]) => ({ role, count }))
            .sort((x, y) => y.count - x.count)
        : []
      return {
        discord_id: g.discord_id,
        username: g.username,
        avatar: g.avatar,
        joined_at: g.joined_at,
        participation_count: agg?.events.size ?? 0,
        top_roles: roles.slice(0, 3),
        preferred_language: isLocale(g.preferred_language) ? g.preferred_language : null,
      }
    })

    return { guests }
  } catch (e) {
    return { guests: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Admin-only. Revokes a guest immediately — layout gate re-checks existence
// on every request so the guest loses access on next navigation.
export async function revokeGuest(discordId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const { error } = await db.from('guests').delete().eq('discord_id', discordId)
    if (error) return { error: error.message }
    revalidatePath('/members')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
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
        .select('discord_id, username, avatar, updated_at, preferred_language')
        .eq('discord_id', discordId)
        .maybeSingle(),
      db
        .from('slots')
        .select(
          'role_name, attended_at, weapon_name, weapon_id, assigned_weapon_name, assigned_weapon_id, parties!inner(event_id, events!inner(id, title, created_at, battle_started_at, gather_at, outcome))',
        )
        .eq('assigned_discord_id', discordId),
      db
        .from('regear_requests')
        .select(
          'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, status, admin_notes, created_at, resolved_at, handled_by_username, events(title)',
        )
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false }),
      db
        .from('exchange_requests')
        .select('id, silver, status, admin_notes, created_at, resolved_at, handled_by_username')
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
    // Weapon aggregation — keyed by weapon_id when bundled, otherwise by a
    // normalized name so free-text entries still merge. Value tracks both the
    // id (for icon rendering) and the raw name so the UI can render whichever
    // is available without a second lookup.
    const weaponAgg = new Map<string, { id: string | null; name: string; count: number }>()
    // Per-event attendance aggregation — a member can fill multiple slots for
    // one event; any attended slot flips the event to 'attended'. Stored as
    // boolean per event and materialized into the enum after the loop.
    const attendedAnySlot = new Map<string, boolean>()
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
      attendedAnySlot.set(event.id, (attendedAnySlot.get(event.id) ?? false) || !!row.attended_at)

      // Prefer the member's assigned pick; fall back to the template weapon so
      // fixed-weapon slots (no weapon_options) still count. Skip rows where
      // neither exists — nothing to aggregate.
      const weaponId: string | null =
        (row as { assigned_weapon_id: string | null }).assigned_weapon_id ??
        (row as { weapon_id: string | null }).weapon_id ??
        null
      const weaponName: string | null =
        (row as { assigned_weapon_name: string | null }).assigned_weapon_name ??
        (row as { weapon_name: string | null }).weapon_name ??
        null
      if (weaponId || (weaponName && weaponName.trim().length > 0)) {
        const key = weaponId ?? `name:${(weaponName ?? '').trim().toLowerCase()}`
        const existing = weaponAgg.get(key)
        if (existing) {
          existing.count++
        } else {
          weaponAgg.set(key, {
            id: weaponId,
            name: weaponName?.trim() ?? weaponId ?? '',
            count: 1,
          })
        }
      }
      if (!eventsMap.has(event.id)) {
        eventsMap.set(event.id, {
          event_id: event.id,
          event_title: event.title,
          role,
          battle_started_at: event.battle_started_at,
          gather_at: event.gather_at,
          created_at: event.created_at,
          outcome: event.outcome,
          battle_wins: 0,
          battle_losses: 0,
          attendance: 'unknown',
          mvp_count: 0,
        })
      }
    }

    // Fetch per-battle outcomes for all participated events so the UI can show
    // per-battle wins/losses (user request: one event with 2 battles both won
    // should count as 2 wins, not 1). Also tallies MVP selections in the same
    // pass so we don't need a second round-trip.
    const participatedEventIds = Array.from(eventsMap.keys())
    if (participatedEventIds.length > 0) {
      const battlesRes = await db
        .from('event_battles')
        .select('event_id, outcome, mvp_discord_id')
        .in('event_id', participatedEventIds)
      if (battlesRes.error) return { detail: null, error: battlesRes.error.message }
      for (const row of battlesRes.data ?? []) {
        const entry = eventsMap.get(row.event_id)
        if (!entry) continue
        if (row.outcome === 'win') entry.battle_wins++
        else if (row.outcome === 'loss') entry.battle_losses++
        if (row.mvp_discord_id === discordId) entry.mvp_count++
      }
    }

    // Materialize attendance per event: once the battle has started the
    // member is either 'attended' (any slot marked attended_at) or 'no_show'
    // (battle started but no confirmation). Pre-battle events stay 'unknown'.
    for (const entry of eventsMap.values()) {
      if (!entry.battle_started_at) {
        entry.attendance = 'unknown'
      } else if (attendedAnySlot.get(entry.event_id)) {
        entry.attendance = 'attended'
      } else {
        entry.attendance = 'no_show'
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

    // Cap at 10 so a prolific member's card doesn't scroll forever — the tail
    // is uninteresting anyway (usually a long tail of one-off pick-ups).
    const weaponBreakdown: WeaponCount[] = Array.from(weaponAgg.values())
      .map((w) => ({ weapon_id: w.id, weapon_name: w.name, count: w.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

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
        payout_silver: row.payout_silver ?? null,
        status: row.status as MemberRegearEntry['status'],
        admin_notes: row.admin_notes,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
        handled_by_username: row.handled_by_username ?? null,
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
      handled_by_username: row.handled_by_username ?? null,
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

    let attended = 0
    let noShow = 0
    let unknown = 0
    let totalMvps = 0
    for (const e of events) {
      if (e.attendance === 'attended') attended++
      else if (e.attendance === 'no_show') noShow++
      else unknown++
      totalMvps += e.mvp_count
    }
    const decidable = attended + noShow
    const rate = decidable > 0 ? Math.round((attended / decidable) * 1000) / 10 : null

    return {
      detail: {
        discord_id: avatar.discord_id,
        username: avatar.username,
        avatar: avatar.avatar,
        updated_at: avatar.updated_at,
        preferred_language: isLocale(avatar.preferred_language) ? avatar.preferred_language : null,
        participation_count: events.length,
        role_breakdown: roleBreakdown,
        weapon_breakdown: weaponBreakdown,
        events,
        regears,
        exchanges,
        balance,
        lifetime_earned: earned,
        lifetime_spent: spent,
        attendance_stats: {
          attended,
          no_show: noShow,
          unknown,
          rate,
        },
        total_mvps: totalMvps,
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
