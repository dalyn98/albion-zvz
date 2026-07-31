'use server'


import { publicActionError } from '@/lib/public-action-error'
// 이벤트 관련 어드민 액션. draft 생성/편집/발행/복제/삭제, 조기 운영 시작,
// Discord 알림 디스패치까지 한 모듈에 모았다. 파티/슬롯 액션은
// `./admin-party-slot` 로 분리.

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getTranslations } from 'next-intl/server'
import {
  requireEventCreator,
  requireEventCreatorForEvent,
  requireLiveSession,
} from '@/lib/auth'
import {
  sessionCanCreateEventCategory,
  sessionCanCreateOrManageEvents,
} from '@/lib/event-permissions'
import { sessionHas } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { sendEventNotification, DiscordChannelMessageError, type EventNotificationPayload } from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import { log } from '@/lib/log'
import { logAdminAction } from '@/lib/admin-audit'
import { logTenantOnboardingEvent } from '@/lib/tenant-onboarding-events'
import { loadDiscordEventSignupMessages } from '@/lib/discord-event-signups'
import type { Locale } from '@/i18n/locales'
import type {
  EventCategory,
  EventRegearAutoPolicy,
  EventRegearPolicy,
  EventRegearVideoPolicy,
  EventRecruitmentMode,
} from '@/types'
import { EVENT_CATEGORIES, EVENT_RECRUITMENT_MODES } from '@/types'
import {
  canUseEventRegearPolicy,
  DEFAULT_EVENT_REGEAR_AUTO_POLICY,
  DEFAULT_EVENT_REGEAR_POLICY,
  DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
  isEventRegearPolicy,
  isEventRegearAutoPolicy,
  isEventRegearVideoPolicy,
  isValidEventRegearMaxDeaths,
  isValidEventRegearPayoutRate,
  isValidEventRegearSilverCap,
  isValidEventRegearVideoBonus,
} from '@/lib/regear-event-policy'
import type { AdminErrorTranslator } from './admin-slot-sanitizers'
import { CAP, parseCapabilities } from '@/lib/permissions'
import { applyTemplate } from './templates'
import {
  summarizeEventPublishState,
  type EventPublishSummary,
} from '@/lib/event-publish-summary'
import { executeEventStartApplicationCommand } from '@/lib/event-start-application-command'
import { isApplicationCommandIdempotencyKey } from '@/lib/application-command-idempotency'
import { ApplicationCommandError } from '@/lib/application-command'
import { isRegearSupported } from '@/lib/regear-support-server'
import { buildClonedSlotRow } from '@/lib/event-clone'

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
  // true 면 슬롯 배정은 일반 이벤트 참여 통계에서만 제외한다. 전투/리기어 등
  // 운영 데이터는 그대로 유지한다.
  exclude_from_participation_stats?: boolean
  regear_policy?: EventRegearPolicy | null
  regear_silver_cap?: number | null
  regear_max_deaths_per_member?: number | null
  regear_video_policy?: EventRegearVideoPolicy | null
  regear_video_payout_rate_percent?: number | null
  regear_video_claim_ceiling_bonus_silver?: number | null
  regear_video_rate_applies_without_proof?: boolean | null
  regear_auto_policy?: EventRegearAutoPolicy | null
  guest_regear_enabled?: boolean | null
}

interface NormalizedEventRegearFields {
  regear_policy: EventRegearPolicy
  regear_silver_cap: number | null
  regear_max_deaths_per_member: number | null
  regear_video_policy: EventRegearVideoPolicy
  regear_video_payout_rate_percent: number | null
  regear_video_claim_ceiling_bonus_silver: number | null
  regear_video_rate_applies_without_proof: boolean
  regear_auto_policy: EventRegearAutoPolicy
  guest_regear_enabled: boolean
}

const DEFAULT_EVENT_REGEAR_FIELDS: NormalizedEventRegearFields = {
  regear_policy: DEFAULT_EVENT_REGEAR_POLICY,
  regear_silver_cap: null,
  regear_max_deaths_per_member: null,
  regear_video_policy: DEFAULT_EVENT_REGEAR_VIDEO_POLICY,
  regear_video_payout_rate_percent: null,
  regear_video_claim_ceiling_bonus_silver: null,
  regear_video_rate_applies_without_proof: false,
  regear_auto_policy: DEFAULT_EVENT_REGEAR_AUTO_POLICY,
  guest_regear_enabled: false,
}

const DISABLED_EVENT_REGEAR_FIELDS: NormalizedEventRegearFields = {
  regear_policy: 'disabled',
  regear_silver_cap: null,
  regear_max_deaths_per_member: null,
  regear_video_policy: 'disabled',
  regear_video_payout_rate_percent: null,
  regear_video_claim_ceiling_bonus_silver: null,
  regear_video_rate_applies_without_proof: false,
  regear_auto_policy: 'disabled',
  guest_regear_enabled: false,
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
  payload: Pick<
    EventPayload,
    | 'category'
    | 'regear_policy'
    | 'regear_silver_cap'
    | 'regear_max_deaths_per_member'
    | 'regear_video_policy'
    | 'regear_video_payout_rate_percent'
    | 'regear_video_claim_ceiling_bonus_silver'
    | 'regear_video_rate_applies_without_proof'
    | 'regear_auto_policy'
    | 'guest_regear_enabled'
  >,
  tErr: AdminErrorTranslator,
): NormalizedEventRegearFields | { error: string } {
  const category: EventCategory =
    payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
  if (!canUseEventRegearPolicy(category)) {
    return {
      ...DEFAULT_EVENT_REGEAR_FIELDS,
      guest_regear_enabled: payload.guest_regear_enabled === true,
    }
  }

  const policy = isEventRegearPolicy(payload.regear_policy)
    ? payload.regear_policy
    : DEFAULT_EVENT_REGEAR_POLICY
  const videoPolicy = isEventRegearVideoPolicy(payload.regear_video_policy)
    ? payload.regear_video_policy
    : DEFAULT_EVENT_REGEAR_VIDEO_POLICY
  const autoPolicy = isEventRegearAutoPolicy(payload.regear_auto_policy)
    ? payload.regear_auto_policy
    : DEFAULT_EVENT_REGEAR_AUTO_POLICY
  const videoRateAppliesWithoutProof =
    videoPolicy !== 'disabled' && payload.regear_video_rate_applies_without_proof === true
  const guestRegearEnabled =
    policy !== 'disabled' && payload.guest_regear_enabled === true
  let videoPayoutRatePercent: number | null = null
  let videoClaimCeilingBonusSilver: number | null = null

  if (videoPolicy === 'custom') {
    const videoRate = normalizeIntegerInput(payload.regear_video_payout_rate_percent)
    if (!isValidEventRegearPayoutRate(videoRate)) {
      return { error: tErr('invalidRegearPayoutRate') }
    }
    const videoBonus = normalizeIntegerInput(payload.regear_video_claim_ceiling_bonus_silver)
    if (!isValidEventRegearVideoBonus(videoBonus)) {
      return { error: tErr('invalidRegearVideoBonus') }
    }
    videoPayoutRatePercent = videoRate
    videoClaimCeilingBonusSilver = videoBonus
  }

  if (policy !== 'event') {
    return {
      regear_policy: policy,
      regear_silver_cap: null,
      regear_max_deaths_per_member: null,
      regear_video_policy: videoPolicy,
      regear_video_payout_rate_percent: videoPayoutRatePercent,
      regear_video_claim_ceiling_bonus_silver: videoClaimCeilingBonusSilver,
      regear_video_rate_applies_without_proof: videoRateAppliesWithoutProof,
      regear_auto_policy: autoPolicy,
      guest_regear_enabled: guestRegearEnabled,
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
    regear_video_policy: videoPolicy,
    regear_video_payout_rate_percent: videoPayoutRatePercent,
    regear_video_claim_ceiling_bonus_silver: videoClaimCeilingBonusSilver,
    regear_video_rate_applies_without_proof: videoRateAppliesWithoutProof,
    regear_auto_policy: autoPolicy,
    guest_regear_enabled: guestRegearEnabled,
  }
}

function normalizeCreateEventRegearFields(
  payload: Pick<
    EventPayload,
    | 'category'
    | 'regear_policy'
    | 'regear_silver_cap'
    | 'regear_max_deaths_per_member'
    | 'regear_video_policy'
    | 'regear_video_payout_rate_percent'
    | 'regear_video_claim_ceiling_bonus_silver'
    | 'regear_video_rate_applies_without_proof'
    | 'regear_auto_policy'
    | 'guest_regear_enabled'
  >,
  tErr: AdminErrorTranslator,
  canManageRegearPolicy: boolean,
): NormalizedEventRegearFields | { error: string } {
  if (!canManageRegearPolicy) return DEFAULT_EVENT_REGEAR_FIELDS
  return normalizeEventRegearFields(payload, tErr)
}

function normalizeUpdateEventRegearFields(
  payload: Pick<
    EventPayload,
    | 'category'
    | 'regear_policy'
    | 'regear_silver_cap'
    | 'regear_max_deaths_per_member'
    | 'regear_video_policy'
    | 'regear_video_payout_rate_percent'
    | 'regear_video_claim_ceiling_bonus_silver'
    | 'regear_video_rate_applies_without_proof'
    | 'regear_auto_policy'
    | 'guest_regear_enabled'
  >,
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
    regear_video_policy?: unknown
    regear_video_payout_rate_percent?: unknown
    regear_video_claim_ceiling_bonus_silver?: unknown
    regear_video_rate_applies_without_proof?: unknown
    regear_auto_policy?: unknown
    guest_regear_enabled?: unknown
  },
>(payload: T): Omit<
  T,
  | 'regear_policy'
  | 'regear_silver_cap'
  | 'regear_max_deaths_per_member'
  | 'regear_video_policy'
  | 'regear_video_payout_rate_percent'
  | 'regear_video_claim_ceiling_bonus_silver'
  | 'regear_video_rate_applies_without_proof'
  | 'regear_auto_policy'
  | 'guest_regear_enabled'
> {
  const rest = { ...payload }
  delete rest.regear_policy
  delete rest.regear_silver_cap
  delete rest.regear_max_deaths_per_member
  delete rest.regear_video_policy
  delete rest.regear_video_payout_rate_percent
  delete rest.regear_video_claim_ceiling_bonus_silver
  delete rest.regear_video_rate_applies_without_proof
  delete rest.regear_auto_policy
  delete rest.guest_regear_enabled
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
  if (
    payload.exclude_from_participation_stats !== undefined &&
    typeof payload.exclude_from_participation_stats !== 'boolean'
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
    excludeFromParticipationStats?: boolean
    regear_policy?: EventRegearPolicy | null
    regear_silver_cap?: number | null
    regear_max_deaths_per_member?: number | null
    regear_video_policy?: EventRegearVideoPolicy | null
    regear_video_payout_rate_percent?: number | null
    regear_video_claim_ceiling_bonus_silver?: number | null
    regear_video_rate_applies_without_proof?: boolean | null
    regear_auto_policy?: EventRegearAutoPolicy | null
    guest_regear_enabled?: boolean | null
    template_id?: string | null
  },
): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!payload.title.trim()) return { error: tErr('missingTitle') }
    if (
      payload.excludeFromParticipationStats !== undefined &&
      typeof payload.excludeFromParticipationStats !== 'boolean'
    ) {
      return { error: tErr('serverError') }
    }
    const category: EventCategory =
      payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
    const recruitmentMode: EventRecruitmentMode =
      payload.recruitmentMode && EVENT_RECRUITMENT_MODES.includes(payload.recruitmentMode)
        ? payload.recruitmentMode
        : 'slots'
    const session = await requireLiveSession().catch(() => null)
    if (!sessionCanCreateOrManageEvents(session)) return { error: tErr('unauthorized') }
    if (!sessionCanCreateEventCategory(session, category)) {
      return { error: tErr('unauthorized') }
    }
    const guildId = await getSessionGuildId(session)
    const regearSupported = await isRegearSupported(guildId)
    const regearFields = regearSupported
      ? normalizeCreateEventRegearFields(
          {
            category,
            regear_policy: payload.regear_policy,
            regear_silver_cap: payload.regear_silver_cap,
            regear_max_deaths_per_member: payload.regear_max_deaths_per_member,
            regear_video_policy: payload.regear_video_policy,
            regear_video_payout_rate_percent: payload.regear_video_payout_rate_percent,
            regear_video_claim_ceiling_bonus_silver:
              payload.regear_video_claim_ceiling_bonus_silver,
            regear_video_rate_applies_without_proof:
              payload.regear_video_rate_applies_without_proof,
            regear_auto_policy: payload.regear_auto_policy,
            guest_regear_enabled: payload.guest_regear_enabled,
          },
          tErr,
          session.isAdmin === true || sessionHas(session, CAP.REGEAR_EDIT_PRICE),
        )
      : DISABLED_EVENT_REGEAR_FIELDS
    if (regearFields && 'error' in regearFields) return { error: regearFields.error }
    const db = await requireEventCreator()
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
        exclude_from_participation_stats: payload.excludeFromParticipationStats === true,
        ...regearFields,
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (error) return { error: await publicActionError(error, 'actions/admin-event') }
    const templateId = payload.template_id?.trim() || null
    if (templateId) {
      const applied = await applyTemplate(data.id, templateId)
      if (applied.error) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', data.id)
        return { error: applied.error }
      }
    }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.create',
      targetId: data.id,
      targetKind: 'event',
      details: {
        kind: 'draft',
        title: payload.title.trim(),
        category,
        recruitmentMode,
        excludeFromParticipationStats: payload.excludeFromParticipationStats === true,
      },
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
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

// 기존 코드 호환을 위해 `createEvent` 는 남겨두되, 내부적으로는 draft 를 만든 뒤
// 즉시 update 로 메타를 채운다. EventInfoForm create 모드의 기존 흐름에서 호출되며
// 이 경우에도 status 는 'draft' 로 두고 공개는 publishEvent 까지 미룬다.
export async function createEvent(payload: EventPayload): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!sessionCanCreateOrManageEvents(session)) return { error: tErr('unauthorized') }
    const canManageRegearPolicy =
      session.isAdmin === true || sessionHas(session, CAP.REGEAR_EDIT_PRICE)
    const guildId = await getSessionGuildId(session)
    const regearSupported = await isRegearSupported(guildId)
    const invalid = validateEventPayload(payload, tErr, {
      publishing: false,
      canManageRegearPolicy: canManageRegearPolicy && regearSupported,
    })
    if (invalid) return { error: invalid }
    const requestedCategory: EventCategory =
      payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
    if (!sessionCanCreateEventCategory(session, requestedCategory)) {
      return { error: tErr('unauthorized') }
    }
    const db = await requireEventCreator()
    const regearFields = regearSupported
      ? normalizeCreateEventRegearFields(
          { ...payload, category: requestedCategory },
          tErr,
          canManageRegearPolicy,
        )
      : DISABLED_EVENT_REGEAR_FIELDS
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
    if (error) return { error: await publicActionError(error, 'actions/admin-event') }
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.create',
      targetId: data.id,
      targetKind: 'event',
      details: {
        title: payload.title,
        gatherAt: payload.gather_at,
        category: requestedCategory,
        excludeFromParticipationStats: payload.exclude_from_participation_stats === true,
      },
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
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

export async function updateEvent(id: string, payload: EventPayload): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!session) return { error: tErr('unauthorized') }
    const canManageRegearPolicy =
      session.isAdmin === true || sessionHas(session, CAP.REGEAR_EDIT_PRICE)
    const guildId = await getSessionGuildId(session)
    const regearSupported = await isRegearSupported(guildId)
    // draft 편집 중에도 부분 저장을 허용해야 하므로 publishing=false. 발행 단계
    // 에서 한 번 더 strict 검증을 거친다.
    const invalid = validateEventPayload(payload, tErr, {
      publishing: false,
      canManageRegearPolicy: canManageRegearPolicy && regearSupported,
    })
    if (invalid) return { error: invalid }
    const db = await requireEventCreatorForEvent(id)

    // gather_at 가 바뀌면 자동 시작/임박 DM 의 "이미 처리됨" 표식을 함께 지운다.
    // 그렇지 않으면 admin 이 시간을 늦춰도 cron 은 옛 발화 기록을 보고 재발동을
    // 건너뛰어 — DM 이 안 가고 battle_started_at 이 옛 시간으로 굳어진다.
    const { data: current } = await db
      .from('events')
      .select(
        'gather_at, battle_started_at, regear_policy_version_id, regear_policy, regear_silver_cap, regear_max_deaths_per_member, regear_video_policy, regear_video_payout_rate_percent, regear_video_claim_ceiling_bonus_silver, regear_video_rate_applies_without_proof, regear_auto_policy, guest_regear_enabled',
      )
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (!current) return { error: tErr('eventNotFound') }
    if (current.battle_started_at) return { error: tErr('eventOperationalLocked') }
    const previousGatherAt = (current?.gather_at ?? null) as string | null
    const gatherAtChanged = previousGatherAt !== payload.gather_at
    let regearFields = regearSupported
      ? normalizeUpdateEventRegearFields(payload, tErr, canManageRegearPolicy)
      : current?.regear_policy_version_id
        ? null
        : DISABLED_EVENT_REGEAR_FIELDS
    if (regearFields && 'error' in regearFields) return { error: regearFields.error }
    if (current?.regear_policy_version_id && regearFields) {
      const frozenValues: Record<string, unknown> = {
        regear_policy: current.regear_policy,
        regear_silver_cap: current.regear_silver_cap,
        regear_max_deaths_per_member: current.regear_max_deaths_per_member,
        regear_video_policy: current.regear_video_policy,
        regear_video_payout_rate_percent: current.regear_video_payout_rate_percent,
        regear_video_claim_ceiling_bonus_silver:
          current.regear_video_claim_ceiling_bonus_silver,
        regear_video_rate_applies_without_proof:
          current.regear_video_rate_applies_without_proof,
        regear_auto_policy: current.regear_auto_policy,
        guest_regear_enabled: current.guest_regear_enabled,
      }
      const changed = Object.entries(regearFields).some(
        ([key, value]) => frozenValues[key] !== value,
      )
      if (changed) return { error: tErr('eventRegearPolicyLocked') }
      regearFields = null
    }
    const finalPayload: Record<string, unknown> = {
      ...stripEventRegearPayload(payload),
      ...(regearFields ?? {}),
    }
    if (gatherAtChanged) {
      // legacy 컬럼이지만 운영 데이터가 남아 있어 같이 비워준다 (기존 cron 잔재).
      finalPayload.imminent_notified_at = null
    }

    const { error } = await db.from('events').update(finalPayload).eq('guild_id', guildId).eq('id', id)
    if (error) return { error: await publicActionError(error, 'actions/admin-event') }
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
    revalidatePath('/admin/dashboard/events')
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
      details: {
        title: payload.title,
        gatherAt: payload.gather_at,
        gatherAtChanged,
        excludeFromParticipationStats: payload.exclude_from_participation_stats === true,
      },
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

export async function getEventPublishSummary(
  id: string,
): Promise<{ summary?: EventPublishSummary; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    const [eventResult, partiesResult, tentativeResult, tenantConfig] = await Promise.all([
      db
        .from('events')
        .select('notify_channel_id')
        .eq('guild_id', guildId)
        .eq('id', id)
        .maybeSingle(),
      db
        .from('parties')
        .select('slots(is_hidden, assigned_discord_id)')
        .eq('guild_id', guildId)
        .eq('event_id', id),
      db
        .from('event_tentative_signups')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .eq('event_id', id),
      getTenantDiscordConfig(guildId),
    ])
    if (eventResult.error) return { error: await publicActionError(eventResult.error, 'actions/admin-event') }
    if (!eventResult.data) return { error: tErr('eventNotFound') }
    if (partiesResult.error) return { error: await publicActionError(partiesResult.error, 'actions/admin-event') }
    if (tentativeResult.error) return { error: await publicActionError(tentativeResult.error, 'actions/admin-event') }

    const slots = (partiesResult.data ?? []).flatMap((party) =>
      (party.slots ?? []).map((slot) => ({
        isHidden: slot.is_hidden === true,
        assignedDiscordId:
          typeof slot.assigned_discord_id === 'string' ? slot.assigned_discord_id : null,
      })),
    )
    return {
      summary: summarizeEventPublishState({
        slots,
        tentativeCount: tentativeResult.count ?? 0,
        eventNotificationChannelId:
          typeof eventResult.data.notify_channel_id === 'string'
            ? eventResult.data.notify_channel_id
            : null,
        tenantNotificationChannelId: tenantConfig?.eventChannelId ?? null,
      }),
    }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/admin-event') }
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
    const session = await requireLiveSession().catch(() => null)
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
    if (fetchError) return { error: await publicActionError(fetchError, 'actions/admin-event') }
    if (!current) return { error: tErr('eventNotFound') }
    const invalid = validateEventPayload(current as EventPayload, tErr, { publishing: true })
    if (invalid) return { error: invalid }
    const { error } = await db
      .from('events')
      .update({ status: 'published' })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: await publicActionError(error, 'actions/admin-event') }
    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
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
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

export async function notifyEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    return await dispatchEventNotification(db, guildId, id)
  } catch (e) {
    return { error: await publicActionError(e, 'actions/admin-event') }
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
      if (error) return { error: await publicActionError(error, 'actions/admin-event') }
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
    const signupMessages = await loadDiscordEventSignupMessages(adminLocale)
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
      signupPanelLabels: signupMessages,
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
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

export async function cloneEvent(id: string): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDash = await getTranslations('adminDashboard')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!sessionCanCreateOrManageEvents(session)) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: source, error: sourceErr } = await db
      .from('events')
      .select('title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, notify_everyone, category, recruitment_mode, exclude_from_participation_stats, regear_policy, regear_silver_cap, regear_max_deaths_per_member, regear_video_policy, regear_video_payout_rate_percent, regear_video_claim_ceiling_bonus_silver, regear_video_rate_applies_without_proof, regear_auto_policy, guest_regear_enabled')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (sourceErr) return { error: await publicActionError(sourceErr, 'actions/admin-event') }
    if (!source) return { error: tErr('eventNotFound') }
    const category: EventCategory = EVENT_CATEGORIES.includes(source.category as EventCategory)
      ? (source.category as EventCategory)
      : '전투'
    if (!sessionCanCreateEventCategory(session, category)) {
      return { error: tErr('unauthorized') }
    }
    const canManageRegearPolicy =
      session.isAdmin === true || sessionHas(session, CAP.REGEAR_EDIT_PRICE)
    const regearSupported = await isRegearSupported(guildId)
    const regearFields = regearSupported
      ? normalizeCreateEventRegearFields(
          canManageRegearPolicy
            ? {
                category,
                regear_policy: source.regear_policy as EventRegearPolicy | null,
                regear_silver_cap: source.regear_silver_cap as number | null,
                regear_max_deaths_per_member: source.regear_max_deaths_per_member as number | null,
                regear_video_policy: source.regear_video_policy as EventRegearVideoPolicy | null,
                regear_video_payout_rate_percent:
                  source.regear_video_payout_rate_percent as number | null,
                regear_video_claim_ceiling_bonus_silver:
                  source.regear_video_claim_ceiling_bonus_silver as number | null,
                regear_video_rate_applies_without_proof:
                  source.regear_video_rate_applies_without_proof === true,
                regear_auto_policy: source.regear_auto_policy as EventRegearAutoPolicy | null,
                guest_regear_enabled: source.guest_regear_enabled === true,
              }
            : { category },
          tErr,
          canManageRegearPolicy,
        )
      : DISABLED_EVENT_REGEAR_FIELDS
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
        exclude_from_participation_stats: source.exclude_from_participation_stats === true,
        ...regearFields,
        // 복제는 늘 draft 로 시작 — 관리자가 날짜/공지 확인 후 명시적으로 발행.
        status: 'draft',
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (insErr) return { error: await publicActionError(insErr, 'actions/admin-event') }
    const newId = newEvent.id

    if (regearSupported && canManageRegearPolicy) {
      const { data: overrideRows, error: overrideErr } = await db
        .from('event_regear_role_overrides')
        .select('role_name, enabled, silver_cap, payout_rate_percent')
        .eq('guild_id', guildId)
        .eq('event_id', id)
      if (overrideErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: await publicActionError(overrideErr, 'actions/admin-event') }
      }
      if (overrideRows && overrideRows.length > 0) {
        const { error: copyOverrideErr } = await db
          .from('event_regear_role_overrides')
          .insert(
            overrideRows.map((row) => ({
              guild_id: guildId,
              event_id: newId,
              role_name: row.role_name,
              enabled: row.enabled,
              silver_cap: row.silver_cap,
              payout_rate_percent: row.payout_rate_percent,
              updated_by: session.discordId,
              updated_at: new Date().toISOString(),
            })),
          )
        if (copyOverrideErr) {
          await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
          return { error: await publicActionError(copyOverrideErr, 'actions/admin-event') }
        }
      }
    }

    const { data: buildDemands, error: buildDemandErr } = await db
      .from('event_build_role_demands')
      .select('party_number, role_type, required_count')
      .eq('guild_id', guildId)
      .eq('event_id', id)
    if (buildDemandErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return {
        error: await publicActionError(buildDemandErr, 'actions/admin-event'),
      }
    }
    if (buildDemands && buildDemands.length > 0) {
      const { error: copyDemandErr } = await db
        .from('event_build_role_demands')
        .insert(buildDemands.map((row) => ({ ...row, guild_id: guildId, event_id: newId })))
      if (copyDemandErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: await publicActionError(copyDemandErr, 'actions/admin-event') }
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
      return { error: await publicActionError(partyErr, 'actions/admin-event') }
    }

    if (!parties || parties.length === 0) {
      revalidatePath('/admin/dashboard')
      revalidatePath('/admin/dashboard/events')
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
      return {
        error: await publicActionError(
          newPartyErr ?? new Error('Party insert returned no rows'),
          'actions/admin-event',
        ),
      }
    }

    const oldToNewPartyId = new Map<string, string>()
    for (const oldParty of parties) {
      const match = newParties.find((np) => np.party_number === oldParty.party_number)
      if (match) oldToNewPartyId.set(oldParty.id, match.id)
    }

    // Copy reusable slot/build configuration only. Callers, assigned members
    // and pending preference applications must start empty in the new draft.
    const { data: slots, error: slotErr } = await db
      .from('slots')
      .select('*')
      .eq('guild_id', guildId)
      .in('party_id', parties.map((p) => p.id))
    if (slotErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: await publicActionError(slotErr, 'actions/admin-event') }
    }

    if (slots && slots.length > 0) {
      const newSlotRows = slots.flatMap((slot) => {
        const partyId = oldToNewPartyId.get(slot.party_id)
        return partyId
          ? [buildClonedSlotRow(slot as Record<string, unknown>, { guildId, partyId })]
          : []
      })
      const { error: insSlotErr } = await db.from('slots').insert(newSlotRows)
      if (insSlotErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: await publicActionError(insSlotErr, 'actions/admin-event') }
      }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
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
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    // 삭제 전 제목 캐싱 — audit details 에 남기기 위해.
    const { data: snapshot } = await db
      .from('events')
      .select('title, gather_at, battle_started_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (!snapshot) return { error: tErr('eventNotFound') }
    if (snapshot.battle_started_at) return { error: tErr('eventOperationalLocked') }
    // regear_requests keeps history via SET NULL (migration 005).
    const { error } = await db.from('events').delete().eq('guild_id', guildId).eq('id', id)
    if (error) return { error: await publicActionError(error, 'actions/admin-event') }
    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
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
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}

export async function startBattle(
  id: string,
  idempotencyKey?: string,
): Promise<{ startedAt?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await requireLiveSession().catch(() => null)
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const commandId = isApplicationCommandIdempotencyKey(idempotencyKey)
      ? idempotencyKey
      : crypto.randomUUID()
    const result = await executeEventStartApplicationCommand({
      guildId,
      actorDiscordId: session.discordId,
      actorUsername: session.username,
      source: 'web',
      correlationId: commandId,
      idempotencyKey: commandId,
      isAdmin: session.isAdmin,
      capabilities: parseCapabilities(session.capabilities),
      eventCreatorCategories: session.eventCreatorCategories,
    }, {
      eventId: id,
    })
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    return { startedAt: result.battleStartedAt }
  } catch (e) {
    if (e instanceof ApplicationCommandError) {
      if (e.code === 'event_not_found') return { error: tErr('eventNotFound') }
      if (e.code === 'event_not_published') return { error: tErr('eventNotPublished') }
      if (e.code === 'event_already_started') return { error: tErr('eventAlreadyStarted') }
      if (e.code === 'event_start_not_authorized') return { error: tErr('unauthorized') }
    }
    return { error: await publicActionError(e, 'actions/admin-event') }
  }
}
