'use server'


import { publicActionError } from '@/lib/public-action-error'
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
import { sessionHas, type SessionPayload } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireLiveSession } from '@/lib/auth'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { isLocale, type Locale } from '@/i18n/locales'
import { runMemberSync, type RolesSource } from '@/lib/member-sync'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { compareStrings } from '@/lib/sort-strings'
import type {
  MemberKillEvent as KillboardMemberKillEvent,
} from '@/lib/member-killboard-aggregation'
import type { ObservedWeaponUsage } from '@/lib/observed-weapon-usage'
import type { MemberAchievement } from '@/lib/member-achievements'
import type { RegearType } from '@/types'
import type { RegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import type { AccountAlbionIdentityView } from '@/lib/account-albion-identity'
import type { MemberVideoProofEntry } from '@/lib/member-video-proofs'

// 길드원 열람(목록/상세)은 로그인만 되어 있으면 모두 가능하게 열어주고,
// 포인트 조정 같은 mutation은 별도 액션에서 더 강한 권한 게이트를 둔다.
async function requireSessionWithGuild(): Promise<{
  db: ReturnType<typeof getAdminClient>
  guildId: string
  session: SessionPayload
}> {
  const session = await requireLiveSession()
  const guildId = await getSessionGuildId(session)
  return { db: getAdminClient(), guildId, session }
}

async function requireMemberManagerWithGuild(): Promise<{
  db: ReturnType<typeof getAdminClient>
  guildId: string
  session: SessionPayload
}> {
  const session = await requireLiveSession()
  if (!sessionHas(session, CAP.MEMBERS_MANAGE)) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  return { db: getAdminClient(), guildId, session }
}

export interface RoleCount {
  role: string
  count: number
}

export type MemberKillEvent = KillboardMemberKillEvent

// 이벤트 슬롯에서 선택·배정된 계획 편성. 실제 전투 장비 관측값과 섞지 않는다.
export interface PlannedWeaponCategoryCount {
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
  planned_weapon_categories: PlannedWeaponCategoryCount[]
  // null = 아직 언어 선택 안한 사용자 (환영 페이지 유도 대상)
  preferred_language: Locale | null
  member_state: 'active'
}

interface StableMemberDirectoryListRow {
  guild_member_id: string
  joined_at: string
  display_name: string | null
  discord_id: string
  discord_display_name: string | null
  avatar: string | null
  is_admin: boolean | null
  discord_updated_at: string | null
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
  video_proof_url: string | null
  video_proof_title: string | null
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

// 전투 기록과 참여 추이. 역할 간 실력 순위나 종합 회원 점수는 포함하지 않는다.
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
  // 승/패/승률. outcome 이 finalized 된 이벤트만 집계.
  wins: number
  losses: number
  win_rate: number | null
  evaluated_outcome_events: number
}

export interface MemberActivityAlbionIdentity {
  server: AccountAlbionIdentityView['server']
  nickname: string | null
  currentGuildName: string | null
  currentAllianceName: string | null
}

export interface GuildMemberActivityProfile {
  discord_id: string
  username: string
  avatar: string | null
  updated_at: string
  preferred_language: Locale | null
  member_state: 'active' | 'withdrawn' | 'identity_review'
  albion_identity: MemberActivityAlbionIdentity | null
  participation_count: number
  role_breakdown: RoleCount[]
  events: MemberEventEntry[]
  // 슬롯 신청/배정에서 계획된 편성 기록.
  planned_weapon_categories: PlannedWeaponCategoryCount[]
  // 최근 30일 공식/추적 전투에서 실제 MainHand 장비가 관측된 빈도.
  observed_weapon_usage: ObservedWeaponUsage
  achievements: MemberAchievement[]
  killboard: KillboardStats
  advanced_stats: MemberAdvancedStats
  // 길드 내부 상세에서는 근거 확인을 위해 원본 전투 기록을 볼 수 있다.
  // 외부 공개 활동 DTO는 이 필드를 절대 전달하지 않는다.
  kill_history: MemberKillEvent[]
}

export interface MemberRegearDetail {
  regears: MemberRegearEntry[]
  video_proofs: MemberVideoProofEntry[]
}

export interface MemberFinanceDetail {
  exchanges: MemberExchangeEntry[]
  balance: number
  lifetime_earned: number
  lifetime_spent: number
}

export interface GuildMemberDetail extends GuildMemberActivityProfile {
  // Stable guild-scoped identity. Business ownership is projected to this UUID
  // while discord_id remains a compatibility/contact identifier.
  guild_member_id: string | null
  display_name_override: string | null
  discord_username: string
  // Optional properties are deliberately omitted, rather than serialized as
  // empty arrays, when the viewer lacks the matching work capability.
  finance?: MemberFinanceDetail
  regear?: MemberRegearDetail
  identity_operations?: AccountAlbionIdentityView
}

export async function listGuildMembers(): Promise<{
  members: GuildMemberSummary[]
  error?: string
}> {
  const tCommon = await getTranslations('common')
  try {
    const { db, guildId, session } = await requireSessionWithGuild()
    if (
      !session.isMember &&
      !sessionHas(session, CAP.MEMBERS_VIEW) &&
      !sessionHas(session, CAP.MEMBERS_MANAGE)
    ) {
      throw new Error('Unauthorized')
    }

    const [directoryRes, slotsRes] = await Promise.all([
      db
        .from('guild_member_directory_v1')
        .select(
          'guild_member_id, joined_at, display_name, discord_id, discord_display_name, avatar, is_admin, discord_updated_at',
        )
        .eq('guild_id', guildId)
        .eq('tenant_status', 'active')
        .eq('status', 'active')
        .is('discord_access_revoked_at', null)
        .not('discord_id', 'is', null)
        // 일반 명부는 신뢰된 현재 캐릭터가 있는 회원만 노출한다. 미연결·분쟁·
        // 탈퇴 상태는 운영진 명부에서만 확인한다.
        .in('character_trust_status', ['roster_matched', 'trusted']),
      db
        .from('slots')
        .select(
          'assigned_guild_member_id, role_name, weapon_id, assigned_weapon_id, parties!inner(event_id, events!inner(exclude_from_participation_stats))',
        )
        .eq('guild_id', guildId)
        .not('assigned_guild_member_id', 'is', null),
    ])
    if (directoryRes.error) return { members: [], error: await publicActionError(directoryRes.error, 'actions/members-admin') }
    if (slotsRes.error) return { members: [], error: await publicActionError(slotsRes.error, 'actions/members-admin') }

    const unassignedRoleLabel = tCommon('unassignedRole')
    interface Agg {
      events: Set<string>
      roles: Map<string, number>
      weapons: Map<string, { count: number; sampleId: string | null }>
    }
    const bucket = new Map<string, Agg>()
    for (const row of slotsRes.data ?? []) {
      const guildMemberId = row.assigned_guild_member_id as string | null
      if (!guildMemberId) continue
      const eventId = eventIdFromSlot(row as SlotParticipationRow)
      if (!eventId) continue
      let agg = bucket.get(guildMemberId)
      if (!agg) {
        agg = { events: new Set(), roles: new Map(), weapons: new Map() }
        bucket.set(guildMemberId, agg)
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

    const directoryRows = (directoryRes.data ?? []) as StableMemberDirectoryListRow[]
    const discordIds = directoryRows.map((row) => row.discord_id)
    const preferencesRes = discordIds.length === 0
      ? { data: [] as Array<{ subject: string; preferred_language: string | null }>, error: null }
      : await db
        .from('global_access_preferences')
        .select('subject, preferred_language')
        .eq('provider', 'discord')
        .in('subject', discordIds)
    if (preferencesRes.error) {
      return {
        members: [],
        error: await publicActionError(preferencesRes.error, 'actions/members-admin'),
      }
    }
    const preferredLanguageByDiscordId = new Map(
      (preferencesRes.data ?? []).map((row) => [row.subject, row.preferred_language]),
    )
    const members: GuildMemberSummary[] = directoryRows.map((member) => {
      const agg = bucket.get(member.guild_member_id)
      const roles = agg
        ? Array.from(agg.roles.entries())
            .map(([role, count]) => ({ role, count }))
            .sort((x, y) => y.count - x.count)
        : []
      const weapons: PlannedWeaponCategoryCount[] = agg
        ? Array.from(agg.weapons.entries())
            .map(([category, v]) => ({
              category,
              count: v.count,
              sample_weapon_id: v.sampleId,
            }))
            .sort((x, y) => y.count - x.count)
        : []
      return {
        discord_id: member.discord_id,
        username:
          member.display_name?.trim() ||
          member.discord_display_name?.trim() ||
          member.discord_id,
        avatar: member.avatar,
        is_admin: member.is_admin ?? false,
        updated_at: member.discord_updated_at ?? member.joined_at,
        participation_count: agg?.events.size ?? 0,
        // Full per-role breakdown so the client can filter/sort by any role.
        // UI only renders the first few as badges.
        top_roles: roles,
        planned_weapon_categories: weapons,
        preferred_language: isLocale(preferredLanguageByDiscordId.get(member.discord_id))
          ? preferredLanguageByDiscordId.get(member.discord_id) as Locale
          : null,
        member_state: 'active',
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
    return { members: [], error: await publicActionError(e, 'actions/members-admin') }
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
  try {
    const { db, guildId } = await requireMemberManagerWithGuild()

    const [avatarsRes, slotsRes] = await Promise.all([
      db
        .from('guild_avatars')
        .select('discord_id, username, avatar, updated_at, withdrawn_at, preferred_language')
        .eq('guild_id', guildId)
        .not('withdrawn_at', 'is', null),
      db
        .from('slots')
        .select(
          'assigned_discord_id, role_name, parties!inner(event_id, events!inner(exclude_from_participation_stats))',
        )
        .eq('guild_id', guildId)
        .not('assigned_discord_id', 'is', null),
    ])
    if (avatarsRes.error) return { members: [], error: await publicActionError(avatarsRes.error, 'actions/members-admin') }
    if (slotsRes.error) return { members: [], error: await publicActionError(slotsRes.error, 'actions/members-admin') }

    const unassignedRoleLabel = tCommon('unassignedRole')
    interface Agg {
      events: Set<string>
      roles: Map<string, number>
    }
    const bucket = new Map<string, Agg>()
    for (const row of slotsRes.data ?? []) {
      const discordId = row.assigned_discord_id
      if (!discordId) continue
      const eventId = eventIdFromSlot(row as SlotParticipationRow)
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
    return { members: [], error: await publicActionError(e, 'actions/members-admin') }
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
  try {
    const { db, guildId } = await requireMemberManagerWithGuild()

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
    if (rosterRes.error) return { roster: [], error: await publicActionError(rosterRes.error, 'actions/members-admin') }
    if (avatarsRes.error) return { roster: [], error: await publicActionError(avatarsRes.error, 'actions/members-admin') }

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
    return { roster: [], error: await publicActionError(e, 'actions/members-admin') }
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
  assigned_guild_member_id?: string | null
  role_name: string | null
  weapon_id?: string | null
  assigned_weapon_id?: string | null
  parties:
    | {
        event_id: string
        events?:
          | { exclude_from_participation_stats: boolean | null }
          | { exclude_from_participation_stats: boolean | null }[]
          | null
      }
    | {
        event_id: string
        events?:
          | { exclude_from_participation_stats: boolean | null }
          | { exclude_from_participation_stats: boolean | null }[]
          | null
      }[]
    | null
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

export type MembersDirectoryTab = 'members' | 'guests' | 'roster' | 'withdrawn'

export interface MembersDirectoryCounts {
  members: number
  guests: number
  withdrawn: number
  roster: number
}

export async function listMembersDirectoryCounts(): Promise<MembersDirectoryCounts> {
  const { db, guildId } = await requireMemberManagerWithGuild()
  const [activeAvatarsRes, withdrawnAvatarsRes, guestsRes, rosterRes] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .is('withdrawn_at', null),
    db
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .not('withdrawn_at', 'is', null),
    db
      .from('guests')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', guildId),
    db
      .from('albion_guild_members')
      .select('albion_player_id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .is('left_at', null),
  ])

  return {
    members: activeAvatarsRes.count ?? 0,
    guests: guestsRes.count ?? 0,
    withdrawn: withdrawnAvatarsRes.count ?? 0,
    roster: rosterRes.count ?? 0,
  }
}

export async function listMembersDirectoryTab(
  tab: MembersDirectoryTab,
): Promise<MembersDirectoryResult> {
  await requireMemberManagerWithGuild()
  const empty: MembersDirectoryResult = {
    members: [],
    guests: [],
    withdrawnMembers: [],
    roster: [],
  }

  if (tab === 'members') {
    const result = await listGuildMembers()
    return {
      ...empty,
      members: result.members,
      membersError: result.error,
    }
  }
  if (tab === 'guests') {
    const result = await listGuildGuests()
    return {
      ...empty,
      guests: result.guests,
      guestsError: result.error,
    }
  }
  if (tab === 'withdrawn') {
    const result = await listWithdrawnMembers()
    return {
      ...empty,
      withdrawnMembers: result.members,
      withdrawnError: result.error,
    }
  }

  const result = await listAlbionRoster()
  return {
    ...empty,
    roster: result.roster,
    rosterError: result.error,
  }
}

function eventIdFromSlot(row: SlotParticipationRow): string | null {
  const party = row.parties
  const firstParty = Array.isArray(party) ? party[0] : party
  if (!firstParty) return null
  const event = Array.isArray(firstParty.events) ? firstParty.events[0] : firstParty.events
  return event?.exclude_from_participation_stats === true ? null : firstParty.event_id
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

function weaponCounts(agg: ParticipationAgg | undefined): PlannedWeaponCategoryCount[] {
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
      planned_weapon_categories: weaponCounts(agg),
      preferred_language: preferredLanguage(a.preferred_language),
      member_state: 'active' as const,
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
  const empty: MembersDirectoryResult = {
    members: [],
    guests: [],
    withdrawnMembers: [],
    roster: [],
  }
  try {
    const { db, guildId } = await requireMemberManagerWithGuild()
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
          'assigned_discord_id, role_name, weapon_id, assigned_weapon_id, parties!inner(event_id, events!inner(exclude_from_participation_stats))',
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

    const slotsError = slotsRes.error
      ? await publicActionError(slotsRes.error, 'actions/members-admin')
      : undefined
    const bucket = slotsError
      ? new Map<string, ParticipationAgg>()
      : buildParticipationAgg(
          (slotsRes.data ?? []) as SlotParticipationRow[],
          tCommon('unassignedRole'),
        )
    const rosterSourceError = rosterRes.error ?? rosterAvatarsRes.error
    const rosterError = rosterSourceError
      ? await publicActionError(rosterSourceError, 'actions/members-admin')
      : undefined
    const membersError = activeAvatarsRes.error
      ? await publicActionError(activeAvatarsRes.error, 'actions/members-admin')
      : slotsError
    const guestsError = guestsRes.error
      ? await publicActionError(guestsRes.error, 'actions/members-admin')
      : slotsError
    const withdrawnError = withdrawnAvatarsRes.error
      ? await publicActionError(withdrawnAvatarsRes.error, 'actions/members-admin')
      : slotsError

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
      membersError,
      guestsError,
      withdrawnError,
      rosterError,
    }
  } catch (e) {
    const error = await publicActionError(e, 'actions/members-admin')
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
  try {
    const { db, guildId } = await requireMemberManagerWithGuild()

    const [guestsRes, slotsRes] = await Promise.all([
      db
        .from('guests')
        .select('discord_id, username, avatar, joined_at, preferred_language')
        .eq('guild_id', guildId)
        .order('joined_at', { ascending: false }),
      db
        .from('slots')
        .select(
          'assigned_discord_id, role_name, parties!inner(event_id, events!inner(exclude_from_participation_stats))',
        )
        .eq('guild_id', guildId)
        .not('assigned_discord_id', 'is', null),
    ])
    if (guestsRes.error) return { guests: [], error: await publicActionError(guestsRes.error, 'actions/members-admin') }
    if (slotsRes.error) return { guests: [], error: await publicActionError(slotsRes.error, 'actions/members-admin') }

    const unassignedRoleLabel = tCommon('unassignedRole')
    interface Agg {
      events: Set<string>
      roles: Map<string, number>
    }
    const bucket = new Map<string, Agg>()
    for (const row of slotsRes.data ?? []) {
      const discordId = row.assigned_discord_id
      if (!discordId) continue
      const eventId = eventIdFromSlot(row as SlotParticipationRow)
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
    return { guests: [], error: await publicActionError(e, 'actions/members-admin') }
  }
}

// Admin-only. Revokes a guest immediately and records a durable deny row so a
// reusable event invite token cannot recreate the same guest after deletion.
export async function revokeGuest(discordId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession()
    if (!sessionHas(session, CAP.MEMBERS_MANAGE)) {
      return { error: tErr('unauthorized') }
    }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)
    const { error: revocationError } = await db
      .from('guest_revocations')
      .upsert(
        {
          guild_id: guildId,
          discord_id: discordId,
          revoked_by: session.discordId,
          revoked_by_username: session.username,
        },
        { onConflict: 'guild_id,discord_id' },
      )
    if (revocationError) return { error: await publicActionError(revocationError, 'actions/members-admin') }

    const { error } = await db
      .from('guests')
      .delete()
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (error) return { error: await publicActionError(error, 'actions/members-admin') }
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
    return { error: await publicActionError(e, 'actions/members-admin') }
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
    const session = await requireLiveSession()
    if (!session.isAdmin) return { ...empty, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const outcome = await runMemberSync(guildId, { skipThrottle: true })
    if (outcome.kind === 'error') return { ...empty, error: await publicActionError(outcome, 'actions/members-admin') }
    // skipThrottle 이므로 'throttled' 은 발생 안함 — 안전하게 result 꺼냄.
    if (outcome.kind === 'throttled') return { ...empty, error: tErr('serverError') }
    return { ...outcome.result }
  } catch (e) {
    return { ...empty, error: await publicActionError(e, 'actions/members-admin') }
  }
}

// detail fetcher 의 타입은 importer 호환을 위해 re-export. 'use server' 파일에서
// 값 re-export 는 Turbopack 이 async 여부를 보장 못해 거부 — fetcher 함수는
// 직접 `@/app/actions/members-admin-detail` 에서 import 하도록 호출 측 변경.
export type { AlbionMemberDetail } from '@/app/actions/members-admin-detail'
