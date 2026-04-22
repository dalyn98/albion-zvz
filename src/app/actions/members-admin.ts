'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { requireAdmin } from '@/lib/auth'
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

// killboard_events 집계. 길드 sync cron 이 폴링하는 Albion 킬보드 행에서
// role='killer' 는 멤버가 적을 잡은 이벤트, role='victim' 은 멤버가 죽은 이벤트.
// fame 필드는 TotalVictimKillFame 을 양쪽 모두 동일하게 저장해둔 것이라
// SUM 이 일관되게 나온다.
export interface KillboardStats {
  kills: number
  deaths: number
  kill_fame: number
  death_fame: number
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
  killboard: KillboardStats
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
        .select('discord_id, username, avatar, is_admin, updated_at, preferred_language')
        // 탈퇴자(member-sync cron 이 withdrawn_at 을 찍은 행) 은 /members 에서
        // 숨긴다. 통계 페이지에서만 별도 섹션으로 노출.
        .is('withdrawn_at', null),
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

    const [avatarRes, slotsRes, regearsRes, exchangesRes, ledgerRes, killboardRes] =
      await Promise.all([
        db
          .from('guild_avatars')
          .select('discord_id, username, avatar, updated_at, preferred_language')
          .eq('discord_id', discordId)
          .maybeSingle(),
        db
          .from('slots')
          .select(
            'role_name, weapon_name, weapon_id, assigned_weapon_name, assigned_weapon_id, parties!inner(event_id, events!inner(id, title, created_at, battle_started_at, gather_at))',
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
        db.from('killboard_events').select('role, fame').eq('discord_id', discordId),
      ])

    if (avatarRes.error) return { detail: null, error: avatarRes.error.message }
    if (slotsRes.error) return { detail: null, error: slotsRes.error.message }
    if (regearsRes.error) return { detail: null, error: regearsRes.error.message }
    if (exchangesRes.error) return { detail: null, error: exchangesRes.error.message }
    if (ledgerRes.error) return { detail: null, error: ledgerRes.error.message }
    // killboard_events 는 cron sync 실패·지연 등으로 비어 있을 수 있으므로
    // 오류가 나더라도 상세 페이지 자체를 막지 않고 0 으로 fallback.

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
    for (const row of slotsRes.data ?? []) {
      const party = row.parties as
        | { event_id: string; events: { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null } | { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null }[] }
        | { event_id: string; events: { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null } | { id: string; title: string; created_at: string; battle_started_at: string | null; gather_at: string | null }[] }[]
        | null
      const partyObj = Array.isArray(party) ? party[0] : party
      if (!partyObj) continue
      const event = Array.isArray(partyObj.events) ? partyObj.events[0] : partyObj.events
      if (!event) continue
      const role = row.role_name ?? unassignedRoleLabel
      roleCounter.set(role, (roleCounter.get(role) ?? 0) + 1)

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

    const killboard: KillboardStats = { kills: 0, deaths: 0, kill_fame: 0, death_fame: 0 }
    for (const row of killboardRes.data ?? []) {
      const fame = (row.fame as number | null) ?? 0
      if (row.role === 'killer') {
        killboard.kills += 1
        killboard.kill_fame += fame
      } else if (row.role === 'victim') {
        killboard.deaths += 1
        killboard.death_fame += fame
      }
    }

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
        killboard,
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
