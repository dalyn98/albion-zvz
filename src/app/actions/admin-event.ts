'use server'

// 이벤트 관련 어드민 액션. draft 생성/편집/발행/복제/삭제, 전투 시작/리셋,
// Discord 알림 디스패치까지 한 모듈에 모았다. 파티/슬롯 액션은
// `./admin-party-slot` 로 분리.

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  requireEventCreator,
  requireEventCreatorForEvent,
} from '@/lib/auth'
import {
  sessionCanCreateEventCategory,
  sessionCanCreateOrManageEvents,
} from '@/lib/event-permissions'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { sendEventNotification, DiscordChannelMessageError, type EventNotificationPayload } from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import { log } from '@/lib/log'
import { logAdminAction } from '@/lib/admin-audit'
import { logTenantOnboardingEvent } from '@/lib/tenant-onboarding-events'
import type { Locale } from '@/i18n/locales'
import type { EventCategory, EventRegearPolicy, EventRecruitmentMode } from '@/types'
import { EVENT_CATEGORIES, EVENT_RECRUITMENT_MODES } from '@/types'
import {
  canUseEventRegearPolicy,
  DEFAULT_EVENT_REGEAR_POLICY,
  isEventRegearPolicy,
  isValidEventRegearMaxDeaths,
  isValidEventRegearSilverCap,
} from '@/lib/regear-event-policy'
import type { AdminErrorTranslator } from './admin-slot-sanitizers'

// next-intl locale 코드(ko/ja/en/zh) → Intl.DateTimeFormat 이 받는 BCP 47 태그.
// Discord embed 의 일시 표기 포맷에 사용 — 시간대는 길드 설정(getTenantTimezone)
// 으로 결정.
const LOCALE_TO_BCP47: Record<Locale, string> = {
  ko: 'ko-KR',
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'zh-CN',
}

interface EventPayload {
  title: string
  gather_at: string
  gather_time: string
  gather_location: string
  special_notes: string | null
  // 이벤트 생성/편집 시 관리자가 고른 Discord 역할 ID. notifyEvent 가
  // 채널 공지 시 이 역할만 @멘션한다. NULL/미지정이면 멘션 없이 조용히 공지.
  // optional 로 둬서 role picker UI 를 아직 안 쓰는 호출부도 호환되게 한다.
  notify_role_id?: string | null
  // 편집 화면에서 관리자가 고른 Discord 채널 ID. NULL 이면 env 기반 기본
  // 채널(DISCORD_EVENT_CHANNEL_ID) 로 fallback. 생성 폼은 이 필드를 보내지
  // 않으며 편집 단계에서만 채널을 고른다.
  notify_channel_id?: string | null
  // Migration 105: 채널 공지에 @everyone 을 함께 붙일지 여부. 편집 화면에서만
  // 토글하며, 생성 폼은 이 필드를 보내지 않는다 (DB DEFAULT false 적용).
  notify_everyone?: boolean
  // Migration 063: 이벤트 카테고리. 생성 시 선택하고 편집에서도 변경 가능.
  // 생략하면 DB 기본값 '전투' 가 적용된다.
  category?: EventCategory
  recruitment_mode?: EventRecruitmentMode
  regear_policy?: EventRegearPolicy | null
  regear_silver_cap?: number | null
  regear_max_deaths_per_member?: number | null
}

interface NormalizedEventRegearFields {
  regear_policy: EventRegearPolicy
  regear_silver_cap: number | null
  regear_max_deaths_per_member: number | null
}

const DEFAULT_EVENT_REGEAR_FIELDS: NormalizedEventRegearFields = {
  regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
  regear_silver_cap: null,
  regear_max_deaths_per_member: null,
}

function normalizeIntegerInput(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return value
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

function normalizeEventRegearFields(
  payload: Pick<EventPayload, 'category' | 'regear_policy' | 'regear_silver_cap' | 'regear_max_deaths_per_member'>,
  tErr: AdminErrorTranslator,
): NormalizedEventRegearFields | { error: string } {
  const category: EventCategory =
    payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
  if (!canUseEventRegearPolicy(category)) {
    return {
      regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
      regear_silver_cap: null,
      regear_max_deaths_per_member: null,
    }
  }

  const policy = isEventRegearPolicy(payload.regear_policy)
    ? payload.regear_policy
    : DEFAULT_EVENT_REGEAR_POLICY

  if (policy !== 'event') {
    return {
      regear_policy: policy,
      regear_silver_cap: null,
      regear_max_deaths_per_member: null,
    }
  }

  const silverCap = normalizeIntegerInput(payload.regear_silver_cap)
  if (!isValidEventRegearSilverCap(silverCap)) {
    return { error: tErr('invalidEventRegearSilverCap') }
  }
  const maxDeaths = normalizeIntegerInput(payload.regear_max_deaths_per_member)
  if (!isValidEventRegearMaxDeaths(maxDeaths)) {
    return { error: tErr('invalidEventRegearDeaths') }
  }

  return {
    regear_policy: 'event',
    regear_silver_cap: silverCap,
    regear_max_deaths_per_member: maxDeaths,
  }
}

function normalizeCreateEventRegearFields(
  payload: Pick<EventPayload, 'category' | 'regear_policy' | 'regear_silver_cap' | 'regear_max_deaths_per_member'>,
  tErr: AdminErrorTranslator,
  canManageRegearPolicy: boolean,
): NormalizedEventRegearFields | { error: string } {
  if (!canManageRegearPolicy) return DEFAULT_EVENT_REGEAR_FIELDS
  return normalizeEventRegearFields(payload, tErr)
}

function normalizeUpdateEventRegearFields(
  payload: Pick<EventPayload, 'category' | 'regear_policy' | 'regear_silver_cap' | 'regear_max_deaths_per_member'>,
  tErr: AdminErrorTranslator,
  canManageRegearPolicy: boolean,
): NormalizedEventRegearFields | null | { error: string } {
  if (canManageRegearPolicy) return normalizeEventRegearFields(payload, tErr)
  const category: EventCategory =
    payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
  return canUseEventRegearPolicy(category) ? null : DEFAULT_EVENT_REGEAR_FIELDS
}

function stripEventRegearPayload<
  T extends {
    regear_policy?: unknown
    regear_silver_cap?: unknown
    regear_max_deaths_per_member?: unknown
  },
>(payload: T): Omit<
  T,
  'regear_policy' | 'regear_silver_cap' | 'regear_max_deaths_per_member'
> {
  const rest = { ...payload }
  delete rest.regear_policy
  delete rest.regear_silver_cap
  delete rest.regear_max_deaths_per_member
  return rest
}

// Final check in case the client bypassed validation — a bad ISO string would
// otherwise surface as an obscure Postgres error on insert.
// publishing=true 면 발행 시점 검증 — gather_at 은 필수, gather_location 은 옵션
// (사전에 장소를 못 정하는 이벤트도 있어 발행을 막지 않는다).
// publishing=false 면 draft 편집 중이라 gather_at 은 비어 있어도 OK.
function validateEventPayload(
  payload: EventPayload,
  tErr: AdminErrorTranslator,
  opts: { publishing: boolean; canManageRegearPolicy?: boolean } = { publishing: true },
): string | null {
  if (!payload.title.trim()) return tErr('missingTitle')
  if (opts.publishing) {
    const dt = new Date(payload.gather_at)
    if (Number.isNaN(dt.getTime())) return tErr('invalidGatherTime')
  } else if (payload.gather_at) {
    // draft 단계라도 값이 들어왔으면 형식은 맞아야 한다 — 완전 공란만 허용.
    const dt = new Date(payload.gather_at)
    if (Number.isNaN(dt.getTime())) return tErr('invalidGatherTime')
  }
  // 카테고리 — 값이 있으면 화이트리스트 검증. 없으면 DB DEFAULT ('전투') 사용.
  if (payload.category !== undefined && !EVENT_CATEGORIES.includes(payload.category)) {
    return tErr('serverError')
  }
  if (
    payload.recruitment_mode !== undefined &&
    !EVENT_RECRUITMENT_MODES.includes(payload.recruitment_mode)
  ) {
    return tErr('serverError')
  }
  if (opts.canManageRegearPolicy ?? true) {
    const regearFields = normalizeEventRegearFields(payload, tErr)
    if ('error' in regearFields) return regearFields.error
  }
  return null
}

// 이벤트를 draft 상태로 생성. 제목만 받아 빈 껍질을 만든 뒤 편집/발행 단계로 넘긴다.
// 기존 createEvent 와 달리 gather_at 을 요구하지 않으며 공개 /events 에도 뜨지 않는다.
export async function createDraftEvent(
  payload: {
    title: string
    category?: EventCategory
    recruitmentMode?: EventRecruitmentMode
    regear_policy?: EventRegearPolicy | null
    regear_silver_cap?: number | null
    regear_max_deaths_per_member?: number | null
  },
): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!payload.title.trim()) return { error: tErr('missingTitle') }
    const category: EventCategory =
      payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
    const recruitmentMode: EventRecruitmentMode =
      payload.recruitmentMode && EVENT_RECRUITMENT_MODES.includes(payload.recruitmentMode)
        ? payload.recruitmentMode
        : 'slots'
    const session = await getSession()
    if (!sessionCanCreateOrManageEvents(session)) return { error: tErr('unauthorized') }
    if (!sessionCanCreateEventCategory(session, category)) {
      return { error: tErr('unauthorized') }
    }
    const regearFields = normalizeCreateEventRegearFields(
      {
        category,
        regear_policy: payload.regear_policy,
        regear_silver_cap: payload.regear_silver_cap,
        regear_max_deaths_per_member: payload.regear_max_deaths_per_member,
      },
      tErr,
      session.isAdmin === true,
    )
    if (regearFields && 'error' in regearFields) return { error: regearFields.error }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('events')
      .insert({
        guild_id: guildId,
        title: payload.title.trim(),
        gather_time: '',
        gather_at: null,
        gather_location: '',
        special_notes: null,
        status: 'draft',
        category,
        recruitment_mode: recruitmentMode,
        ...regearFields,
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.create',
      targetId: data.id,
      targetKind: 'event',
      details: { kind: 'draft', title: payload.title.trim(), category, recruitmentMode },
    })
    await logTenantOnboardingEvent({
      guildId,
      actorDiscordId: session.discordId,
      eventType: 'first_event_created',
      details: {
        eventId: data.id,
        title: payload.title.trim(),
        category,
        recruitmentMode,
      },
    })
    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 기존 코드 호환을 위해 `createEvent` 는 남겨두되, 내부적으로는 draft 를 만든 뒤
// 즉시 update 로 메타를 채운다. EventInfoForm create 모드의 기존 흐름에서 호출되며
// 이 경우에도 status 는 'draft' 로 두고 공개는 publishEvent 까지 미룬다.
export async function createEvent(payload: EventPayload): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!sessionCanCreateOrManageEvents(session)) return { error: tErr('unauthorized') }
    const canManageRegearPolicy = session.isAdmin === true
    const invalid = validateEventPayload(payload, tErr, {
      publishing: false,
      canManageRegearPolicy,
    })
    if (invalid) return { error: invalid }
    const requestedCategory: EventCategory =
      payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
    if (!sessionCanCreateEventCategory(session, requestedCategory)) {
      return { error: tErr('unauthorized') }
    }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const regearFields = normalizeCreateEventRegearFields(
      { ...payload, category: requestedCategory },
      tErr,
      canManageRegearPolicy,
    )
    if (regearFields && 'error' in regearFields) return { error: regearFields.error }
    const { data, error } = await db
      .from('events')
      .insert({
        ...stripEventRegearPayload(payload),
        ...regearFields,
        guild_id: guildId,
        status: 'draft',
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.create',
      targetId: data.id,
      targetKind: 'event',
      details: { title: payload.title, gatherAt: payload.gather_at, category: requestedCategory },
    })
    await logTenantOnboardingEvent({
      guildId,
      actorDiscordId: session.discordId,
      eventType: 'first_event_created',
      details: {
        eventId: data.id,
        title: payload.title,
        category: requestedCategory,
        recruitmentMode: payload.recruitment_mode ?? 'slots',
      },
    })
    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateEvent(id: string, payload: EventPayload): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const canManageRegearPolicy = session.isAdmin === true
    // draft 편집 중에도 부분 저장을 허용해야 하므로 publishing=false. 발행 단계
    // 에서 한 번 더 strict 검증을 거친다.
    const invalid = validateEventPayload(payload, tErr, {
      publishing: false,
      canManageRegearPolicy,
    })
    if (invalid) return { error: invalid }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)

    // gather_at 가 바뀌면 자동 시작/임박 DM 의 "이미 처리됨" 표식을 함께 지운다.
    // 그렇지 않으면 admin 이 시간을 늦춰도 cron 은 옛 발화 기록을 보고 재발동을
    // 건너뛰어 — DM 이 안 가고 battle_started_at 이 옛 시간으로 굳어진다.
    const { data: current } = await db
      .from('events')
      .select('gather_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    const previousGatherAt = (current?.gather_at ?? null) as string | null
    const gatherAtChanged = previousGatherAt !== payload.gather_at
    const regearFields = normalizeUpdateEventRegearFields(payload, tErr, canManageRegearPolicy)
    if (regearFields && 'error' in regearFields) return { error: regearFields.error }
    const finalPayload: Record<string, unknown> = {
      ...stripEventRegearPayload(payload),
      ...(regearFields ?? {}),
    }
    if (gatherAtChanged) {
      finalPayload.battle_started_at = null
      // legacy 컬럼이지만 운영 데이터가 남아 있어 같이 비워준다 (기존 cron 잔재).
      finalPayload.imminent_notified_at = null
    }

    const { error } = await db.from('events').update(finalPayload).eq('guild_id', guildId).eq('id', id)
    if (error) return { error: error.message }
    // gather_at 이 바뀌면 (event, member) 단위 DM 발송 기록도 비워 — 새 시간 기준
    // 으로 다시 발송될 수 있도록. event_dm_sent 가 비어있어도 cron 이 정상 동작
    // 하므로 실패는 무시.
    if (gatherAtChanged) {
      const { error: clearError } = await db
        .from('event_dm_sent')
        .delete()
        .eq('guild_id', guildId)
        .eq('event_id', id)
      if (clearError) {
        log.error('[admin/updateEvent] event_dm_sent clear failed', clearError, {
          tenant_id: guildId,
          event_id: id,
        })
      }
    }
    revalidatePath('/admin/dashboard')
    // 편집 페이지 자체도 invalidate — 그렇지 않으면 router.refresh() 후에도
    // PublishEventBanner 가 stale event prop 으로 렌더되어 발행 버튼이 비활성
    // 상태 그대로 남는다.
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.update',
      targetId: id,
      targetKind: 'event',
      details: { title: payload.title, gatherAt: payload.gather_at, gatherAtChanged },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// draft → published 전이. 호출자(PublishEventBanner)가 먼저 저장 컨텍스트를
// 통해 모든 폼 섹션을 DB 에 commit 한 뒤 호출하므로, 여기서는 DB 의 현재 값을
// 읽어 필수 필드(title / gather_at / gather_location)를 검증하고 status 만 전이.
// 이렇게 두면 stale form payload 가 저장된 값을 덮어쓰는 race 를 원천 차단.
// 발행 직후에는 길드의 Discord 알림 채널이 설정되어 있으면 자동으로 알림을
// 발송한다 — 마케팅 카피와 사용자 멘탈 모델("발행=공지") 에 맞추기 위함. 알림이
// 실패해도 발행 자체는 성공시키고, 실패 사유는 warning 으로 회신해 UI 에서
// 표시할 수 있게 한다.
export async function publishEvent(id: string): Promise<{ error?: string; warning?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    // publish + 자동 알림 발송에 필요한 필드를 한 SELECT 로 합쳐 가져온다.
    // dispatchEventNotification 이 이 row 를 그대로 재사용하므로 round-trip
    // 1회를 절약. `id` 는 cached row 식별용, `notify_everyone` 은 알림 멘션 분기,
    // `category` 는 publish 시점의 strict 검증용.
    const { data: current, error: fetchError } = await db
      .from('events')
      .select('id, title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, notify_everyone, category')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!current) return { error: tErr('eventNotFound') }
    const invalid = validateEventPayload(current as EventPayload, tErr, { publishing: true })
    if (invalid) return { error: invalid }
    const { error } = await db
      .from('events')
      .update({ status: 'published' })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.publish',
      targetId: id,
      targetKind: 'event',
      details: { title: current.title, gatherAt: current.gather_at },
    })
    await logTenantOnboardingEvent({
      guildId,
      actorDiscordId: session.discordId,
      eventType: 'first_event_published',
      details: { eventId: id, title: current.title, gatherAt: current.gather_at },
    })

    // 자동 알림 — 채널이 해석되지 않으면 조용히 skip (Discord 미연동 길드는
    // 발행만 정상 동작). Discord API 호출 (200~500ms 외부 네트워크) 을 응답
    // 경로에서 빼고 next/server `after()` 로 백그라운드 실행 — 사용자는 즉시
    // 응답을 받는다. 실패해도 발행 자체는 성공이고, 사용자는 종 버튼
    // (notifyEvent 수동) 으로 재시도 가능. 운영자는 Vercel 로그에서 인지.
    const tenantConfig = await getTenantDiscordConfig(guildId)
    const channelId = current.notify_channel_id ?? tenantConfig?.eventChannelId ?? null
    if (channelId) {
      const cachedEvent = current as EventNotificationPayload
      after(async () => {
        try {
          const dispatch = await dispatchEventNotification(
            db,
            guildId,
            id,
            tenantConfig,
            cachedEvent,
          )
          if (dispatch.error) {
            log.error('[publishEvent] async notification failed', undefined, {
              tenant_id: guildId,
              event_id: id,
              reason: dispatch.error,
            })
          }
        } catch (e) {
          log.error('[publishEvent] async notification threw', e, {
            tenant_id: guildId,
            event_id: id,
          })
        }
      })
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function notifyEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    return await dispatchEventNotification(db, guildId, id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 이벤트 알림을 빌드해서 Discord 로 발송한다. publishEvent (자동) /
// notifyEvent (수동) 가 공통으로 사용. 채널 ID 가 null 이면 sendEventNotification
// 이 throw 하므로, 자동 발송 경로는 호출 전에 channelId 를 직접 확인하고 skip
// 할 책임이 있다. 수동 발송은 throw 를 그대로 사용자에게 보여줘 채널 설정
// 누락을 인지하게 한다.
type EventCreatorDb = Awaited<ReturnType<typeof requireEventCreatorForEvent>>
type CachedTenantConfig = Awaited<ReturnType<typeof getTenantDiscordConfig>>
type EventNotificationRow = EventNotificationPayload & { status?: string | null }

async function dispatchEventNotification(
  db: EventCreatorDb,
  guildId: string,
  eventId: string,
  cachedTenantConfig?: CachedTenantConfig,
  cachedEventData?: EventNotificationPayload,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    // publishEvent 자동 발송 경로는 자기 SELECT 결과를 prop 으로 넘긴다
    // (round-trip 절약). notifyEvent 수동 경로는 prop 없이 호출되어 자체 SELECT.
    let data: EventNotificationRow | null = cachedEventData ?? null
    if (!data) {
      const { data: fetched, error } = await db
        .from('events')
        .select('id, title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, notify_everyone, status')
        .eq('guild_id', guildId)
        .eq('id', eventId)
        .maybeSingle()
      if (error) return { error: error.message }
      if (!fetched) return { error: tErr('eventNotFound') }
      data = fetched as EventNotificationRow
    }
    if (data.status === 'draft') return { error: tErr('eventNotPublished') }
    // 관리자가 설정 화면에서 알림 문구를 저장하지 않은 경우 호출자(관리자)
    // 의 locale 에 맞는 기본 문구를 사용. 길드별 단일 언어 설정은 없지만,
    // 알림을 트리거하는 사람의 locale 이 길드 운영 언어일 가능성이 가장 높다.
    const tEvent = await getTranslations('event')
    const savedMessage = await getAppSetting('event_notification_message', '', guildId)
    const content = savedMessage.trim().length > 0
      ? savedMessage
      : tEvent('defaultNotificationMessage')
    // notify_channel_id 가 null 이면 tenant 기본 채널로 fallback. tenant 도
    // 안 설정되어 있으면 sendEventNotification 에서 throw — 수동 발송 경로는
    // 이 throw 로 채널 설정 누락을 사용자에게 즉시 알린다.
    const tenantConfig = cachedTenantConfig ?? await getTenantDiscordConfig(guildId)
    const channelId = data.notify_channel_id ?? tenantConfig?.eventChannelId ?? null
    // Discord embed 라벨/날짜 포맷은 알림 트리거 관리자의 locale 로 — 길드별
    // 단일 운영 언어 컨벤션을 가정한다 (channel 은 1 곳, 라벨은 1 종류).
    const adminLocale = await getLocale()
    const dateLocale = LOCALE_TO_BCP47[adminLocale]
    const tenantTimezone = await getTenantTimezone(guildId)
    await sendEventNotification(data, {
      content,
      notifyRoleId: data.notify_role_id,
      notifyEveryone: data.notify_everyone === true,
      channelId,
      fieldLabels: {
        gatherAt: tEvent('discordFieldGatherAt'),
        gatherTime: tEvent('discordFieldGatherTime'),
        gatherLocation: tEvent('discordFieldGatherLocation'),
        specialNotes: tEvent('discordFieldSpecialNotes'),
      },
      dateLocale,
      tenantTimezone,
      tenantSlug: tenantConfig?.slug ?? null,
    })
    await logTenantOnboardingEvent({
      guildId,
      actorDiscordId: null,
      eventType: 'first_event_notification_sent',
      details: { eventId, channelId },
    })
    return {}
  } catch (e) {
    if (e instanceof DiscordChannelMessageError) {
      // 디스코드 에러 코드 참고: https://discord.com/developers/docs/topics/opcodes-and-status-codes
      // 50001 Missing Access — 봇이 채널을 못 봄 (다른 길드 채널이거나 권한 차단)
      // 50013 Missing Permissions — 채널은 보이지만 메시지 보낼 권한 없음
      // 10003 Unknown Channel — 채널 ID 자체가 무효 (삭제됨/오타)
      // 50007 Cannot send messages to this user — DM 차단 (DM 헬퍼 쪽)
      // 그 외 코드/상태는 generic 메시지 + raw 본문 노출.
      const tNotify = await getTranslations('adminNotifyError')
      if (e.discordCode === 50001) return { error: tNotify('missingAccess') }
      if (e.discordCode === 50013) return { error: tNotify('missingPermissions') }
      if (e.discordCode === 10003) return { error: tNotify('unknownChannel') }
      if (e.status === 401 || e.status === 403) {
        return { error: tNotify('forbidden', { status: e.status }) }
      }
      return {
        error: tNotify('generic', {
          status: e.status,
          message: e.discordMessage ?? e.raw.slice(0, 200),
        }),
      }
    }
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function cloneEvent(id: string): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDash = await getTranslations('adminDashboard')
  try {
    const session = await getSession()
    if (!sessionCanCreateOrManageEvents(session)) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: source, error: sourceErr } = await db
      .from('events')
      .select('title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, notify_everyone, category, recruitment_mode, regear_policy, regear_silver_cap, regear_max_deaths_per_member')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (sourceErr) return { error: sourceErr.message }
    if (!source) return { error: tErr('eventNotFound') }
    const category: EventCategory = EVENT_CATEGORIES.includes(source.category as EventCategory)
      ? (source.category as EventCategory)
      : '전투'
    if (!sessionCanCreateEventCategory(session, category)) {
      return { error: tErr('unauthorized') }
    }
    const regearFields = normalizeCreateEventRegearFields(
      session.isAdmin
        ? {
            category,
            regear_policy: source.regear_policy as EventRegearPolicy | null,
            regear_silver_cap: source.regear_silver_cap as number | null,
            regear_max_deaths_per_member: source.regear_max_deaths_per_member as number | null,
          }
        : { category },
      tErr,
      session.isAdmin === true,
    )
    if ('error' in regearFields) return { error: regearFields.error }

    // Shift gather_at forward by 7 days so the copy lands on the same weekday
    // at the same hour. Admin can still edit if needed.
    let shiftedGatherAt = source.gather_at as string | null
    if (shiftedGatherAt) {
      const d = new Date(shiftedGatherAt)
      d.setUTCDate(d.getUTCDate() + 7)
      shiftedGatherAt = d.toISOString()
    }

    const { data: newEvent, error: insErr } = await db
      .from('events')
      .insert({
        guild_id: guildId,
        title: `${source.title}${tDash('duplicateSuffix')}`,
        gather_time: source.gather_time,
        gather_at: shiftedGatherAt,
        gather_location: source.gather_location,
        special_notes: source.special_notes,
        notify_role_id: source.notify_role_id,
        notify_channel_id: source.notify_channel_id,
        notify_everyone: source.notify_everyone,
        category,
        recruitment_mode: source.recruitment_mode ?? 'slots',
        ...regearFields,
        // 복제는 늘 draft 로 시작 — 관리자가 날짜/공지 확인 후 명시적으로 발행.
        status: 'draft',
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (insErr) return { error: insErr.message }
    const newId = newEvent.id

    const [{ data: buildDemands, error: buildDemandErr }, { data: buildAssigners, error: buildAssignerErr }] =
      await Promise.all([
        db
          .from('event_build_role_demands')
          .select('party_number, role_type, required_count')
          .eq('guild_id', guildId)
          .eq('event_id', id),
        db
          .from('event_build_party_assigners')
          .select('party_number, caller_discord_id')
          .eq('guild_id', guildId)
          .eq('event_id', id),
      ])
    if (buildDemandErr || buildAssignerErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: buildDemandErr?.message ?? buildAssignerErr?.message ?? tErr('serverError') }
    }
    if (buildDemands && buildDemands.length > 0) {
      const { error: copyDemandErr } = await db
        .from('event_build_role_demands')
        .insert(buildDemands.map((row) => ({ ...row, guild_id: guildId, event_id: newId })))
      if (copyDemandErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: copyDemandErr.message }
      }
    }
    if (buildAssigners && buildAssigners.length > 0) {
      const { error: copyAssignerErr } = await db
        .from('event_build_party_assigners')
        .insert(buildAssigners.map((row) => ({ ...row, guild_id: guildId, event_id: newId })))
      if (copyAssignerErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: copyAssignerErr.message }
      }
    }

    const { data: parties, error: partyErr } = await db
      .from('parties')
      .select('id, party_number')
      .eq('guild_id', guildId)
      .eq('event_id', id)
      .order('party_number')
    if (partyErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: partyErr.message }
    }

    if (!parties || parties.length === 0) {
      revalidatePath('/admin/dashboard')
      return { id: newId }
    }

    const newPartyRows = parties.map((p) => ({
      guild_id: guildId,
      event_id: newId,
      party_number: p.party_number,
    }))
    const { data: newParties, error: newPartyErr } = await db
      .from('parties')
      .insert(newPartyRows)
      .select('id, party_number')
    if (newPartyErr || !newParties) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: newPartyErr?.message ?? tErr('serverError') }
    }

    const oldToNewPartyId = new Map<string, string>()
    for (const oldParty of parties) {
      const match = newParties.find((np) => np.party_number === oldParty.party_number)
      if (match) oldToNewPartyId.set(oldParty.id, match.id)
    }

    // Copy build config only — strip id/assigned_* so the clone starts with
    // empty signup slots. Callers usually duplicate a proven event to re-run it.
    const { data: slots, error: slotErr } = await db
      .from('slots')
      .select('*')
      .eq('guild_id', guildId)
      .in('party_id', parties.map((p) => p.id))
    if (slotErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: slotErr.message }
    }

    if (slots && slots.length > 0) {
      const newSlotRows = slots.map((slot) => {
        const row: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(slot)) {
          if (key === 'id') continue
          if (key.startsWith('assigned_')) continue
          if (key === 'party_id') continue
          row[key] = value
        }
        row.party_id = oldToNewPartyId.get(slot.party_id)
        row.guild_id = guildId
        return row
      })
      const { error: insSlotErr } = await db.from('slots').insert(newSlotRows)
      if (insSlotErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: insSlotErr.message }
      }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.create',
      targetId: newId,
      targetKind: 'event',
      details: { kind: 'clone', clonedFrom: id, title: source.title },
    })
    return { id: newId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    // 삭제 전 제목 캐싱 — audit details 에 남기기 위해.
    const { data: snapshot } = await db
      .from('events')
      .select('title, gather_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    // regear_requests keeps history via SET NULL (migration 005).
    const { error } = await db.from('events').delete().eq('guild_id', guildId).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    revalidatePath('/me')
    revalidatePath('/members')
    revalidatePath('/members/[discordId]', 'page')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.delete',
      targetId: id,
      targetKind: 'event',
      details: { title: snapshot?.title ?? null, gatherAt: snapshot?.gather_at ?? null },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function startBattle(id: string): Promise<{ startedAt?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    const { data: current, error: currentError } = await db
      .from('events')
      .select('status')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (currentError) return { error: currentError.message }
    if (!current) return { error: tErr('eventNotFound') }
    if (current.status === 'draft') return { error: tErr('eventNotPublished') }
    const startedAt = new Date().toISOString()
    const { error } = await db
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.update',
      targetId: id,
      targetKind: 'event',
      details: { kind: 'battle_start', startedAt },
    })
    return { startedAt }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function resetBattleStart(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    // 전투 초기화 후엔 임박 DM 도 재발송 가능 상태로 되돌리는 게 직관적.
    // gather_at 자체는 그대로 두므로 cron 은 기존 시간에 다시 발동.
    // imminent_notified_at 은 legacy 컬럼이지만 운영 데이터 남아 있어 같이 비움.
    const { error } = await db
      .from('events')
      .update({ battle_started_at: null, imminent_notified_at: null })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    // 새 dedupe 인 event_dm_sent 도 비워야 cron 이 같은 멤버에게 다시 시도한다.
    const { error: clearError } = await db
      .from('event_dm_sent')
      .delete()
      .eq('guild_id', guildId)
      .eq('event_id', id)
    if (clearError) {
      log.error('[admin/resetBattleStart] event_dm_sent clear failed', clearError, {
        tenant_id: guildId,
        event_id: id,
      })
    }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.update',
      targetId: id,
      targetKind: 'event',
      details: { kind: 'battle_reset' },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
