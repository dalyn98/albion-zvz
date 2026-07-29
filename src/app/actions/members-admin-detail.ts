'use server'


import { publicActionError, publicActionMessage } from '@/lib/public-action-error'
// 멤버 상세 화면 (Discord 연동 / 미연동 Albion 멤버 양쪽) 의 fetcher.
// `members-admin.ts` 의 800+ 라인 부담을 덜기 위해 분리.
//
// - fetchMemberDetail(internal) — guildId+discordId 기반 코어. 어드민/본인 양쪽이
//   여기로 funnel.
// - getGuildMemberDetail — 활성 멤버의 공통 활동 프로필과 권한별 상세 entry.
// - getManagedGuildMemberDetail — 회원 관리자가 예외 상태 멤버를 보는 entry.
// - getMyMemberDetail — 본인이 본인 상세를 보는 entry (session.discordId 강제).
// - getAlbionMemberDetail — Discord 미연동 Albion 멤버 상세 (가입 없는 멤버).
//
// 세 entry 모두 같은 killboard 집계 로직을 공유 (lib/member-killboard-aggregation.ts).
//
// 호환성: 옛 임포트는 members-admin.ts 의 re-export 를 거친다.

import { getAdminClient } from '@/lib/supabase-admin'
import { getTranslations } from 'next-intl/server'
import { getSessionGuildId } from '@/lib/tenant'
import { isLocale } from '@/i18n/locales'
import {
  calcOutcomeStats,
  calcParticipationStreak,
  calcSurvivalFromBattles,
} from '@/lib/member-stats'
import {
  fetchMemberBattleParticipationsForMember,
  fetchTrackedBattleWindows,
  groupMemberKillsByBattle,
  mergeMemberBattles,
} from '@/lib/tracked-kills'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getAppSetting } from '@/lib/app-settings'
import { getAccountAlbionIdentityView } from '@/lib/account-albion-identity'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { toPublicMemberActivityDetail, type PublicMemberActivityDetail } from '@/lib/public-member-activity'
import { listMemberPointLedgerEntries } from '@/lib/point-ledger'
import {
  aggregateKillboardRows,
  type KillboardRow,
  type MemberKillEvent,
} from '@/lib/member-killboard-aggregation'
import {
  observedWeaponWindowStart,
  type ObservedWeaponUsage,
} from '@/lib/observed-weapon-usage'
import { loadMemberAchievements } from '@/lib/member-achievements'
import { extractWeaponCategory } from '@/lib/weapon-category'
import { buildMemberVideoProofEntries } from '@/lib/member-video-proofs'
import type { RegearType } from '@/types'
import { isRegearRejectReasonCode } from '@/lib/regear-reject-reasons'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from '@/lib/supabase-pagination'
import { requireLiveSession } from '@/lib/auth'
import {
  isActiveMemberDirectoryState,
  isMemberSubject,
  resolveMemberDetailScopes,
  resolveMemberDirectoryState,
  type MemberDetailScopes,
} from '@/lib/member-profile-access'
import type {
  RoleCount,
  MemberEventEntry,
  MemberRegearEntry,
  MemberExchangeEntry,
  KillboardStats,
  MemberAdvancedStats,
  GuildMemberDetail,
  GuildMemberActivityProfile,
} from '@/app/actions/members-admin'

// Core fetch — assumes caller has already authorized access to discordId.
// Common, managed, and self-only entries all funnel through this so their query
// and DTO privacy boundaries stay in lock-step.
async function fetchMemberDetail(
  discordId: string,
  guildId: string,
  scopes: MemberDetailScopes,
  options: { requireActive?: boolean } = {},
): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const tCommonPromise = getTranslations('common')
  try {
    const db = getAdminClient()

    // avatar 를 먼저 단건 조회 — albion_player_id 를 확보해야 killboard_events
    // 를 albion_player_id 기준으로 조회할 수 있다. (guild_id, discord_id) PK
    // 인덱스라 1 roundtrip 비용은 무시해도 됨.
    //
    // killboard_events 는 (albion_player_id + discord_id IS NOT NULL) 로 조회.
    // discord_id 게이트는 "사이트 가입 이후 발생한 kill" 만 통과시키는 자연
    // 필터 — killboard sync 가 upsert 시 ignoreDuplicates=true 라 가입 전
    // 미연동 sync 된 행은 discord_id=NULL 로 남는다. 리더보드 / 길드 공개
    // 페이지 / 멤버 상세 / 리더보드 집계 모두 동일 정책으로 일치 —
    // "사이트 가입자 + 가입 이후 기록" 만 통계 모집단.
    // (관련 메모: feedback_albion_zvz_stats_membership_policy)
    const [tCommon, bundleSplitsRaw, avatarRes, identityLinkRes] = await Promise.all([
      tCommonPromise,
      getAppSetting('bundle_split_battles_in_stats', 'false', guildId),
      db
        .from('guild_avatars')
        .select(
          'discord_id, username, avatar, albion_player_id, updated_at, preferred_language, withdrawn_at',
        )
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .maybeSingle(),
      db
        .from('account_albion_tenant_links')
        .select('trust_status, revoked_at')
        .eq('guild_id', guildId)
        .eq('discord_id', discordId)
        .maybeSingle(),
    ])
    const bundleSplits = bundleSplitsRaw === 'true'
    if (avatarRes.error) return { detail: null, error: await publicActionError(avatarRes.error, 'actions/members-admin-detail') }
    if (identityLinkRes.error) {
      return {
        detail: null,
        error: await publicActionError(
          identityLinkRes.error,
          'actions/members-admin-detail',
        ),
      }
    }
    const avatar = avatarRes.data
    if (!avatar) return { detail: null }
    const memberState = resolveMemberDirectoryState({
      hasGuildAvatar: true,
      withdrawnAt: avatar.withdrawn_at as string | null,
      identityTrustStatus: identityLinkRes.data?.revoked_at
        ? 'revoked'
        : (identityLinkRes.data?.trust_status as string | null) ?? null,
    })
    if (memberState === 'guest' || memberState === 'unlinked_roster') {
      return { detail: null }
    }
    if (
      options.requireActive !== false &&
      !isActiveMemberDirectoryState(memberState)
    ) {
      return { detail: null }
    }
    const memberAlbionId = (avatar.albion_player_id as string | null) ?? ''

    const [
      slotsRes,
      regearsRes,
      exchangesRes,
      ledgerRes,
      killboardRows,
      trackedBattles,
      participationsByMember,
      accountAlbionIdentity,
      achievements,
    ] = await Promise.all([
      db
        .from('slots')
        .select(
          'role_name, weapon_id, assigned_weapon_id, parties!inner(event_id, events!inner(id, title, created_at, battle_started_at, gather_at, exclude_from_participation_stats))',
        )
        .eq('guild_id', guildId)
        .eq('assigned_discord_id', discordId),
      scopes.regear
        ? db
            .from('regear_requests')
            .select(
              'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, video_proof_url, video_proof_title, status, admin_notes, reject_reason_code, created_at, resolved_at, handled_by_username, events(title)',
            )
            .eq('guild_id', guildId)
            .eq('discord_id', discordId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      scopes.finance
        ? db
            .from('exchange_requests')
            .select(
              'id, silver, status, admin_notes, created_at, resolved_at, handled_by_username',
            )
            .eq('guild_id', guildId)
            .eq('discord_id', discordId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      scopes.finance
        ? listMemberPointLedgerEntries(db, guildId, discordId)
        : Promise.resolve({ rows: [], error: undefined }),
      // killboard_events 는 albion_player_id 가 비어있는 (resolve 전) 멤버에는
      // 행이 없으므로 빈 결과로 안전하게 떨어진다.
      memberAlbionId
        ? selectPagedRowsOrThrow<KillboardRow>({
            label: 'member detail killboard events',
            buildQuery: () =>
              db
                .from('killboard_events')
                .select('event_id, role, fame, item_power, occurred_at, equipment, opponent_name, opponent_guild, opponent_alliance, battle_id')
                .eq('guild_id', guildId)
                .eq('albion_player_id', memberAlbionId)
                .not('discord_id', 'is', null)
                .order('occurred_at', { ascending: true })
                .order('event_id', { ascending: true }) as unknown as SupabasePagedQuery<KillboardRow>,
          })
        : Promise.resolve([]),
      fetchTrackedBattleWindows(db, guildId, null, { bundleSplits }),
      fetchMemberBattleParticipationsForMember(db, guildId, { albionPlayerId: memberAlbionId }),
      getAccountAlbionIdentityView(guildId, discordId),
      loadMemberAchievements(db, guildId, discordId),
    ])

    if (slotsRes.error) return { detail: null, error: await publicActionError(slotsRes.error, 'actions/members-admin-detail') }
    if (regearsRes.error) return { detail: null, error: await publicActionError(regearsRes.error, 'actions/members-admin-detail') }
    if (exchangesRes.error) return { detail: null, error: await publicActionError(exchangesRes.error, 'actions/members-admin-detail') }
    if (ledgerRes.error) return { detail: null, error: ledgerRes.error }
    // killboard_events 는 cron sync 실패·지연 등으로 비어 있을 수 있으므로
    // 오류가 나더라도 상세 페이지 자체를 막지 않고 0 으로 fallback.

    const unassignedRoleLabel = tCommon('unassignedRole')
    const deletedEventLabel = tCommon('deletedEvent')
    // slots 는 더 이상 통계/무기 소스가 아니다 — 통계는 killboard 에서, 무기도
    // killboard.equipment.MainHand 에서. 여기서 slots 는 "스케줄 이벤트 목록" 과
    // role_breakdown 만 뽑는다 (killboard 엔 role 개념이 없음).
    const eventsMap = new Map<string, MemberEventEntry>()
    const roleCounter = new Map<string, number>()
    const plannedWeaponCounter = new Map<
      string,
      { count: number; sampleWeaponId: string | null }
    >()
    type EventShape = {
      id: string
      title: string
      created_at: string
      battle_started_at: string | null
      gather_at: string | null
      exclude_from_participation_stats: boolean | null
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
      if (event.exclude_from_participation_stats === true) continue
      const role = row.role_name ?? unassignedRoleLabel
      roleCounter.set(role, (roleCounter.get(role) ?? 0) + 1)
      const plannedWeaponId =
        (row.assigned_weapon_id as string | null) ??
        (row.weapon_id as string | null) ??
        null
      const plannedCategory = extractWeaponCategory(plannedWeaponId)
      if (plannedCategory) {
        const current = plannedWeaponCounter.get(plannedCategory)
        if (current) {
          current.count += 1
          if (!current.sampleWeaponId && plannedWeaponId) {
            current.sampleWeaponId = plannedWeaponId
          }
        } else {
          plannedWeaponCounter.set(plannedCategory, {
            count: 1,
            sampleWeaponId: plannedWeaponId,
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
    const plannedWeaponCategories = Array.from(plannedWeaponCounter.entries())
      .map(([category, value]) => ({
        category,
        count: value.count,
        sample_weapon_id: value.sampleWeaponId,
      }))
      .sort(
        (left, right) =>
          right.count - left.count || left.category.localeCompare(right.category),
      )

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
        video_proof_url: row.video_proof_url ?? null,
        video_proof_title: row.video_proof_title ?? null,
        status: row.status as MemberRegearEntry['status'],
        admin_notes: row.admin_notes,
        reject_reason_code: isRegearRejectReasonCode(row.reject_reason_code)
          ? row.reject_reason_code
          : null,
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
    for (const row of ledgerRes.rows) {
      balance += row.delta
      if (row.delta > 0) earned += row.delta
      else spent += -row.delta
      if (row.reason === 'admin_adjust') {
        adjustEntries.push({
          kind: 'admin_adjust',
          id: row.id,
          delta: row.delta,
          memo: row.memo,
          created_at: row.createdAt,
          handled_by_username: row.handledByUsername,
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
    //
    // mig 093 부터 participation map 키가 albion_player_id. guild_avatars 의
    // albion_player_id 가 비어 있으면 (Albion 매칭 안 된 Discord 멤버) 빈 맵을
    // 넘겨 0 fallback — 동작은 기존과 동일.
    const memberParticipations = memberAlbionId
      ? participationsByMember.byAlbionPlayerId.get(memberAlbionId)
      : undefined
    const rows = killboardRows
    const killBattles = groupMemberKillsByBattle(rows, trackedBattles)
    const battles = mergeMemberBattles(killBattles, memberParticipations, trackedBattles)

    const killboard: KillboardStats = { kills: 0, deaths: 0, kill_fame: 0, death_fame: 0 }
    for (const b of battles) {
      killboard.kills += b.killCount
      killboard.deaths += b.deathCount
    }

    // killboard_events 의 fame / weapon / kill_history 는 한 번에 집계.
    // 창 밖 row (1:1 갱킹 등) 는 isWithinTrackedWindow 로 제외 — battles 와 동일 기준.
    // 무기 집계 키는 extractWeaponCategory 결과 (티어/인챈트/품질/아티팩트 변형을
    // 모두 하나로 묶음). 카운트는 1전투당 1회 — battleKey 단위 Set.
    const agg = aggregateKillboardRows(rows, trackedBattles, {
      memberId: memberAlbionId,
      observedWeaponWindowStart: observedWeaponWindowStart(),
    })
    killboard.kill_fame = agg.killFame
    killboard.death_fame = agg.deathFame

    // 생존률/스트릭/승패: 전부 공식 참여 battles 배열에서 파생. 이 값은 관측
    // 기록을 설명할 뿐 역할 간 실력 비교나 회원 종합 평가에 사용하지 않는다.
    const survival = calcSurvivalFromBattles(
      battles.map((b) => ({ startedAt: b.startedAt, hadDeath: b.hadDeath })),
    )
    const tz = await getTenantTimezone(guildId)
    const participationStreak = calcParticipationStreak(
      battles.map((b) => b.startedAt),
      Date.now(),
      tz,
    )
    const outcomeStats = calcOutcomeStats(battles.map((b) => b.outcome))

    const advancedStats: MemberAdvancedStats = {
      survival_rate: survival.survivalRate,
      evaluated_events: survival.evaluatedEvents,
      participation_current_streak: participationStreak.currentStreak,
      participation_longest_streak: participationStreak.longestStreak,
      deathless_current_streak: survival.currentDeathlessStreak,
      deathless_longest_streak: survival.longestDeathlessStreak,
      wins: outcomeStats.wins,
      losses: outcomeStats.losses,
      win_rate: outcomeStats.winRate,
      evaluated_outcome_events: outcomeStats.evaluatedEvents,
    }

    const activityProfile: GuildMemberActivityProfile = {
      discord_id: avatar.discord_id,
      username: avatar.username,
      avatar: avatar.avatar,
      updated_at: avatar.updated_at,
      preferred_language: isLocale(avatar.preferred_language)
        ? avatar.preferred_language
        : null,
      member_state: memberState,
      albion_identity: accountAlbionIdentity
        ? {
            server: accountAlbionIdentity.server,
            nickname: accountAlbionIdentity.nickname,
            currentGuildName: accountAlbionIdentity.currentGuildName,
            currentAllianceName: accountAlbionIdentity.currentAllianceName,
          }
        : null,
      participation_count: battles.length,
      role_breakdown: roleBreakdown,
      planned_weapon_categories: plannedWeaponCategories,
      observed_weapon_usage: agg.observedWeaponUsage,
      achievements,
      events,
      killboard,
      advanced_stats: advancedStats,
      kill_history: agg.killHistory,
    }

    return {
      detail: {
        ...activityProfile,
        ...(scopes.finance
          ? {
              finance: {
                exchanges,
                balance,
                lifetime_earned: earned,
                lifetime_spent: spent,
              },
            }
          : {}),
        ...(scopes.regear
          ? {
              regear: {
                regears,
                video_proofs: buildMemberVideoProofEntries(regears),
              },
            }
          : {}),
        ...(scopes.identityOperations && accountAlbionIdentity
          ? { identity_operations: accountAlbionIdentity }
          : {}),
      },
    }
  } catch (e) {
    return {
      detail: null,
      error: await publicActionError(e, 'actions/members-admin-detail'),
    }
  }
}

export async function getGuildMemberDetail(discordId: string): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  if (!isMemberSubject(discordId)) {
    return { detail: null, error: await publicActionMessage('invalidInput') }
  }
  const session = await requireLiveSession().catch(() => null)
  if (!session) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }
  const scopes = resolveMemberDetailScopes({
    viewerDiscordId: session.discordId,
    targetDiscordId: discordId,
    isMember: session.isMember,
    isAdmin: session.isAdmin,
    capabilities: session.capabilities,
  })
  if (!scopes.activity) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }
  const guildId = await getSessionGuildId(session)
  return fetchMemberDetail(discordId, guildId, scopes)
}

export async function getManagedGuildMemberDetail(discordId: string): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  if (!isMemberSubject(discordId)) {
    return { detail: null, error: await publicActionMessage('invalidInput') }
  }
  const session = await requireLiveSession().catch(() => null)
  if (!session) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }
  const scopes = resolveMemberDetailScopes({
    viewerDiscordId: session.discordId,
    targetDiscordId: discordId,
    isMember: session.isMember,
    isAdmin: session.isAdmin,
    capabilities: session.capabilities,
  })
  if (!scopes.memberOperations) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }
  const guildId = await getSessionGuildId(session)
  return fetchMemberDetail(discordId, guildId, scopes, { requireActive: false })
}

// Self-serve variant: logged-in members read their own detail.
// The session's discord_id is always used — a user cannot pass in another ID.
export async function getMyMemberDetail(): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const session = await requireLiveSession().catch(() => null)
  if (!session) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }
  const guildId = await getSessionGuildId(session)
  return fetchMemberDetail(
    session.discordId,
    guildId,
    resolveMemberDetailScopes({
      viewerDiscordId: session.discordId,
      targetDiscordId: session.discordId,
      isMember: session.isMember,
      isAdmin: session.isAdmin,
      capabilities: session.capabilities,
    }),
  )
}

// Self-only variant for the account activity page. It allows reading another
// guild's record only when this Discord account has an active tenant link for
// that guild. This keeps global "My info" drill-down private to the owner.
export async function getMyMemberDetailForGuild(targetGuildId: string): Promise<{
  detail: GuildMemberDetail | null
  error?: string
}> {
  const session = await requireLiveSession().catch(() => null)
  if (!session) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }
  if (!session.isMember) {
    return { detail: null, error: await publicActionMessage('unauthorized') }
  }

  const currentGuildId = await getSessionGuildId(session)
  if (targetGuildId !== currentGuildId) {
    const db = getAdminClient()
    const { data, error } = await db
      .from('account_albion_tenant_links')
      .select('guild_id')
      .eq('guild_id', targetGuildId)
      .eq('discord_id', session.discordId)
      .is('revoked_at', null)
      .maybeSingle()

    if (error) return { detail: null, error: await publicActionError(error, 'actions/members-admin-detail') }
    if (!data) return { detail: null }
  }

  return fetchMemberDetail(
    session.discordId,
    targetGuildId,
    resolveMemberDetailScopes({
      viewerDiscordId: session.discordId,
      targetDiscordId: session.discordId,
      isMember: session.isMember,
      isAdmin: session.isAdmin,
      capabilities: session.capabilities,
    }),
  )
}

export async function getPublicMemberActivityByToken(token: string): Promise<{
  detail: PublicMemberActivityDetail | null
  guildName: string | null
  error?: string
}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return { detail: null, guildName: null }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('account_albion_tenant_links')
    .select('guild_id, discord_id, public_leaderboard_enabled, tenants(slug, name)')
    .eq('public_activity_token', token)
    .eq('public_activity_enabled', true)
    .is('revoked_at', null)
    .maybeSingle()

  if (error) return { detail: null, guildName: null, error: await publicActionError(error, 'actions/members-admin-detail') }
  if (!data) return { detail: null, guildName: null }

  const guildId = data.guild_id as string
  const tenant = Array.isArray(data.tenants) ? data.tenants[0] : data.tenants
  const slug = (tenant?.slug as string | null) ?? ''
  const name = (tenant?.name as string | null) ?? ''
  const result = await fetchMemberDetail(
    data.discord_id as string,
    guildId,
    {
      activity: true,
      finance: false,
      regear: false,
      compliance: false,
      memberOperations: false,
      identityOperations: false,
    },
  )

  const publicDetail = result.detail
    ? toPublicMemberActivityDetail(result.detail, {
        includeAchievements: data.public_leaderboard_enabled === true,
      })
    : null

  return {
    detail: publicDetail?.displayName ? publicDetail : null,
    guildName: displayNameFromSlug(slug) || name || guildId,
    error: result.error,
  }
}

// Discord 미연동 Albion 멤버 상세. albion_guild_members + killboard_events
// (albion_player_id 매칭) 만으로 구성되는 슬림한 통계 뷰. Discord 의존 항목
// (slot 참여 이벤트, 리기어, 환전, 포인트, 리더보드, preferred_language, role_breakdown)
// 은 모두 빠진다 — 가입 자체가 없는 멤버이므로 표시할 데이터가 없다.
//
// 현재는 관측 사실(킬/데스/페임/참가/생존/승패)만 노출하며, 이 데이터로
// 미가입 회원의 순위나 종합 평가를 만들지 않는다.
export interface AlbionMemberDetail {
  albion_player_id: string
  albion_player_name: string
  albion_server: 'west' | 'east' | 'europe'
  albion_guild_name: string
  // 가입 시점은 first_seen_at (Albion 길드 sync 가 이 멤버를 처음 본 시각).
  first_seen_at: string
  last_seen_at: string
  // gameinfo 응답의 누적 명성 — sync 시점 스냅샷. 길드 진입 전 수치까지 포함되므로
  // 길드 활동 통계와는 별도로 보여준다.
  lifetime_kill_fame: number
  lifetime_death_fame: number
  average_item_power: number
  // 길드 활동 한정 통계. trackedWindows 안의 killboard 만으로 집계.
  participation_count: number
  killboard: KillboardStats
  observed_weapon_usage: ObservedWeaponUsage
  kill_history: MemberKillEvent[]
  advanced_stats: Pick<
    MemberAdvancedStats,
    | 'survival_rate'
    | 'evaluated_events'
    | 'participation_current_streak'
    | 'participation_longest_streak'
    | 'deathless_current_streak'
    | 'deathless_longest_streak'
    | 'wins'
    | 'losses'
    | 'win_rate'
    | 'evaluated_outcome_events'
  >
}

function isAlbionPlayerId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  )
}

export async function getAlbionMemberDetail(albionPlayerId: string): Promise<{
  detail: AlbionMemberDetail | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!isAlbionPlayerId(albionPlayerId)) {
      return { detail: null, error: await publicActionMessage('invalidInput') }
    }
    const session = await requireLiveSession().catch(() => null)
    if (!session) return { detail: null, error: tErr('unauthorized') }
    const scopes = resolveMemberDetailScopes({
      viewerDiscordId: session.discordId,
      targetDiscordId: '',
      isMember: session.isMember,
      isAdmin: session.isAdmin,
      capabilities: session.capabilities,
    })
    if (!scopes.memberOperations) {
      return { detail: null, error: tErr('unauthorized') }
    }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const bundleSplits =
      (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

    const [rosterRes, killboardRows, trackedBattles, participationsByMember] = await Promise.all([
      db
        .from('albion_guild_members')
        .select(
          'albion_player_id, albion_player_name, albion_server, albion_guild_name, first_seen_at, last_seen_at, kill_fame, death_fame, average_item_power, left_at',
        )
        .eq('guild_id', guildId)
        .eq('albion_player_id', albionPlayerId)
        .maybeSingle(),
      selectPagedRowsOrThrow<KillboardRow>({
        label: 'albion member detail killboard events',
        buildQuery: () =>
          db
            .from('killboard_events')
            .select('event_id, role, fame, item_power, occurred_at, equipment, opponent_name, opponent_guild, opponent_alliance, battle_id')
            .eq('guild_id', guildId)
            .eq('albion_player_id', albionPlayerId)
            .order('occurred_at', { ascending: true })
            .order('event_id', { ascending: true }) as unknown as SupabasePagedQuery<KillboardRow>,
      }),
      fetchTrackedBattleWindows(db, guildId, null, { bundleSplits }),
      fetchMemberBattleParticipationsForMember(db, guildId, { albionPlayerId }),
    ])

    if (rosterRes.error) return { detail: null, error: await publicActionError(rosterRes.error, 'actions/members-admin-detail') }
    const roster = rosterRes.data
    // 활성 행이 없으면 (탈퇴했거나 다른 길드) 상세는 안 보여준다 — 노이즈 차단.
    if (!roster || roster.left_at) return { detail: null }

    const rows = killboardRows

    // killboard 기반 배틀 + raw_battle.players 기반 0k0d 참여 (mig 093 부터
    // albion_player_id 키) 합집합. 미연동 멤버도 0K0D 참여 (탱커/힐러) 까지
    // participation 으로 잡힘.
    const killBattles = groupMemberKillsByBattle(rows, trackedBattles)
    const battles = mergeMemberBattles(
      killBattles,
      participationsByMember.byAlbionPlayerId.get(albionPlayerId),
      trackedBattles,
    )

    const killboard: KillboardStats = { kills: 0, deaths: 0, kill_fame: 0, death_fame: 0 }
    for (const b of battles) {
      killboard.kills += b.killCount
      killboard.deaths += b.deathCount
    }

    const agg = aggregateKillboardRows(rows, trackedBattles, {
      memberId: albionPlayerId,
      observedWeaponWindowStart: observedWeaponWindowStart(),
    })
    killboard.kill_fame = agg.killFame
    killboard.death_fame = agg.deathFame

    const survival = calcSurvivalFromBattles(
      battles.map((b) => ({ startedAt: b.startedAt, hadDeath: b.hadDeath })),
    )
    const tz = await getTenantTimezone(guildId)
    const participationStreak = calcParticipationStreak(
      battles.map((b) => b.startedAt),
      Date.now(),
      tz,
    )
    const outcomeStats = calcOutcomeStats(battles.map((b) => b.outcome))

    return {
      detail: {
        albion_player_id: roster.albion_player_id as string,
        albion_player_name: roster.albion_player_name as string,
        albion_server: roster.albion_server as 'west' | 'east' | 'europe',
        albion_guild_name: roster.albion_guild_name as string,
        first_seen_at: roster.first_seen_at as string,
        last_seen_at: roster.last_seen_at as string,
        lifetime_kill_fame: Number(roster.kill_fame ?? 0),
        lifetime_death_fame: Number(roster.death_fame ?? 0),
        average_item_power: Number(roster.average_item_power ?? 0),
        participation_count: battles.length,
        killboard,
        observed_weapon_usage: agg.observedWeaponUsage,
        kill_history: agg.killHistory,
        advanced_stats: {
          survival_rate: survival.survivalRate,
          evaluated_events: survival.evaluatedEvents,
          participation_current_streak: participationStreak.currentStreak,
          participation_longest_streak: participationStreak.longestStreak,
          deathless_current_streak: survival.currentDeathlessStreak,
          deathless_longest_streak: survival.longestDeathlessStreak,
          wins: outcomeStats.wins,
          losses: outcomeStats.losses,
          win_rate: outcomeStats.winRate,
          evaluated_outcome_events: outcomeStats.evaluatedEvents,
        },
      },
    }
  } catch (e) {
    return { detail: null, error: await publicActionError(e, 'actions/members-admin-detail') }
  }
}
