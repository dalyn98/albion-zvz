import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'

export const TENANT_ONBOARDING_EVENT_TYPES = [
  'bot_installed',
  'setup_step_saved',
  'setup_completed',
  'admin_dashboard_viewed',
  'member_invite_copied',
  'test_announcement_sent',
  'first_event_created',
  'first_event_published',
  'first_event_notification_sent',
] as const

export type TenantOnboardingEventType = (typeof TENANT_ONBOARDING_EVENT_TYPES)[number]

export const TENANT_ONBOARDING_PROGRESS_KEYS = [
  'botInstalled',
  'setupCompleted',
  'adminDashboardViewed',
  'memberInviteCopied',
  'testAnnouncementSent',
  'firstEventCreated',
  'firstEventPublished',
  'firstEventNotificationSent',
] as const

export type TenantOnboardingProgressKey = (typeof TENANT_ONBOARDING_PROGRESS_KEYS)[number]

// 초대 링크 공유와 테스트 공지는 유용하지만 길드가 실제 운영을 시작하는 데
// 필수 조건은 아니다. 대시보드 Launch Plan은 이 핵심 단계만 완료 기준으로 쓴다.
export const TENANT_LAUNCH_PLAN_PROGRESS_KEYS = [
  'botInstalled',
  'setupCompleted',
  'firstEventCreated',
  'firstEventPublished',
  'firstEventNotificationSent',
] as const satisfies readonly TenantOnboardingProgressKey[]

export type TenantOnboardingNextActionKey =
  | 'install_bot'
  | 'open_setup_wizard'
  | 'configure_discord_channel'
  | 'copy_member_invite'
  | 'send_test_announcement'
  | 'create_first_event'
  | 'publish_first_event'
  | 'send_event_notification'
  | 'done'

export type TenantOnboardingDiagnosisKey =
  | 'bot_not_installed'
  | 'setup_incomplete'
  | 'event_channel_missing'
  | 'discord_test_not_sent'
  | 'first_event_missing'
  | 'first_event_unpublished'
  | 'event_notification_missing'
  | 'complete'

export interface TenantOnboardingEvent {
  id?: string
  eventType: TenantOnboardingEventType
  actorDiscordId?: string | null
  details?: Record<string, unknown>
  createdAt: string
}

export interface TenantOnboardingTenantState {
  id: string
  status: string | null
  botInstalled: boolean
  eventChannelId: string | null
}

export interface TenantOnboardingNextAction {
  key: TenantOnboardingNextActionKey
  href: string
}

export interface TenantOnboardingDiagnosis {
  key: TenantOnboardingDiagnosisKey
  severity: 'ok' | 'info' | 'warning' | 'critical'
}

export interface TenantOnboardingSummary {
  tenantId: string
  completed: Record<TenantOnboardingProgressKey, boolean>
  completedStepCount: number
  totalStepCount: number
  latestEventAt: string | null
  nextAction: TenantOnboardingNextAction
  diagnoses: TenantOnboardingDiagnosis[]
  recentEvents: TenantOnboardingEvent[]
}

export interface SummarizeTenantOnboardingEventsInput {
  tenant: TenantOnboardingTenantState
  events: TenantOnboardingEvent[]
  completedEventTypes?: TenantOnboardingEventType[]
}

export function isTenantLaunchPlanActive(summary: TenantOnboardingSummary): boolean {
  return !summary.completed.firstEventPublished || !summary.completed.firstEventNotificationSent
}

export interface LogTenantOnboardingEventInput {
  guildId: string
  actorDiscordId?: string | null
  eventType: TenantOnboardingEventType
  details?: Record<string, unknown>
}

const EVENT_TYPE_SET = new Set<string>(TENANT_ONBOARDING_EVENT_TYPES)

const EVENT_TYPE_BY_PROGRESS_KEY: Record<TenantOnboardingProgressKey, TenantOnboardingEventType> = {
  botInstalled: 'bot_installed',
  setupCompleted: 'setup_completed',
  adminDashboardViewed: 'admin_dashboard_viewed',
  memberInviteCopied: 'member_invite_copied',
  testAnnouncementSent: 'test_announcement_sent',
  firstEventCreated: 'first_event_created',
  firstEventPublished: 'first_event_published',
  firstEventNotificationSent: 'first_event_notification_sent',
}

export function isTenantOnboardingEventType(value: unknown): value is TenantOnboardingEventType {
  return typeof value === 'string' && EVENT_TYPE_SET.has(value)
}

function sortEventsDesc(events: TenantOnboardingEvent[]): TenantOnboardingEvent[] {
  return [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function resolveNextAction(
  tenant: TenantOnboardingTenantState,
  completed: Record<TenantOnboardingProgressKey, boolean>,
): TenantOnboardingNextAction {
  if (!completed.botInstalled) return { key: 'install_bot', href: '/onboard' }
  if (!completed.setupCompleted) {
    return { key: 'open_setup_wizard', href: `/onboard/setup/${tenant.id}` }
  }
  if (!tenant.eventChannelId) {
    return { key: 'configure_discord_channel', href: '/admin/dashboard/settings?tab=events' }
  }
  if (!completed.firstEventCreated) {
    return { key: 'create_first_event', href: '/admin/dashboard/events/new' }
  }
  if (!completed.firstEventPublished) {
    return { key: 'publish_first_event', href: '/admin/dashboard' }
  }
  if (!completed.firstEventNotificationSent) {
    return { key: 'send_event_notification', href: '/admin/dashboard' }
  }
  return { key: 'done', href: '/admin/dashboard/guide' }
}

function diagnose(
  tenant: TenantOnboardingTenantState,
  completed: Record<TenantOnboardingProgressKey, boolean>,
): TenantOnboardingDiagnosis[] {
  const diagnoses: TenantOnboardingDiagnosis[] = []
  if (!completed.botInstalled) {
    diagnoses.push({ key: 'bot_not_installed', severity: 'critical' })
  }
  if (completed.botInstalled && !completed.setupCompleted) {
    diagnoses.push({ key: 'setup_incomplete', severity: 'critical' })
  }
  if (completed.setupCompleted && !tenant.eventChannelId) {
    diagnoses.push({ key: 'event_channel_missing', severity: 'warning' })
  }
  if (completed.setupCompleted && !completed.firstEventCreated) {
    diagnoses.push({ key: 'first_event_missing', severity: 'info' })
  }
  if (completed.firstEventCreated && !completed.firstEventPublished) {
    diagnoses.push({ key: 'first_event_unpublished', severity: 'warning' })
  }
  if (
    completed.firstEventPublished &&
    tenant.eventChannelId &&
    !completed.firstEventNotificationSent
  ) {
    diagnoses.push({ key: 'event_notification_missing', severity: 'warning' })
  }
  if (diagnoses.length === 0) diagnoses.push({ key: 'complete', severity: 'ok' })
  return diagnoses
}

export function summarizeTenantOnboardingEvents(
  input: SummarizeTenantOnboardingEventsInput,
): TenantOnboardingSummary {
  const sortedEvents = sortEventsDesc(input.events)
  const completedEventTypes = new Set([
    ...sortedEvents.map((event) => event.eventType),
    ...(input.completedEventTypes ?? []),
  ])
  const completed = Object.fromEntries(
    TENANT_ONBOARDING_PROGRESS_KEYS.map((key) => [
      key,
      completedEventTypes.has(EVENT_TYPE_BY_PROGRESS_KEY[key]),
    ]),
  ) as Record<TenantOnboardingProgressKey, boolean>

  completed.botInstalled = completed.botInstalled || input.tenant.botInstalled
  completed.setupCompleted = completed.setupCompleted || input.tenant.status === 'active'

  const completedStepCount = TENANT_ONBOARDING_PROGRESS_KEYS.reduce(
    (count, key) => count + (completed[key] ? 1 : 0),
    0,
  )

  return {
    tenantId: input.tenant.id,
    completed,
    completedStepCount,
    totalStepCount: TENANT_ONBOARDING_PROGRESS_KEYS.length,
    latestEventAt: sortedEvents[0]?.createdAt ?? null,
    nextAction: resolveNextAction(input.tenant, completed),
    diagnoses: diagnose(input.tenant, completed),
    recentEvents: sortedEvents,
  }
}

export async function logTenantOnboardingEvent(
  input: LogTenantOnboardingEventInput,
): Promise<{ ok: boolean }> {
  try {
    const db = getAdminClient()
    const { error } = await db.from('tenant_onboarding_events').insert({
      guild_id: input.guildId,
      actor_discord_id: input.actorDiscordId ?? null,
      event_type: input.eventType,
      details: input.details ?? {},
    })
    if (error) {
      log.error('[tenant-onboarding] event insert failed', error, {
        tenant_id: input.guildId,
        event_type: input.eventType,
      })
      return { ok: false }
    }
    return { ok: true }
  } catch (error) {
    log.error('[tenant-onboarding] event insert threw', error, {
      tenant_id: input.guildId,
      event_type: input.eventType,
    })
    return { ok: false }
  }
}

export async function logTenantOnboardingEventOnce(
  input: LogTenantOnboardingEventInput,
): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const db = getAdminClient()
    const { data, error } = await db
      .from('tenant_onboarding_events')
      .select('id')
      .eq('guild_id', input.guildId)
      .eq('event_type', input.eventType)
      .limit(1)
    if (error) {
      log.error('[tenant-onboarding] event dedupe lookup failed', error, {
        tenant_id: input.guildId,
        event_type: input.eventType,
      })
      return logTenantOnboardingEvent(input)
    }
    if ((data ?? []).length > 0) return { ok: true, skipped: true }
    return logTenantOnboardingEvent(input)
  } catch (error) {
    log.error('[tenant-onboarding] event dedupe lookup threw', error, {
      tenant_id: input.guildId,
      event_type: input.eventType,
    })
    return logTenantOnboardingEvent(input)
  }
}

export async function loadTenantOnboardingEvents(
  guildId: string,
  limit: number = 30,
): Promise<TenantOnboardingEvent[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('tenant_onboarding_events')
    .select('id, actor_discord_id, event_type, details, created_at')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(1, limit), 100))
  if (error) throw new Error(error.message)

  return (data ?? [])
    .filter((row) => isTenantOnboardingEventType(row.event_type))
    .map((row) => ({
      id: row.id as string,
      actorDiscordId: (row.actor_discord_id as string | null) ?? null,
      eventType: row.event_type as TenantOnboardingEventType,
      details: (row.details as Record<string, unknown> | null) ?? {},
      createdAt: row.created_at as string,
    }))
}

export async function loadTenantOnboardingSummary(
  guildId: string,
  limit: number = 30,
): Promise<TenantOnboardingSummary> {
  const db = getAdminClient()
  const [tenantRes, events, publishedEventRes, notificationSentRes] = await Promise.all([
    db
      .from('tenants')
      .select('id, status, bot_installed_at, event_channel_id')
      .eq('id', guildId)
      .maybeSingle(),
    loadTenantOnboardingEvents(guildId, limit),
    db
      .from('tenant_onboarding_events')
      .select('id')
      .eq('guild_id', guildId)
      .eq('event_type', 'first_event_published')
      .limit(1),
    db
      .from('tenant_onboarding_events')
      .select('id')
      .eq('guild_id', guildId)
      .eq('event_type', 'first_event_notification_sent')
      .limit(1),
  ])
  if (tenantRes.error) throw new Error(tenantRes.error.message)
  if (publishedEventRes.error) throw new Error(publishedEventRes.error.message)
  if (notificationSentRes.error) throw new Error(notificationSentRes.error.message)

  const tenant = tenantRes.data
  return summarizeTenantOnboardingEvents({
    tenant: {
      id: guildId,
      status: (tenant?.status as string | null) ?? null,
      botInstalled: !!tenant?.bot_installed_at,
      eventChannelId: (tenant?.event_channel_id as string | null) ?? null,
    },
    events,
    completedEventTypes: [
      ...(publishedEventRes.data?.length ? (['first_event_published'] as const) : []),
      ...(notificationSentRes.data?.length ? (['first_event_notification_sent'] as const) : []),
    ],
  })
}
