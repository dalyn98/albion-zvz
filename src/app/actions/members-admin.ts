'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAdmin } from '@/lib/auth'
import { isLocale } from '@/i18n/locales'
import { runMemberSync, type RolesSource } from '@/lib/member-sync'
import { extractWeaponCategory } from '@/lib/weapon-category'
import {
  calcOutcomeStats,
  calcParticipationStreak,
  calcRanking,
  calcSurvivalFromBattles,
} from '@/lib/member-stats'
import {
  fetchMemberBattleParticipations,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  isWithinTrackedWindow,
  mergeMemberBattles,
} from '@/lib/tracked-kills'
import type { RegearType } from '@/types'

// 길드원 열람(목록/상세)은 로그인만 되어 있으면 모두 가능하게 열어주고,
// 포인트 조정 같은 mutation은 별도로 requireAdmin()을 거치게 둔다.
async function requireSessionWithGuild(): Promise<{
  db: ReturnType<typeof getAdminClient>
  guildId: string
}> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  return { db: getAdminClient(), guildId }
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

// Aggregated by Albion weapon-family code (e.g., HOLYSTAFF / FIRESTAFF / SWORD).
// Same category covers every tier/enchant/artifact variant so the guild-level
// filter works even when members run different tiers of the same weapon.
export interface WeaponCategoryCount {
  category: string
  count: number
  // A representative bundled item id for the category (picked from the first
  // aggregated row). null when the category came from free-text names only,
  // which means the UI has no icon to render.
  sample_weapon_id: string | null
}

export interface GuildMemberSummary {
  discord_id: string
  username: string
  avatar: string | null
  is_admin: boolean
  updated_at: string
  participation_count: number
  top_roles: RoleCount[]
  top_weapons: WeaponCategoryCount[]
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

// 멤버 상세 화면의 "최근 킬/데스" 타임라인용. killboard_events 한 행 = 한 이벤트.
// tracked 는 해당 이벤트가 tenant_battle_records 창에 들어있는지 (= ZvZ 통계에
// 집계되는지). false 면 1:1 갱킹 등 필터 대상이라는 의미로 UI 에 미집계 배지.
export interface MemberKillEvent {
  event_id: string
  role: 'killer' | 'victim'
  opponent_name: string | null
  opponent_guild: string | null
  fame: number
  item_power: number | null
  occurred_at: string
  tracked: boolean
}

// 전투 기록, 참여 추이, 길드 내 상대순위 같은 "명예" 지표. 기존 KillboardStats
// 와 달리 참여 이벤트 ↔ victim 시간 매칭, 일자 단위 스트릭 집계, 멤버 전체
// 집계 비교 같은 추가 계산이 필요하다.
export interface MemberAdvancedStats {
  // 참여 이벤트 중 데스 없이 완수한 비율 (0~1). null = battle_started_at 있는
  // 참여 이벤트가 0개라 평가 불가.
  survival_rate: number | null
  evaluated_events: number
  // 같은 날 여러 이벤트는 하루로 합산. current 는 오늘/어제에 이어져 있어야
  // 살아있고, 그보다 오래 전이면 0.
  participation_current_streak: number
  participation_longest_streak: number
  // 데스 없이 연속으로 완수한 이벤트 수. 이벤트 시간 순회 기준.
  deathless_current_streak: number
  deathless_longest_streak: number
  // 길드 내 rank — 1이 가장 많이 기록한 멤버. null = 본인 카운트가 0.
  kill_rank: number | null
  kill_rank_percentile: number | null
  kill_rank_total: number
  participation_rank: number | null
  participation_rank_percentile: number | null
  participation_rank_total: number
  // 승/패/승률. outcome 이 finalized 된 이벤트만 집계.
  wins: number
  losses: number
  win_rate: number | null
  evaluated_outcome_events: number
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
  advanced_stats: MemberAdvancedStats
  // 최근 킬/데스 이벤트 (tracked 여부 포함). 통계 숫자와 실제 기록을 연결해
  // 사용자가 "왜 집계가 저렇게 나오는지" 직접 확인할 수 있게 한다.
  kill_history: MemberKillEvent[]
}

export async function listGuildMembers(): Promise<{
  members: GuildMemberSummary[]
  error?: string
}> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, guildId } = await requireSessionWithGuild()

    const [avatarsRes, slotsRes] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, is_admin, updated_at, preferred_language')
        .eq('guild_id', guildId)
        // 탈퇴자(member-sync cron 이 withdrawn_at 을 찍은 행) 은 /members 에서
        // 숨긴다. 통계 페이지에서만 별도 섹션으로 노출.
        .is('withdrawn_at', null),
      db
        .from('slots')
        .select(
          'assigned_discord_id, role_name, weapon_id, assigned_weapon_id, parties!inner(event_id)',
        )
        .eq('guild_id', guildId)
        .not('assigned_discord_id', 'is', null),
    ])
    if (avatarsRes.error) return { members: [], error: avatarsRes.error.message }
    if (slotsRes.error) return { members: [], error: slotsRes.error.message }

    const unassignedRoleLabel = tCommon('unassignedRole')
    interface Agg {
      events: Set<string>
      roles: Map<string, number>
      weapons: Map<string, { count: number; sampleId: string | null }>
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
        agg = { events: new Set(), roles: new Map(), weapons: new Map() }
        bucket.set(discordId, agg)
      }
      agg.events.add(eventId)
      const role = row.role_name ?? unassignedRoleLabel
      agg.roles.set(role, (agg.roles.get(role) ?? 0) + 1)

      // Prefer the member's assigned pick; fall back to the template weapon so
      // fixed-weapon slots (no weapon_options) still count toward the profile.
      const weaponId: string | null =
        (row as { assigned_weapon_id: string | null }).assigned_weapon_id ??
        (row as { weapon_id: string | null }).weapon_id ??
        null
      const category = extractWeaponCategory(weaponId)
      if (category) {
        const existing = agg.weapons.get(category)
        if (existing) {
          existing.count++
          // Keep the first valid sample id — stable across re-renders.
          if (!existing.sampleId && weaponId) existing.sampleId = weaponId
        } else {
          agg.weapons.set(category, { count: 1, sampleId: weaponId })
        }
      }
    }

    const members: GuildMemberSummary[] = (avatarsRes.data ?? []).map((a) => {
      const agg = bucket.get(a.discord_id)
      const roles = agg
        ? Array.from(agg.roles.entries())
            .map(([role, count]) => ({ role, count }))
            .sort((x, y) => y.count - x.count)
        : []
      const weapons: WeaponCategoryCount[] = agg
        ? Array.from(agg.weapons.entries())
            .map(([category, v]) => ({
              category,
              count: v.count,
              sample_weapon_id: v.sampleId,
            }))
            .sort((x, y) => y.count - x.count)
        : []
      return {
        discord_id: a.discord_id,
        username: a.username,
        avatar: a.avatar,
        is_admin: a.is_admin ?? false,
        updated_at: a.updated_at,
        participation_count: agg?.events.size ?? 0,
        // Full per-role breakdown so the client can filter/sort by any role.
        // UI only renders the first few as badges.
        top_roles: roles,
        top_weapons: weapons,
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

export interface WithdrawnMemberSummary {
  discord_id: string
  username: string
  avatar: string | null
  withdrawn_at: string
  updated_at: string
  participation_count: number
  top_roles: RoleCount[]
  preferred_language: 'ko' | 'en' | 'ja' | null
}

// 탈퇴 처리(member-sync 로 withdrawn_at 이 찍힌 행) 된 길드원 목록.
// /members 탭에서 별도로 노출 — 활동 중인 길드원과 섞이지 않게.
export async function listWithdrawnMembers(): Promise<{
  members: WithdrawnMemberSummary[]
  error?: string
}> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, guildId } = await requireSessionWithGuild()

    const [avatarsRes, slotsRes] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, updated_at, withdrawn_at, preferred_language')
        .eq('guild_id', guildId)
        .not('withdrawn_at', 'is', null),
      db
        .from('slots')
        .select('assigned_discord_id, role_name, parties!inner(event_id)')
        .eq('guild_id', guildId)
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

    const members: WithdrawnMemberSummary[] = (avatarsRes.data ?? []).map((a) => {
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
        withdrawn_at: a.withdrawn_at as string,
        updated_at: a.updated_at,
        participation_count: agg?.events.size ?? 0,
        top_roles: roles.slice(0, 3),
        preferred_language: isLocale(a.preferred_language) ? a.preferred_language : null,
      }
    })

    members.sort((a, b) => b.withdrawn_at.localeCompare(a.withdrawn_at))

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
    const { db, guildId } = await requireSessionWithGuild()

    const [guestsRes, slotsRes] = await Promise.all([
      db
        .from('guests')
        .select('discord_id, username, avatar, joined_at, preferred_language')
        .eq('guild_id', guildId)
        .order('joined_at', { ascending: false }),
      db
        .from('slots')
        .select('assigned_discord_id, role_name, parties!inner(event_id)')
        .eq('guild_id', guildId)
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
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireAdmin()
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('guests')
      .delete()
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
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
async function fetchMemberDetail(discordId: string, guildId: string): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  try {
    const db = getAdminClient()

    const [
      avatarRes,
      slotsRes,
      regearsRes,
      exchangesRes,
      ledgerRes,
      killboardRes,
      rankingRes,
      trackedWindows,
      participationsByMember,
    ] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, updated_at, preferred_language')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .maybeSingle(),
      db
        .from('slots')
        .select(
          'role_name, parties!inner(event_id, events!inner(id, title, created_at, battle_started_at, gather_at))',
        )
        .eq('guild_id', guildId)
        .eq('assigned_discord_id', discordId),
      db
        .from('regear_requests')
        .select(
          'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, status, admin_notes, created_at, resolved_at, handled_by_username, events(title)',
        )
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false }),
      db
        .from('exchange_requests')
        .select('id, silver, status, admin_notes, created_at, resolved_at, handled_by_username')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .order('created_at', { ascending: false }),
      db
        .from('point_ledger')
        .select('id, delta, reason, memo, created_at')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId),
      db
        .from('killboard_events')
        .select('event_id, role, fame, item_power, occurred_at, equipment, opponent_name, opponent_guild')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId),
      // 랭킹 RPC — 길드 전체 멤버의 kills/participations 를 집계해서 반환. 본인
      // 카운트와 비교해 상위 percentile 계산. 기존 PostgREST 쿼리는 group by 를
      // 내려주지 않고 limit 1000 에 걸리므로 RPC 로 한 번에 수행.
      db.rpc('member_ranking_counts', { p_guild_id: guildId }),
      fetchTrackedBattleWindows(db, guildId),
      fetchMemberBattleParticipations(db, guildId),
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
    // slots 는 더 이상 통계/무기 소스가 아니다 — 통계는 killboard 에서, 무기도
    // killboard.equipment.MainHand 에서. 여기서 slots 는 "스케줄 이벤트 목록" 과
    // role_breakdown 만 뽑는다 (killboard 엔 role 개념이 없음).
    const eventsMap = new Map<string, MemberEventEntry>()
    const roleCounter = new Map<string, number>()
    type EventShape = {
      id: string
      title: string
      created_at: string
      battle_started_at: string | null
      gather_at: string | null
    }
    for (const row of slotsRes.data ?? []) {
      const party = row.parties as
        | { event_id: string; events: EventShape | EventShape[] }
        | { event_id: string; events: EventShape | EventShape[] }[]
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

    // 두 소스 합집합: (1) killboard 기반 배틀 — kills/deaths 풍부한 정보,
    // (2) raw_battle.players 기반 0k0d 참여 — killboard 에는 없지만 배틀에 있던
    // 케이스(탱커/힐러가 교전 전 종료 등). kills/deaths/survival/streak/outcome
    // 모두의 분모이자 분자. 창 밖 이벤트(1:1 갱킹) 는 자동 제외.
    const killBattles = groupMemberKillsByBattle(killboardRes.data ?? [], trackedWindows)
    const battles = mergeMemberBattles(killBattles, participationsByMember.get(discordId))

    const killboard: KillboardStats = { kills: 0, deaths: 0, kill_fame: 0, death_fame: 0 }
    for (const b of battles) {
      killboard.kills += b.killCount
      killboard.deaths += b.deathCount
    }
    // fame / weapon 은 groupMemberKillsByBattle 이 노출하지 않으므로 별도 순회.
    // 창 밖 row (1:1 갱킹 등) 는 isWithinTrackedWindow 로 제외 — battles 와 동일 기준.
    // Equipment 는 현재 victim row 에만 저장됨 (killboard-sync.ts 규칙). 따라서
    // weapon_breakdown 은 "죽었을 때 들었던 무기" 에 가깝다.
    //
    // 집계 키는 extractWeaponCategory 결과 (예: HOLYSTAFF). 티어/인챈트/품질/
    // 아티팩트 변형을 모두 하나로 묶어 "같은 무기군" 이 분리 집계되지 않도록.
    // 아이콘 렌더용으로 첫 관측된 원본 id (예: T8_2H_HOLYSTAFF@2) 를 보존.
    const weaponAgg = new Map<string, { sampleId: string; count: number }>()
    type KillboardRow = {
      event_id: number | string | null
      role: string | null
      fame: number | null
      item_power: number | null
      occurred_at: string | null
      equipment: Record<string, { Type?: string } | null> | null
      opponent_name: string | null
      opponent_guild: string | null
    }
    const killHistory: MemberKillEvent[] = []
    for (const row of (killboardRes.data ?? []) as KillboardRow[]) {
      if (!row.occurred_at) continue
      const inWindow = isWithinTrackedWindow(row.occurred_at, trackedWindows)
      if (inWindow) {
        const fame = row.fame ?? 0
        if (row.role === 'killer') killboard.kill_fame += fame
        else if (row.role === 'victim') killboard.death_fame += fame
        const mainHandType = row.equipment?.MainHand?.Type
        if (mainHandType) {
          const category = extractWeaponCategory(mainHandType)
          if (category) {
            const existing = weaponAgg.get(category)
            if (existing) existing.count++
            else weaponAgg.set(category, { sampleId: mainHandType, count: 1 })
          }
        }
      }
      if (row.role === 'killer' || row.role === 'victim') {
        killHistory.push({
          event_id: String(row.event_id ?? ''),
          role: row.role,
          opponent_name: row.opponent_name,
          opponent_guild: row.opponent_guild,
          fame: row.fame ?? 0,
          item_power: row.item_power,
          occurred_at: row.occurred_at,
          tracked: inWindow,
        })
      }
    }
    // 최신순 정렬 + 상위 50개. 참여 이벤트와 같은 리듬으로 스크롤 없이 훑을 수
    // 있는 범위.
    killHistory.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    const killHistoryTrimmed = killHistory.slice(0, 50)

    // Cap at 10 so a prolific member's card doesn't scroll forever — the tail
    // is uninteresting anyway (usually a long tail of one-off pick-ups).
    // weapon_id 는 아이콘 렌더링용 샘플, weapon_name 은 category 코드 (UI 에서
    // locale 이름 없을 때 fallback).
    const weaponBreakdown: WeaponCount[] = Array.from(weaponAgg.entries())
      .map(([category, w]) => ({
        weapon_id: w.sampleId,
        weapon_name: category,
        count: w.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // 생존률/스트릭/승패: 전부 battles 배열에서 파생. DPS 제외는 킬/데스가
    // 실제로 있는 멤버만 참여로 치는 모델에서 의미가 약해 드롭 — 업적(badges) 의
    // DPS 제외 규칙은 그쪽에서 별도 유지.
    const survival = calcSurvivalFromBattles(
      battles.map((b) => ({ startedAt: b.startedAt, hadDeath: b.hadDeath })),
    )
    const participationStreak = calcParticipationStreak(
      battles.map((b) => b.startedAt),
      Date.now(),
    )
    const outcomeStats = calcOutcomeStats(battles.map((b) => b.outcome))

    const rankingRows = (rankingRes.data ?? []) as Array<{
      discord_id: string
      kills: number
      deaths: number
      participations: number
    }>
    const allKills = rankingRows.map((r) => r.kills)
    const allParticipations = rankingRows.map((r) => r.participations)
    const killRanking = calcRanking(killboard.kills, allKills)
    const participationRanking = calcRanking(battles.length, allParticipations)

    const advancedStats: MemberAdvancedStats = {
      survival_rate: survival.survivalRate,
      evaluated_events: survival.evaluatedEvents,
      participation_current_streak: participationStreak.currentStreak,
      participation_longest_streak: participationStreak.longestStreak,
      deathless_current_streak: survival.currentDeathlessStreak,
      deathless_longest_streak: survival.longestDeathlessStreak,
      kill_rank: killRanking.rank,
      kill_rank_percentile: killRanking.percentile,
      kill_rank_total: killRanking.totalRanked,
      participation_rank: participationRanking.rank,
      participation_rank_percentile: participationRanking.percentile,
      participation_rank_total: participationRanking.totalRanked,
      wins: outcomeStats.wins,
      losses: outcomeStats.losses,
      win_rate: outcomeStats.winRate,
      evaluated_outcome_events: outcomeStats.evaluatedEvents,
    }

    return {
      detail: {
        discord_id: avatar.discord_id,
        username: avatar.username,
        avatar: avatar.avatar,
        updated_at: avatar.updated_at,
        preferred_language: isLocale(avatar.preferred_language) ? avatar.preferred_language : null,
        participation_count: battles.length,
        role_breakdown: roleBreakdown,
        weapon_breakdown: weaponBreakdown,
        events,
        regears,
        exchanges,
        balance,
        lifetime_earned: earned,
        lifetime_spent: spent,
        killboard,
        advanced_stats: advancedStats,
        kill_history: killHistoryTrimmed,
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
  const guildId = await getSessionGuildId(session)
  return fetchMemberDetail(discordId, guildId)
}

export interface SyncMembersNowResult {
  scanned: number
  discordMembers: number
  activeRoleIdsCount: number
  rolesSource: RolesSource
  withdrawn: number
  rejoined: number
  error?: string
}

// 관리자 수동 실행. Cron 과 달리 20h throttle 을 우회해서 즉시 돌린다.
export async function syncMembersNow(): Promise<SyncMembersNowResult> {
  const tErr = await getTranslations('adminActionError')
  const empty: SyncMembersNowResult = {
    scanned: 0,
    discordMembers: 0,
    activeRoleIdsCount: 0,
    rolesSource: 'server_only',
    withdrawn: 0,
    rejoined: 0,
  }
  try {
    const session = await getSession()
    if (!session?.isAdmin) return { ...empty, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const outcome = await runMemberSync(guildId, { skipThrottle: true })
    if (outcome.kind === 'error') return { ...empty, error: outcome.message }
    // skipThrottle 이므로 'throttled' 은 발생 안함 — 안전하게 result 꺼냄.
    if (outcome.kind === 'throttled') return { ...empty, error: tErr('serverError') }
    return { ...outcome.result }
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Self-serve variant: logged-in members read their own detail.
// The session's discord_id is always used — a user cannot pass in another ID.
export async function getMyMemberDetail(): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const session = await getSession()
  if (!session) return { detail: null, error: 'Unauthorized' }
  const guildId = await getSessionGuildId(session)
  return fetchMemberDetail(session.discordId, guildId)
}
