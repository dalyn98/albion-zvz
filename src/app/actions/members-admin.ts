'use server'

// 멤버 관련 server actions. 800+ 라인 부담을 분산하기 위해 상세 화면 fetcher 는
// `members-admin-detail.ts` 로 분리했고, 이 파일은 그 외 list/모집/관리 액션을
// 담당한다.
// - listGuildMembers / listWithdrawnMembers / listAlbionRoster / listGuildGuests
// - revokeGuest, syncMembersNow
// - 공유 타입 (GuildMemberDetail 등) 정의는 여기 — components 와 detail 액션 모두
//   여기서 import.
//
// 호환성: 옛 임포트 (getGuildMemberDetail / getMyMemberDetail / getAlbionMemberDetail
// 및 그 타입) 는 파일 하단에서 detail 파일로 re-export.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireCapability } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { isLocale, type Locale } from '@/i18n/locales'
import { runMemberSync, type RolesSource } from '@/lib/member-sync'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { compareStrings } from '@/lib/sort-strings'
import type {
  WeaponCount as KillboardWeaponCount,
  MemberKillEvent as KillboardMemberKillEvent,
} from '@/lib/member-killboard-aggregation'
import type { RegearType } from '@/types'
import type { RegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import type { AccountAlbionIdentityView } from '@/lib/account-albion-identity'

// 길드원 열람(목록/상세)은 로그인만 되어 있으면 모두 가능하게 열어주고,
// 포인트 조정 같은 mutation은 별도 액션에서 더 강한 권한 게이트를 둔다.
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

// 단순 무기군 카운트. lib/member-killboard-aggregation 의 정의를 그대로 노출 —
// 옛 임포터(`MemberDetailView` 등) 가 `@/app/actions/members-admin` 에서 받던 것을
// 그대로 유지하기 위해 type alias 로 재선언한다.
export type WeaponCount = KillboardWeaponCount
export type MemberKillEvent = KillboardMemberKillEvent

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
  preferred_language: Locale | null
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
  // 마이그 151. status='rejected' 인 row 만 값이 채워진다. UI 에서 enum 라벨로 표기.
  reject_reason_code: RegearRejectReasonCode | null
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
      handled_by_username: string | null
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
  preferred_language: Locale | null
  albion_identity: AccountAlbionIdentityView | null
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
      return compareStrings(a.username, b.username)
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
  preferred_language: Locale | null
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

export interface AlbionRosterEntry {
  albion_player_id: string
  albion_player_name: string
  albion_server: 'west' | 'east' | 'europe'
  kill_fame: number
  death_fame: number
  fame_ratio: number
  average_item_power: number
  avatar: string | null
  avatar_ring: string | null
  last_seen_at: string
  // Discord 연동 멤버는 guild_avatars 와 player_id 로 join 되는 행. null = 미연동.
  // 연동된 경우 discord_id 를 클릭해 멤버 상세로 이동할 수 있게 노출.
  linked_discord_id: string | null
  linked_username: string | null
  linked_avatar: string | null
  // 탈퇴(withdrawn_at) 된 Discord 멤버는 연동되어 있어도 활성 멤버로 카운트
  // 하지 않는다 — UI 에서 상세 링크 비활성, 배지도 다르게.
  linked_withdrawn: boolean
}

// Albion 길드 로스터 (gameinfo /guilds/{id}/members sync 결과). Discord 미연동
// 멤버까지 포함된 전 멤버 목록. guild_avatars 와 albion_player_id 로 left join 해
// "Discord 연동" 여부를 노출 — 연동된 멤버 클릭 시 기존 멤버 상세로 이동.
export async function listAlbionRoster(): Promise<{
  roster: AlbionRosterEntry[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, guildId } = await requireSessionWithGuild()

    const [rosterRes, avatarsRes] = await Promise.all([
      db
        .from('albion_guild_members')
        .select(
          'albion_player_id, albion_player_name, albion_server, kill_fame, death_fame, fame_ratio, average_item_power, avatar, avatar_ring, last_seen_at',
        )
        .eq('guild_id', guildId)
        .is('left_at', null),
      // Discord 멤버는 albion_player_id 가 guild_avatars 에 적힌 경우 onboarding
      // 을 거친 사람. 같은 길드 안에서 player_id 는 유일하므로 Map 으로 join.
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, albion_player_id, withdrawn_at')
        .eq('guild_id', guildId)
        .not('albion_player_id', 'is', null),
    ])
    if (rosterRes.error) return { roster: [], error: rosterRes.error.message }
    if (avatarsRes.error) return { roster: [], error: avatarsRes.error.message }

    const linkMap = new Map<
      string,
      { discordId: string; username: string; avatar: string | null; withdrawn: boolean }
    >()
    for (const a of avatarsRes.data ?? []) {
      const playerId = a.albion_player_id as string | null
      if (!playerId) continue
      linkMap.set(playerId, {
        discordId: a.discord_id as string,
        username: a.username as string,
        avatar: (a.avatar as string | null) ?? null,
        withdrawn: a.withdrawn_at !== null,
      })
    }

    const roster: AlbionRosterEntry[] = (rosterRes.data ?? []).map((r) => {
      const link = linkMap.get(r.albion_player_id as string)
      return {
        albion_player_id: r.albion_player_id as string,
        albion_player_name: r.albion_player_name as string,
        albion_server: r.albion_server as 'west' | 'east' | 'europe',
        kill_fame: Number(r.kill_fame ?? 0),
        death_fame: Number(r.death_fame ?? 0),
        fame_ratio: Number(r.fame_ratio ?? 0),
        average_item_power: Number(r.average_item_power ?? 0),
        avatar: (r.avatar as string | null) ?? null,
        avatar_ring: (r.avatar_ring as string | null) ?? null,
        last_seen_at: r.last_seen_at as string,
        linked_discord_id: link?.discordId ?? null,
        linked_username: link?.username ?? null,
        linked_avatar: link?.avatar ?? null,
        linked_withdrawn: link?.withdrawn ?? false,
      }
    })

    // 기본 정렬: kill_fame desc → 동률이면 이름. UI 에서 다른 정렬 키 (참여순)
    // 도 제공하지만 초기 진입 인상은 "활약하는 멤버 위로".
    roster.sort((a, b) => {
      if (b.kill_fame !== a.kill_fame) return b.kill_fame - a.kill_fame
      return compareStrings(a.albion_player_name, b.albion_player_name)
    })

    return { roster }
  } catch (e) {
    return { roster: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export interface GuildGuestSummary {
  discord_id: string
  username: string
  avatar: string | null
  joined_at: string
  participation_count: number
  top_roles: RoleCount[]
  preferred_language: Locale | null
}

interface SlotParticipationRow {
  assigned_discord_id: string | null
  role_name: string | null
  weapon_id?: string | null
  assigned_weapon_id?: string | null
  parties: { event_id: string } | { event_id: string }[] | null
}

interface ParticipationAgg {
  events: Set<string>
  roles: Map<string, number>
  weapons: Map<string, { count: number; sampleId: string | null }>
}

interface ActiveAvatarRow {
  discord_id: string
  username: string
  avatar: string | null
  is_admin: boolean | null
  updated_at: string
  preferred_language: string | null
}

interface WithdrawnAvatarRow {
  discord_id: string
  username: string
  avatar: string | null
  updated_at: string
  withdrawn_at: string
  preferred_language: string | null
}

interface GuestRow {
  discord_id: string
  username: string
  avatar: string | null
  joined_at: string
  preferred_language: string | null
}

interface RosterRow {
  albion_player_id: string
  albion_player_name: string
  albion_server: 'west' | 'east' | 'europe'
  kill_fame: number | null
  death_fame: number | null
  fame_ratio: number | null
  average_item_power: number | null
  avatar: string | null
  avatar_ring: string | null
  last_seen_at: string
}

interface RosterAvatarRow {
  discord_id: string
  username: string
  avatar: string | null
  albion_player_id: string | null
  withdrawn_at: string | null
}

export interface MembersDirectoryResult {
  members: GuildMemberSummary[]
  guests: GuildGuestSummary[]
  withdrawnMembers: WithdrawnMemberSummary[]
  roster: AlbionRosterEntry[]
  membersError?: string
  guestsError?: string
  withdrawnError?: string
  rosterError?: string
}

function eventIdFromSlot(row: SlotParticipationRow): string | null {
  const party = row.parties
  return Array.isArray(party) ? party[0]?.event_id ?? null : party?.event_id ?? null
}

function buildParticipationAgg(
  rows: readonly SlotParticipationRow[],
  unassignedRoleLabel: string,
): Map<string, ParticipationAgg> {
  const bucket = new Map<string, ParticipationAgg>()
  for (const row of rows) {
    const discordId = row.assigned_discord_id
    const eventId = eventIdFromSlot(row)
    if (!discordId || !eventId) continue
    let agg = bucket.get(discordId)
    if (!agg) {
      agg = { events: new Set(), roles: new Map(), weapons: new Map() }
      bucket.set(discordId, agg)
    }
    agg.events.add(eventId)
    const role = row.role_name ?? unassignedRoleLabel
    agg.roles.set(role, (agg.roles.get(role) ?? 0) + 1)

    const weaponId = row.assigned_weapon_id ?? row.weapon_id ?? null
    const category = extractWeaponCategory(weaponId)
    if (!category) continue
    const existing = agg.weapons.get(category)
    if (existing) {
      existing.count++
      if (!existing.sampleId && weaponId) existing.sampleId = weaponId
    } else {
      agg.weapons.set(category, { count: 1, sampleId: weaponId })
    }
  }
  return bucket
}

function roleCounts(agg: ParticipationAgg | undefined, limit?: number): RoleCount[] {
  const roles = agg
    ? Array.from(agg.roles.entries())
        .map(([role, count]) => ({ role, count }))
        .sort((x, y) => y.count - x.count)
    : []
  return typeof limit === 'number' ? roles.slice(0, limit) : roles
}

function weaponCounts(agg: ParticipationAgg | undefined): WeaponCategoryCount[] {
  return agg
    ? Array.from(agg.weapons.entries())
        .map(([category, v]) => ({
          category,
          count: v.count,
          sample_weapon_id: v.sampleId,
        }))
        .sort((x, y) => y.count - x.count)
    : []
}

function preferredLanguage(value: string | null): Locale | null {
  return isLocale(value) ? value : null
}

function buildGuildMemberSummaries(
  rows: readonly ActiveAvatarRow[],
  bucket: Map<string, ParticipationAgg>,
): GuildMemberSummary[] {
  const members = rows.map((a) => {
    const agg = bucket.get(a.discord_id)
    return {
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      is_admin: a.is_admin ?? false,
      updated_at: a.updated_at,
      participation_count: agg?.events.size ?? 0,
      top_roles: roleCounts(agg),
      top_weapons: weaponCounts(agg),
      preferred_language: preferredLanguage(a.preferred_language),
    }
  })
  members.sort((a, b) => {
    if (b.participation_count !== a.participation_count) {
      return b.participation_count - a.participation_count
    }
    return compareStrings(a.username, b.username)
  })
  return members
}

function buildWithdrawnMemberSummaries(
  rows: readonly WithdrawnAvatarRow[],
  bucket: Map<string, ParticipationAgg>,
): WithdrawnMemberSummary[] {
  const members = rows.map((a) => {
    const agg = bucket.get(a.discord_id)
    return {
      discord_id: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      withdrawn_at: a.withdrawn_at,
      updated_at: a.updated_at,
      participation_count: agg?.events.size ?? 0,
      top_roles: roleCounts(agg, 3),
      preferred_language: preferredLanguage(a.preferred_language),
    }
  })
  members.sort((a, b) => b.withdrawn_at.localeCompare(a.withdrawn_at))
  return members
}

function buildGuestSummaries(
  rows: readonly GuestRow[],
  bucket: Map<string, ParticipationAgg>,
): GuildGuestSummary[] {
  return rows.map((g) => {
    const agg = bucket.get(g.discord_id)
    return {
      discord_id: g.discord_id,
      username: g.username,
      avatar: g.avatar,
      joined_at: g.joined_at,
      participation_count: agg?.events.size ?? 0,
      top_roles: roleCounts(agg, 3),
      preferred_language: preferredLanguage(g.preferred_language),
    }
  })
}

function buildAlbionRosterSummaries(
  rosterRows: readonly RosterRow[],
  avatarRows: readonly RosterAvatarRow[],
): AlbionRosterEntry[] {
  const linkMap = new Map<
    string,
    { discordId: string; username: string; avatar: string | null; withdrawn: boolean }
  >()
  for (const a of avatarRows) {
    if (!a.albion_player_id) continue
    linkMap.set(a.albion_player_id, {
      discordId: a.discord_id,
      username: a.username,
      avatar: a.avatar,
      withdrawn: a.withdrawn_at !== null,
    })
  }

  const roster = rosterRows.map((r) => {
    const link = linkMap.get(r.albion_player_id)
    return {
      albion_player_id: r.albion_player_id,
      albion_player_name: r.albion_player_name,
      albion_server: r.albion_server,
      kill_fame: Number(r.kill_fame ?? 0),
      death_fame: Number(r.death_fame ?? 0),
      fame_ratio: Number(r.fame_ratio ?? 0),
      average_item_power: Number(r.average_item_power ?? 0),
      avatar: r.avatar,
      avatar_ring: r.avatar_ring,
      last_seen_at: r.last_seen_at,
      linked_discord_id: link?.discordId ?? null,
      linked_username: link?.username ?? null,
      linked_avatar: link?.avatar ?? null,
      linked_withdrawn: link?.withdrawn ?? false,
    }
  })
  roster.sort((a, b) => {
    if (b.kill_fame !== a.kill_fame) return b.kill_fame - a.kill_fame
    return compareStrings(a.albion_player_name, b.albion_player_name)
  })
  return roster
}

export async function listMembersDirectory(): Promise<MembersDirectoryResult> {
  const tCommon = await getTranslations('common')
  const tErr = await getTranslations('adminActionError')
  const empty: MembersDirectoryResult = {
    members: [],
    guests: [],
    withdrawnMembers: [],
    roster: [],
  }
  try {
    const { db, guildId } = await requireSessionWithGuild()
    const [
      activeAvatarsRes,
      withdrawnAvatarsRes,
      guestsRes,
      slotsRes,
      rosterRes,
      rosterAvatarsRes,
    ] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, is_admin, updated_at, preferred_language')
        .eq('guild_id', guildId)
        .is('withdrawn_at', null),
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, updated_at, withdrawn_at, preferred_language')
        .eq('guild_id', guildId)
        .not('withdrawn_at', 'is', null),
      db
        .from('guests')
        .select('discord_id, username, avatar, joined_at, preferred_language')
        .eq('guild_id', guildId)
        .order('joined_at', { ascending: false }),
      db
        .from('slots')
        .select(
          'assigned_discord_id, role_name, weapon_id, assigned_weapon_id, parties!inner(event_id)',
        )
        .eq('guild_id', guildId)
        .not('assigned_discord_id', 'is', null),
      db
        .from('albion_guild_members')
        .select(
          'albion_player_id, albion_player_name, albion_server, kill_fame, death_fame, fame_ratio, average_item_power, avatar, avatar_ring, last_seen_at',
        )
        .eq('guild_id', guildId)
        .is('left_at', null),
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, albion_player_id, withdrawn_at')
        .eq('guild_id', guildId)
        .not('albion_player_id', 'is', null),
    ])

    const slotsError = slotsRes.error?.message
    const bucket = slotsError
      ? new Map<string, ParticipationAgg>()
      : buildParticipationAgg(
          (slotsRes.data ?? []) as SlotParticipationRow[],
          tCommon('unassignedRole'),
        )
    const rosterError = rosterRes.error?.message ?? rosterAvatarsRes.error?.message

    return {
      members: activeAvatarsRes.error || slotsError
        ? []
        : buildGuildMemberSummaries((activeAvatarsRes.data ?? []) as ActiveAvatarRow[], bucket),
      guests: guestsRes.error || slotsError
        ? []
        : buildGuestSummaries((guestsRes.data ?? []) as GuestRow[], bucket),
      withdrawnMembers: withdrawnAvatarsRes.error || slotsError
        ? []
        : buildWithdrawnMemberSummaries(
            (withdrawnAvatarsRes.data ?? []) as WithdrawnAvatarRow[],
            bucket,
          ),
      roster: rosterError
        ? []
        : buildAlbionRosterSummaries(
            (rosterRes.data ?? []) as RosterRow[],
            (rosterAvatarsRes.data ?? []) as RosterAvatarRow[],
          ),
      membersError: activeAvatarsRes.error?.message ?? slotsError,
      guestsError: guestsRes.error?.message ?? slotsError,
      withdrawnError: withdrawnAvatarsRes.error?.message ?? slotsError,
      rosterError,
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : tErr('serverError')
    return {
      ...empty,
      membersError: error,
      guestsError: error,
      withdrawnError: error,
      rosterError: error,
    }
  }
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
    const db = await requireCapability(CAP.MEMBERS_MANAGE)
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('guests')
      .delete()
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (error) return { error: error.message }
    revalidatePath('/members')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'member.kick',
      targetDiscordId: discordId,
      targetKind: 'member',
      details: { kind: 'guest' },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export interface SyncMembersNowResult {
  scanned: number
  discordMembers: number
  activeRoleIdsCount: number
  rolesSource: RolesSource
  withdrawn: number
  rejoined: number
  adminUpdated: number
  bombSquadCallerUpdated: number
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
    adminUpdated: 0,
    bombSquadCallerUpdated: 0,
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

// detail fetcher 의 타입은 importer 호환을 위해 re-export. 'use server' 파일에서
// 값 re-export 는 Turbopack 이 async 여부를 보장 못해 거부 — fetcher 함수는
// 직접 `@/app/actions/members-admin-detail` 에서 import 하도록 호출 측 변경.
export type { AlbionMemberDetail } from '@/app/actions/members-admin-detail'
