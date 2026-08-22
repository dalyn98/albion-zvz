import 'server-only'

import {
  buildOperationsQueueRows,
  resolveAdminEventLifecycleState,
  selectAdminEventLifecycleCandidates,
  summarizeRecruitmentReadiness,
  summarizeEventReadiness,
  type AdminEventLifecycleState,
  type EventReadinessSummary,
  type OperationsQueueRow,
  type RecruitmentReadinessSummary,
} from './admin-operations-model'
import { loadAdminWorkQueueSnapshot } from './admin-work-queue-server'
import {
  isRecognizedAlbionIdentity,
  normalizeAlbionIdentityRelation,
  normalizeAlbionIdentityTrustStatus,
} from './albion-verification-status'
import { log } from './log'
import { getAdminClient } from './supabase-admin'
import { loadGuildWeeklyStats, type GuildWeeklyStats } from './guild-weekly-stats'
import { listMatchingAlbionResourceExceptionDiscordIds } from './albion-identity-resource-exception'

const SETTINGS_KEYS = [
  'albion_home_guild_id',
  'auto_regear_enabled',
  'last_killboard_sync_at',
  'last_battle_tracker_sync_at',
  'last_member_sync_at',
  'last_auto_regear_at',
  'guild_profile_enabled',
  'guild_profile_recruitment_status',
  'guild_profile_discord_invite_url',
  'guild_profile_recruiting_roles',
  'guild_profile_join_steps',
] as const

const PAGE_SIZE = 1000
const UPCOMING_EVENT_LIMIT = 3
const EVENT_CLOSEOUT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000

interface ActiveMemberIdentityRow {
  discord_id: string
  albion_verified_at: string | null
}

interface TenantLinkIdentityRow {
  discord_id: string
  relation: string | null
  trust_status: string | null
}

interface UpcomingEventRow {
  id: string
  title: string
  gather_at: string | null
  battle_started_at: string | null
  operational_ended_at: string | null
  participation_closeout_required: boolean
}

interface EventPartyRow {
  event_id: string
  slots:
    | Array<{
        id: string
        assigned_discord_id: string | null
        is_hidden: boolean | null
      }>
    | null
}

export interface AdminEventReadinessSnapshot {
  id: string
  title: string
  gatherAt: string | null
  battleStartedAt: string | null
  operationalEndedAt: string | null
  lifecycleState: AdminEventLifecycleState
  readiness: EventReadinessSummary
}

export interface AdminOperationsSnapshot {
  pendingTotal: number
  queueRows: OperationsQueueRow[]
  upcomingEvents: AdminEventReadinessSnapshot[]
  draftEvents: number
  activeMembers: number
  unverifiedMembers: number
  staleSyncCount: number
  autoRegearEnabled: boolean
  weeklyStats: GuildWeeklyStats
  recruitmentReadiness: RecruitmentReadinessSummary
}

function minutesSince(
  iso: string | null | undefined,
  nowMs: number,
): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.floor((nowMs - ms) / 60_000))
}

function isFresh(
  iso: string | null | undefined,
  nowMs: number,
  maxAgeMinutes: number,
): boolean {
  const age = minutesSince(iso, nowMs)
  return age !== null && age <= maxAgeMinutes
}

function hasRecognizedAlbionIdentity(
  member: ActiveMemberIdentityRow,
  link: TenantLinkIdentityRow | undefined,
  resourceAccessOverride: boolean,
): boolean {
  if (link) {
    return isRecognizedAlbionIdentity({
      relation: normalizeAlbionIdentityRelation(link.relation),
      trustStatus: normalizeAlbionIdentityTrustStatus(link.trust_status),
      resourceAccessOverride,
    })
  }
  return Boolean(member.albion_verified_at)
}

async function listActiveMemberIdentityRows(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
): Promise<ActiveMemberIdentityRow[]> {
  const rows: ActiveMemberIdentityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('guild_avatars')
      .select('discord_id, albion_verified_at')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .order('discord_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      log.error('[admin-operations] active member lookup failed', error, {
        guildId,
        from,
      })
      return rows
    }
    const page = (data ?? []) as ActiveMemberIdentityRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function listTenantLinkIdentityRows(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
): Promise<TenantLinkIdentityRow[]> {
  const rows: TenantLinkIdentityRow[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('account_albion_tenant_links')
      .select('discord_id, relation, trust_status')
      .eq('guild_id', guildId)
      .order('discord_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) {
      log.error('[admin-operations] tenant identity lookup failed', error, {
        guildId,
        from,
      })
      return rows
    }
    const page = (data ?? []) as TenantLinkIdentityRow[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function buildQueueRows(
  snapshot: Awaited<ReturnType<typeof loadAdminWorkQueueSnapshot>>,
  nowMs: number,
): OperationsQueueRow[] {
  return buildOperationsQueueRows(snapshot.items, nowMs)
}

async function buildUpcomingEventSnapshots(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  events: UpcomingEventRow[],
  nowMs: number,
): Promise<AdminEventReadinessSnapshot[]> {
  if (events.length === 0) return []

  const eventIds = events.map((event) => event.id)
  const readinessByEventId = await loadEventReadinessMapWithClient(
    db,
    guildId,
    eventIds,
  )

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    gatherAt: event.gather_at,
    battleStartedAt: event.battle_started_at,
    operationalEndedAt: event.operational_ended_at,
    lifecycleState: resolveAdminEventLifecycleState({
      id: event.id,
      gatherAt: event.gather_at,
      battleStartedAt: event.battle_started_at,
      operationalEndedAt: event.operational_ended_at,
    }, nowMs),
    readiness:
      readinessByEventId[event.id] ??
      summarizeEventReadiness({ totalSlots: 0, assignedSlots: 0 }),
  }))
}

async function loadEventReadinessMapWithClient(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  eventIds: string[],
): Promise<Record<string, EventReadinessSummary>> {
  if (eventIds.length === 0) return {}

  const { data, error } = await db
    .from('parties')
    .select('event_id, slots(id, assigned_discord_id, is_hidden)')
    .eq('guild_id', guildId)
    .in('event_id', eventIds)

  if (error) {
    log.error('[admin-operations] event readiness lookup failed', error, {
      guildId,
      eventCount: eventIds.length,
    })
  }

  const countByEvent = new Map<
    string,
    { totalSlots: number; assignedSlots: number }
  >()
  for (const party of (data ?? []) as EventPartyRow[]) {
    const current = countByEvent.get(party.event_id) ?? {
      totalSlots: 0,
      assignedSlots: 0,
    }
    const visibleSlots = (party.slots ?? []).filter((slot) => !slot.is_hidden)
    countByEvent.set(party.event_id, {
      totalSlots: current.totalSlots + visibleSlots.length,
      assignedSlots:
        current.assignedSlots +
        visibleSlots.filter((slot) => Boolean(slot.assigned_discord_id)).length,
    })
  }

  return Object.fromEntries(
    eventIds.map((eventId) => [
      eventId,
      summarizeEventReadiness(
        countByEvent.get(eventId) ?? { totalSlots: 0, assignedSlots: 0 },
      ),
    ]),
  )
}

export async function loadAdminEventReadinessMap(
  guildId: string,
  eventIds: string[],
): Promise<Record<string, EventReadinessSummary>> {
  return loadEventReadinessMapWithClient(getAdminClient(), guildId, eventIds)
}

export async function loadAdminOperationsSnapshot(
  guildId: string,
): Promise<AdminOperationsSnapshot> {
  const db = getAdminClient()
  const nowMs = Date.now()
  const nowIso = new Date(nowMs).toISOString()
  const recentOperationalCutoffIso = new Date(
    nowMs - EVENT_CLOSEOUT_LOOKBACK_MS,
  ).toISOString()

  const [
    workQueueSnapshot,
    settingsResult,
    upcomingEventsResult,
    operationalEventsResult,
    draftEventsResult,
    activeMembers,
    identityLinks,
    weeklyStats,
  ] = await Promise.all([
    loadAdminWorkQueueSnapshot(guildId),
    db
      .from('app_settings')
      .select('key, value')
      .eq('guild_id', guildId)
      .in('key', [...SETTINGS_KEYS]),
    db
      .from('events')
      .select('id, title, gather_at, battle_started_at, operational_ended_at, participation_closeout_required')
      .eq('guild_id', guildId)
      .eq('status', 'published')
      .is('battle_started_at', null)
      .gte('gather_at', nowIso)
      .order('gather_at', { ascending: true })
      .limit(UPCOMING_EVENT_LIMIT),
    db
      .from('events')
      .select('id, title, gather_at, battle_started_at, operational_ended_at, participation_closeout_required')
      .eq('guild_id', guildId)
      .eq('status', 'published')
      .not('battle_started_at', 'is', null)
      .gte('operational_ended_at', recentOperationalCutoffIso)
      .order('operational_ended_at', { ascending: false })
      .limit(UPCOMING_EVENT_LIMIT * 2),
    db
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('status', 'draft'),
    listActiveMemberIdentityRows(db, guildId),
    listTenantLinkIdentityRows(db, guildId),
    loadGuildWeeklyStats(guildId),
  ])

  if (settingsResult.error) {
    log.error('[admin-operations] sync settings lookup failed', settingsResult.error, {
      guildId,
    })
  }
  if (upcomingEventsResult.error) {
    log.error('[admin-operations] upcoming event lookup failed', upcomingEventsResult.error, {
      guildId,
    })
  }
  if (operationalEventsResult.error) {
    log.error('[admin-operations] operational event lookup failed', operationalEventsResult.error, {
      guildId,
    })
  }
  if (draftEventsResult.error) {
    log.error('[admin-operations] draft event lookup failed', draftEventsResult.error, {
      guildId,
    })
  }

  const operationalEvents = (operationalEventsResult.data ?? []) as UpcomingEventRow[]
  const closeoutRequiredEndedIds = operationalEvents
    .filter((event) =>
      event.participation_closeout_required === true &&
      resolveAdminEventLifecycleState({
        id: event.id,
        gatherAt: event.gather_at,
        battleStartedAt: event.battle_started_at,
        operationalEndedAt: event.operational_ended_at,
      }, nowMs) === 'closeout')
    .map((event) => event.id)
  const finalizedCloseoutEventIds = new Set<string>()
  if (closeoutRequiredEndedIds.length > 0) {
    const { data: closeouts, error: closeoutsError } = await db
      .from('event_participation_closeouts')
      .select('event_id')
      .eq('guild_id', guildId)
      .in('event_id', closeoutRequiredEndedIds)
    if (closeoutsError) {
      log.error('[admin-operations] event closeout lookup failed', closeoutsError, {
        guildId,
        eventCount: closeoutRequiredEndedIds.length,
      })
    }
    for (const closeout of closeouts ?? []) {
      finalizedCloseoutEventIds.add(closeout.event_id as string)
    }
  }

  const eventCandidatesById = new Map<string, UpcomingEventRow>()
  for (const event of [
    ...operationalEvents.filter((event) => !finalizedCloseoutEventIds.has(event.id)),
    ...((upcomingEventsResult.data ?? []) as UpcomingEventRow[]),
  ]) {
    eventCandidatesById.set(event.id, event)
  }
  const upcomingEvents = selectAdminEventLifecycleCandidates(
    [...eventCandidatesById.values()].map((event) => ({
      ...event,
      gatherAt: event.gather_at,
      battleStartedAt: event.battle_started_at,
      operationalEndedAt: event.operational_ended_at,
    })),
    nowMs,
    UPCOMING_EVENT_LIMIT,
  )
  const queueRows = buildQueueRows(workQueueSnapshot, nowMs)
  const upcomingEventSnapshots = await buildUpcomingEventSnapshots(
    db,
    guildId,
    upcomingEvents,
    nowMs,
  )

  const settingMap = new Map(
    (settingsResult.data ?? []).map((row) => [
      row.key as string,
      (row.value as string | null) ?? '',
    ]),
  )
  const homeGuildId = settingMap.get('albion_home_guild_id')?.trim() ?? ''
  const autoRegearEnabled = settingMap.get('auto_regear_enabled') === 'true'
  const staleSyncCount = [
    !homeGuildId ||
      isFresh(settingMap.get('last_killboard_sync_at'), nowMs, 90),
    !homeGuildId ||
      isFresh(settingMap.get('last_battle_tracker_sync_at'), nowMs, 30),
    isFresh(settingMap.get('last_member_sync_at'), nowMs, 30 * 60),
    !autoRegearEnabled ||
      isFresh(settingMap.get('last_auto_regear_at'), nowMs, 90),
  ].filter((isHealthy) => !isHealthy).length

  const identityLinkMap = new Map(
    identityLinks.map((link) => [link.discord_id, link]),
  )
  const resourceExceptionDiscordIds =
    await listMatchingAlbionResourceExceptionDiscordIds({
      guildId,
      discordIds: activeMembers.map((member) => member.discord_id),
      db,
    })
  const unverifiedMembers = activeMembers.filter(
    (member) =>
      !hasRecognizedAlbionIdentity(
        member,
        identityLinkMap.get(member.discord_id),
        resourceExceptionDiscordIds.has(member.discord_id),
      ),
  ).length
  const recruitmentStatusRaw = settingMap.get(
    'guild_profile_recruitment_status',
  )
  const recruitmentStatus =
    recruitmentStatusRaw === 'open' || recruitmentStatusRaw === 'selective'
      ? recruitmentStatusRaw
      : 'closed'
  const recruitmentReadiness = summarizeRecruitmentReadiness({
    profileEnabled: settingMap.get('guild_profile_enabled') === 'true',
    recruitmentStatus,
    discordInviteUrl:
      settingMap.get('guild_profile_discord_invite_url') ?? '',
    recruitingRoles: settingMap.get('guild_profile_recruiting_roles') ?? '',
    joinSteps: settingMap.get('guild_profile_join_steps') ?? '',
  })

  return {
    pendingTotal: workQueueSnapshot.total,
    queueRows,
    upcomingEvents: upcomingEventSnapshots,
    draftEvents: draftEventsResult.count ?? 0,
    activeMembers: activeMembers.length,
    unverifiedMembers,
    staleSyncCount,
    autoRegearEnabled,
    weeklyStats,
    recruitmentReadiness,
  }
}
