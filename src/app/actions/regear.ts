'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { requireCurrentMutationSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { formatKillboardVerificationReason, verifyDeathInWindow } from '@/lib/killboard'
import { getAppSetting } from '@/lib/app-settings'
import { requireManualRegearAllowed } from '@/lib/albion-identity'
import {
  isAlbionIdentityRelation,
  type AlbionIdentityRelation,
} from '@/lib/account-albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import {
  findTrackedBattleIdsForEvent,
  findTrackedBattleIdsForEvents,
} from '@/lib/auto-regear-matching'
import { log } from '@/lib/log'
import { getMemberPointSummary } from '@/lib/point-ledger'
import {
  ALLOWED_MIME,
  MAX_SCREENSHOT_BYTES,
  SCREENSHOT_BUCKET,
  buildSnapshotFromRole,
  buildSnapshotFromSlot,
  computeMarketSilverFromItems,
  computeRegearEligibilityDeadlineMs,
  computeManualRegearWindowOpenMs,
  isRegearEligibilityExpired,
  latestEndedMsOf,
  normalizeBreakdownItems,
  type RawBreakdown,
  type RegearLineItem,
} from '@/lib/regear-helpers'
import { EVENT_CATEGORIES, type BuildSnapshot, type EventCategory, type RegearType, type SlotGearDisplay } from '@/types'
import {
  isRegearRejectReasonCode,
  type RegearRejectReasonCode,
} from '@/lib/regear-reject-reasons'
import {
  countsTowardDeathLimit,
  isOverchargeVideoProofMissing,
  shouldListManualRegearEligibleEvent,
} from '@/lib/regear-request-policy'
import {
  getAdminNotificationTranslations,
  sendAdminNotification,
} from '@/lib/admin-notifications'
import { validateImageUploadFile } from '@/lib/image-upload'
import {
  buildManualRegearEligibilityRoleMap,
  buildRegearEventRoleMap,
} from '@/lib/regear-eligible-events'
import {
  applyOverchargePayoutRate,
  materializeRegearPolicySnapshot,
  parseRegearPolicySnapshot,
  regearRolePolicyResolutionFromSnapshot,
  resolveEventRegearPolicy,
  resolveSnapshotClaimCeilingSilver,
  resolveSnapshotPayoutRatePercent,
  type EventRegearPolicy,
  type RegearPolicySnapshot,
} from '@/lib/regear-event-policy'
import {
  ensureCurrentSlotEventRegearPolicySnapshot,
  loadEventParticipantEffectivePolicy,
} from '@/lib/regear-effective-policy-server'
import {
  craftRegearSlots,
  parseCraftIncludeCapeFormValue,
} from '@/lib/regear-craft-slots'
import { normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { fetchYoutubeVideoProofTitle } from '@/lib/regear-video-proof-metadata'
import {
  parseAllianceContentRegearLinkInput,
  type AllianceContentRegearSubmitStatus,
} from '@/lib/alliance-content-regear-video'
import { submitRegearVideoForAllianceContent } from '@/lib/alliance-content-regear-submit'
import { resolveRegearClaimCeilingSilver } from '@/lib/regear-claim-ceiling'
import { resolveRegearPayoutRatePercent } from '@/lib/regear-payout'
import {
  createRequesterRegearRolePolicyResolver,
  resolveRequesterRegearRolePolicy,
} from '@/lib/regear-role-policy-data'
import { resolveRequesterRegearRoleRateFloor } from '@/lib/regear-role-rate-floor-data'
import { toRegearDiscordRoleRateFloorSnapshot } from '@/lib/regear-role-rate-floor'
import {
  isRegearRolePolicyZeroReview,
  resolveRegearRolePolicy,
  roleGroupFromSlotRole,
} from '@/lib/regear-role-policy'
import {
  isSameStableMemberOwner,
  resolveStableMemberOwnership,
} from '@/lib/stable-member-ownership'
import type {
  RegearRolePolicyMatchStatus,
  RegearRolePolicyResolution,
} from '@/lib/regear-role-policy'
import {
  loadOverchargePayoutRatePercent,
  loadPayoutRatePercent,
  loadVideoClaimCeilingBonusSilver,
  loadVideoPayoutRatePercent,
} from './regear-admin-types'
import { isRegearIntakeEnabled } from '@/lib/regear-support-server'
import { consumeEventGuestRequestBudget } from '@/lib/event-guest-security'
import {
  isRegearParticipantConfirmationStatus,
  type RegearParticipantConfirmationStatus,
} from '@/lib/regear-participant-confirmation'

// User-facing regear actions. Admin-side lives in `regear-admin.ts`,
// member-side inline edit actions in `regear-edit.ts`.
// 공유 헬퍼 (snapshot/normalize/compute) 와 스크린샷 상수는 `@/lib/regear-helpers`.

// 결과 타입은 importer 호환을 위해 re-export. 'use server' 파일에서 값
// re-export 는 Turbopack 이 async 여부를 보장 못해 거부 — 액션 함수는
// 직접 `@/app/actions/regear-edit` 에서 import 하도록 호출 측을 변경했다.
export type { RegearLineItem } from '@/lib/regear-helpers'
export type { UpdateLineItemResult } from '@/app/actions/regear-edit'

const DEFAULT_REGEAR_WINDOW_MINUTES = 60
const DEFAULT_MAX_DEATHS_PER_EVENT = 1
// 신청 가능한 리기어가 적격 리스트에 머무는 기간(일). 이 시간이 지난 사망/이벤트는
// /regear 의 "신청 가능" 섹션에서 사라진다 (행 자체는 지우지 않음 — 통계·이력
// 보존). 기본 14일.
const DEFAULT_ELIGIBILITY_DAYS = 14
const MIN_ELIGIBILITY_DAYS = 1
const MAX_ELIGIBILITY_DAYS = 90

function rolePolicyReviewNote(
  tRegear: Awaited<ReturnType<typeof getTranslations>>,
  resolution: RegearRolePolicyResolution,
): string | null {
  if (!resolution.enabled) return null
  if (resolution.matchStatus === 'no_match') return tRegear('rolePolicyNoMatchNote')
  if (resolution.matchStatus === 'roles_unavailable') {
    return tRegear('rolePolicyRolesUnavailableNote')
  }
  if (resolution.matchStatus === 'matched' && resolution.silverCap === 0) {
    return tRegear('rolePolicyZeroCapNote', {
      role: resolution.matchedPolicy?.discordRoleName ?? '',
    })
  }
  return null
}

function rolePolicySnapshotColumns(resolution: RegearRolePolicyResolution): {
  regear_role_group: string
  regear_role_policy_enabled: boolean
  regear_role_policy_match_status: RegearRolePolicyMatchStatus
  regear_role_policy_discord_role_id: string | null
  regear_role_policy_discord_role_name: string | null
  regear_role_policy_silver_cap: number | null
  regear_role_policy_member_role_ids: string[] | null
} {
  return {
    regear_role_group: resolution.roleGroup,
    regear_role_policy_enabled: resolution.enabled,
    regear_role_policy_match_status: resolution.matchStatus,
    regear_role_policy_discord_role_id: resolution.matchedPolicy?.discordRoleId ?? null,
    regear_role_policy_discord_role_name: resolution.matchedPolicy?.discordRoleName ?? null,
    regear_role_policy_silver_cap: resolution.enabled ? resolution.silverCap : null,
    regear_role_policy_member_role_ids: resolution.enabled ? resolution.memberRoleIds : null,
  }
}

function screenshotUploadErrorMessage(
  tErr: Awaited<ReturnType<typeof getTranslations>>,
  error: 'missing' | 'empty' | 'tooLarge' | 'wrongType',
): string {
  switch (error) {
    case 'missing':
    case 'empty':
      return tErr('screenshotMissing')
    case 'tooLarge':
      return tErr('screenshotTooLarge')
    case 'wrongType':
      return tErr('screenshotWrongType')
  }
}

async function loadRegearLimits(
  guildId: string,
): Promise<{ windowMinutes: number; maxDeaths: number; eligibilityDays: number }> {
  const [windowRaw, maxRaw, eligibilityRaw] = await Promise.all([
    getAppSetting('regear_window_minutes', String(DEFAULT_REGEAR_WINDOW_MINUTES), guildId),
    getAppSetting('regear_max_deaths_per_event', String(DEFAULT_MAX_DEATHS_PER_EVENT), guildId),
    getAppSetting('regear_eligibility_days', String(DEFAULT_ELIGIBILITY_DAYS), guildId),
  ])
  const windowParsed = Number(windowRaw)
  const maxParsed = Number(maxRaw)
  const eligibilityParsed = Number(eligibilityRaw)
  const eligibilityDays =
    Number.isFinite(eligibilityParsed) &&
    eligibilityParsed >= MIN_ELIGIBILITY_DAYS &&
    eligibilityParsed <= MAX_ELIGIBILITY_DAYS
      ? Math.floor(eligibilityParsed)
      : DEFAULT_ELIGIBILITY_DAYS
  return {
    windowMinutes: Number.isFinite(windowParsed) && windowParsed >= 1 ? Math.floor(windowParsed) : DEFAULT_REGEAR_WINDOW_MINUTES,
    maxDeaths: Number.isFinite(maxParsed) && maxParsed >= 1 ? Math.floor(maxParsed) : DEFAULT_MAX_DEATHS_PER_EVENT,
    eligibilityDays,
  }
}

// 길드 unauthenticated/세션 부재 fallback 에서 사용. UI 가 정상 토글 값을 알 수
// 없을 때 안전 기본값으로 degrade.
const DEFAULT_REGEAR_LIMITS: RegearLimits = {
  windowMinutes: DEFAULT_REGEAR_WINDOW_MINUTES,
  maxDeaths: DEFAULT_MAX_DEATHS_PER_EVENT,
  eligibilityDays: DEFAULT_ELIGIBILITY_DAYS,
}

// regear-tracked-deaths.ts 에서 동일 컷을 적용해야 하므로 export.
export async function getRegearEligibilityDays(guildId: string): Promise<number> {
  const { eligibilityDays } = await loadRegearLimits(guildId)
  return eligibilityDays
}

export interface MyRegearRequest {
  id: string
  event_id: string
  event_title: string
  role_name: string
  base_silver: number | null
  silver: number
  regear_role_group: string | null
  regear_role_policy_enabled: boolean
  regear_role_policy_match_status: RegearRolePolicyMatchStatus
  regear_role_policy_discord_role_name: string | null
  request_type: RegearType
  claimed_silver: number | null
  // Actual credited amount for approved rows (migration 044). NULL for pending/rejected.
  payout_silver: number | null
  video_proof_url: string | null
  video_proof_title: string | null
  status: 'pending' | 'approved' | 'rejected'
  killboard_verified: boolean
  admin_notes: string | null
  // 마이그 151. 거절 시 enum 코드. status='rejected' row 만 채워지고 그 외엔 null.
  // UI 가 `regearRejectReason.{code}` 로 i18n 라벨화해 멤버에게 노출.
  reject_reason_code: RegearRejectReasonCode | null
  created_at: string
  resolved_at: string | null
  handled_by_username: string | null
  build_snapshot: BuildSnapshot | null
  // 자동 생성 여부 — true 이면 status=pending 동안 청구자가 부위별 가격을 수정할 수 있다.
  auto_generated: boolean
  requester_relation: AlbionIdentityRelation
  participant_confirmation_status: RegearParticipantConfirmationStatus
}

export interface MyPointsSummary {
  balance: number
  lifetimeEarned: number
  lifetimeSpent: number
}

export interface RegearEligibleEvent {
  id: string
  title: string
  gather_time: string
  gather_at: string | null
  gather_location: string
  battle_started_at: string
  role_name: string
  role_reward: number
  role_payout_rate_percent: number | null
  overcharge_payout_rate_percent: number
  role_policy_enabled: boolean
  role_policy_match_status: RegearRolePolicyMatchStatus
  role_policy_discord_role_name: string | null
  role_policy_silver_cap: number | null
  video_payout_rate_percent: number
  video_claim_ceiling_bonus_silver: number
  video_rate_applies_without_proof: boolean
  max_deaths_per_member: number
  regear_policy: EventRegearPolicy
  // Non-rejected death regear requests the current user already has for this event.
  // Overcharge requests do not consume this count.
  existing_active_count: number
  // Most recent pending auto-generated request id for this event/member.
  // When set, the page renders a read-only "auto submitted" card variant —
  // members aren't expected to file a manual claim on top of an auto pending.
  auto_request_id: string | null
  // ISO 시각: 참가 확정 이벤트는 운영 시작 즉시, 레거시 이벤트는 킬보드
  // 인덱싱 대기 시간이 지난 뒤 신청 가능하다.
  window_open_at: string
  // ISO 시각: 이벤트 시작 기준 신청 마감. 자유 리기어(트래킹 사망)와 같은
  // regear_eligibility_days 정책을 수동 이벤트 리기어에도 적용한다.
  deadline_at: string
  // 리기어 대상 전투가 연합 의무의 3개 확정 세션 중 하나와 정확히 겹치면
  // 클라이언트가 해당 세션을 자동 선택한다. 서버 RPC 가 최종 소속을 재검증한다.
  matched_albion_battle_ids: number[]
  participant_confirmation_status: RegearParticipantConfirmationStatus
}

export interface RegearRequestActionResult {
  error?: string
  id?: string
  allianceContentVideoStatus?: AllianceContentRegearSubmitStatus
}

export interface RegearLimits {
  windowMinutes: number
  maxDeaths: number
  // /regear 적격 리스트(이벤트 매칭/이벤트 외 트래킹 사망)에서 항목이 사라지기까지의
  // 일 수. 행을 삭제하지는 않고 클라이언트에 노출되는 "신청 가능" 컬렉션만 컷.
  eligibilityDays: number
}

// Exposed to the regear page so it can render the window/cap labels and
// decide button state without re-reading app_settings from the client bundle.
// 세션이 없으면 기본값으로 degrade — /regear 는 session gate 가 리다이렉트하지만
// 호출 타이밍 상 session 이 비어 있을 수 있는 경로에서도 안전하게 응답.
export async function getRegearLimits(): Promise<RegearLimits> {
  const session = await getSession()
  if (!session) {
    return DEFAULT_REGEAR_LIMITS
  }
  const guildId = await getSessionGuildId(session)
  return loadRegearLimits(guildId)
}

export async function requestRegear(
  formData: FormData,
): Promise<RegearRequestActionResult> {
  try {
    return await requestRegearInner(formData)
  } catch (err) {
    // /regear/error.tsx 가 뜨는 회귀 방지 — 예상 못한 throw 는 로그만 남기고
    // 일반 에러 토스트로 전환. 발생 시 로그에서 진단 가능.
    log.error('[requestRegear] unhandled error', err)
    const tErr = await getTranslations('memberActionError')
    return { error: tErr('serverError') }
  }
}

async function requestRegearInner(
  formData: FormData,
): Promise<RegearRequestActionResult> {
  const tErr = await getTranslations('memberActionError')
  const tKillboard = await getTranslations('killboardVerify')
  const tRegear = await getTranslations('regear')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  const eventId = String(formData.get('eventId') ?? '')
  if (!eventId) return { error: tErr('missingEventInfo') }
  const isScopedGuest =
    session.isGuest === true &&
    session.eventScope === eventId
  if (!session.isMember && !isScopedGuest) return { error: tErr('memberOnly') }
  const guildId = await getSessionGuildId(session)
  if (!(await isRegearIntakeEnabled(guildId))) {
    return { error: tErr('regearSupportDisabled') }
  }
  const requireVerification =
    !isScopedGuest &&
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  let requesterRelation: AlbionIdentityRelation = isScopedGuest
    ? 'external'
    : 'unknown'
  if (requireVerification) {
    const gate = await requireManualRegearAllowed(session.discordId, guildId)
    requesterRelation = gate.relation
    if (gate.error) return { error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${gate.error}` }
  }

  const file = formData.get('screenshot')
  const file2 = formData.get('screenshot2')
  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
  const videoProofRaw = String(formData.get('videoProofUrl') ?? '').trim()
  const videoProofUrl = videoProofRaw ? normalizeYoutubeVideoProofUrl(videoProofRaw) : null
  if (videoProofRaw && !videoProofUrl) return { error: tErr('invalidVideoProofUrl') }
  const allianceContentLink = parseAllianceContentRegearLinkInput(formData)
  // 'death' (default) | 'overcharge'. overcharge 는 길드 정책 토글이 켜져
  // 있을 때만 허용 — UI 가 옵션을 숨기더라도 직접 폼 조작을 막기 위해 서버에서
  // 재검증한다. 다른 값은 silently 'death' 로 fallback.
  const requestTypeRaw = String(formData.get('requestType') ?? 'death')
  const requestType: RegearType = requestTypeRaw === 'overcharge' ? 'overcharge' : 'death'
  if (isScopedGuest && requestType !== 'death') {
    return { error: tErr('guestRegearDeathOnly') }
  }
  if (requestType === 'overcharge') {
    const [overchargeEnabledRaw, overchargeVideoRequiredRaw] = await Promise.all([
      getAppSetting('regear_overcharge_enabled', 'false', guildId),
      getAppSetting('regear_overcharge_video_required', 'false', guildId),
    ])
    const overchargeEnabled = overchargeEnabledRaw === 'true'
    if (!overchargeEnabled) return { error: tErr('overchargeDisabled') }
    if (
      isOverchargeVideoProofMissing({
        entries: [{ requestType }],
        videoRequired: overchargeVideoRequiredRaw === 'true',
        hasVideoProof: Boolean(videoProofUrl),
      })
    ) {
      return { error: tErr('overchargeVideoRequired') }
    }
  }
  const overchargePayoutRatePercent =
    requestType === 'overcharge'
      ? await loadOverchargePayoutRatePercent(guildId)
      : null
  // 청구 방식은 길드 단위 강제. craft_regear_enabled='true' 면 모든 신규 요청이
  // 'crafted', 'false' 면 'silver'. 멤버는 모드를 선택할 수 없다 (기존 form
  // 'fulfillmentMode' 필드는 무시).
  const craftEnabled =
    (await getAppSetting('craft_regear_enabled', 'false', guildId)) === 'true'
  const fulfillmentMode: 'silver' | 'crafted' = craftEnabled ? 'crafted' : 'silver'
  const craftRequestedSlots = craftEnabled
    ? craftRegearSlots(parseCraftIncludeCapeFormValue(formData.get('craftIncludeCape')))
    : null
  const image = await validateImageUploadFile(file, {
    allowedTypes: ALLOWED_MIME,
    maxBytes: MAX_SCREENSHOT_BYTES,
  })
  if (!image.ok) return { error: screenshotUploadErrorMessage(tErr, image.error) }
  // 두 번째 스크린샷은 선택 사항 — 제출 된 경우에만 검증.
  const hasFile2 = file2 instanceof File && file2.size > 0
  const image2 = hasFile2
    ? await validateImageUploadFile(file2, {
        allowedTypes: ALLOWED_MIME,
        maxBytes: MAX_SCREENSHOT_BYTES,
      })
    : null
  if (hasFile2) {
    if (!image2?.ok) return { error: screenshotUploadErrorMessage(tErr, image2?.error ?? 'wrongType') }
  }

  const db = getAdminClient()
  const ownership = isScopedGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/regear') }
  }

  // 1) Resolve the event first so FF/ganking can use the event-local regear
  //    participant list instead of the constantly changing party slots.
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, battle_started_at, category, regear_policy, regear_silver_cap, regear_max_deaths_per_member, regear_video_policy, regear_video_payout_rate_percent, regear_video_claim_ceiling_bonus_silver, regear_video_rate_applies_without_proof, regear_auto_policy, regear_policy_version_id, guest_regear_enabled, participation_closeout_required')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .single()
  if (eventError) return { error: await publicActionError(eventError, 'actions/regear') }
  let requesterDisplayName = session.username
  let requesterCharacterName = session.username
  if (isScopedGuest) {
    const withinBudget = await consumeEventGuestRequestBudget({
      db,
      headers: await headers(),
      guildId,
      eventId,
      action: 'regear',
      subject: session.discordId,
      bucketSeconds: 900,
      limit: 8,
    }).catch(() => false)
    if (!withinBudget) return { error: tErr('guestTemporarilyLimited') }
    if (event.guest_regear_enabled !== true) {
      return { error: tErr('guestRegearDisabled') }
    }
    const [{ data: application, error: applicationError }, { data: profile, error: profileError }] =
      await Promise.all([
        db
          .from('event_guest_applications')
          .select('status')
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .eq('guest_id', session.discordId)
          .maybeSingle(),
        db
          .from('event_guest_profiles')
          .select('display_name, albion_character_name')
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .eq('discord_id', session.discordId)
          .maybeSingle(),
      ])
    if (applicationError) {
      return { error: await publicActionError(applicationError, 'actions/regear') }
    }
    if (profileError) {
      return { error: await publicActionError(profileError, 'actions/regear') }
    }
    if (application?.status !== 'assigned' || !profile?.albion_character_name) {
      return { error: tErr('guestApplicationRequired') }
    }
    requesterDisplayName =
      profile.display_name?.trim() || session.username
    requesterCharacterName = profile.albion_character_name.trim()
  }
  if (event.participation_closeout_required === true) {
    let participantQuery = db
      .from('event_participation_closeout_entries')
      .select('id')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('decision', 'included')
    participantQuery = ownership.guildMemberId
      ? participantQuery.eq('guild_member_id', ownership.guildMemberId)
      : participantQuery.eq('discord_id', session.discordId)
    const [closeoutResult, participantResult] = await Promise.all([
      db
        .from('event_participation_closeouts')
        .select('id')
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
        .maybeSingle(),
      participantQuery.maybeSingle(),
    ])
    if (closeoutResult.error) {
      return { error: await publicActionError(closeoutResult.error, 'actions/regear') }
    }
    if (participantResult.error) {
      return { error: await publicActionError(participantResult.error, 'actions/regear') }
    }
    // Before closeout, the immutable event policy snapshot is the provisional
    // intake boundary. Once closeout exists, only included participants remain
    // eligible. The insert trigger repeats this check to close the race.
    if (closeoutResult.data && !participantResult.data) {
      return { error: tErr('actualParticipantRequired') }
    }
  }
  const eventCategory: EventCategory = EVENT_CATEGORIES.includes(event.category as EventCategory)
    ? (event.category as EventCategory)
    : '전투'
  const usesEventParticipantList = eventCategory !== '전투'
  let frozenParticipantPolicy = event.regear_policy_version_id
    ? await loadEventParticipantEffectivePolicy({
        db,
        guildId,
        eventId,
        discordId: session.discordId,
      })
    : null
  if (
    event.regear_policy_version_id &&
    !frozenParticipantPolicy &&
    event.category === '전투'
  ) {
    try {
      frozenParticipantPolicy = await ensureCurrentSlotEventRegearPolicySnapshot({
        db,
        guildId,
        eventId,
        discordId: session.discordId,
      })
    } catch (snapshotError) {
      log.error('[requestRegear] missing slot policy snapshot repair failed', snapshotError, {
        tenant_id: guildId,
        event_id: eventId,
        discord_id: session.discordId,
      })
    }
  }
  if (
    (event.regear_policy_version_id || isScopedGuest) &&
    !frozenParticipantPolicy
  ) {
    return { error: tErr('eventRegearPolicyUnavailable') }
  }

  // Legacy combat events still require a current assigned slot. Frozen events
  // use the participant identity/role captured at start; the current slot is
  // read only as an optional gear template for crafted fulfillment.
  let slotQuery = db
    .from('slots')
    .select(
      'role_name, manual_regear_excluded, weapon_name, weapon_id, head_name, head_id, armor_name, armor_id, shoes_name, shoes_id, offhand_name, offhand_id, potion_name, potion_id, food_name, food_id, cape_name, cape_id, mount_name, mount_id, assigned_weapon_name, assigned_weapon_id, assigned_head_name, assigned_head_id, assigned_armor_name, assigned_armor_id, assigned_shoes_name, assigned_shoes_id, assigned_offhand_name, assigned_offhand_id, assigned_potion_name, assigned_potion_id, assigned_food_name, assigned_food_id, assigned_cape_name, assigned_cape_id, assigned_mount_name, assigned_mount_id, parties!inner(event_id)',
    )
    .eq('guild_id', guildId)
    .eq('parties.event_id', eventId)
  slotQuery = ownership.guildMemberId
    ? slotQuery.eq('assigned_guild_member_id', ownership.guildMemberId)
    : slotQuery.eq('assigned_discord_id', session.discordId)
  const { data: slot, error: slotError } = await slotQuery
    .limit(1)
    .maybeSingle()
  if (slotError) return { error: await publicActionError(slotError, 'actions/regear') }

  let roleName = ''
  let buildSnapshot: BuildSnapshot
  if (frozenParticipantPolicy) {
    roleName = frozenParticipantPolicy.roleName.trim()
    if (!roleName) return { error: tErr('slotRoleMissing') }
    buildSnapshot = slot
      ? buildSnapshotFromSlot(slot as unknown as SlotGearDisplay, roleName)
      : buildSnapshotFromRole(roleName)
  } else if (usesEventParticipantList) {
    let participantQuery = db
      .from('event_regear_participants')
      .select('role_name')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    participantQuery = ownership.guildMemberId
      ? participantQuery.eq('guild_member_id', ownership.guildMemberId)
      : participantQuery.eq('discord_id', session.discordId)
    const { data: participant, error: participantError } = await participantQuery
      .maybeSingle()
    if (participantError) return { error: await publicActionError(participantError, 'actions/regear') }
    roleName = (participant?.role_name ?? '').trim()
    if (!roleName) return { error: tErr('eventRegearParticipantRequired') }
    buildSnapshot = slot
      ? buildSnapshotFromSlot(slot as unknown as SlotGearDisplay, roleName)
      : buildSnapshotFromRole(roleName)
  } else {
    if (!slot) return { error: tErr('noAssignedSlot') }
    if (slot.manual_regear_excluded === true) return { error: tErr('manualRegearExcluded') }
    roleName = (slot.role_name ?? '').trim()
    if (!roleName) return { error: tErr('slotRoleMissing') }
    buildSnapshot = buildSnapshotFromSlot(slot as unknown as SlotGearDisplay, roleName)
  }

  const { windowMinutes, maxDeaths: globalMaxDeaths, eligibilityDays } = await loadRegearLimits(guildId)

  // 2) Submission gate — 참가 확정 이벤트는 운영 시작 시 고정된 정책 스냅샷을
  //    기준으로 임시 신청을 즉시 받는다. 확정 전 승인·지급은 DB가 계속 차단한다.
  //    레거시 이벤트만 기존 킬보드 인덱싱 대기 규칙을 유지한다.
  if (!event.battle_started_at) {
    return { error: tErr('battleNotStarted') }
  }
  const battleStartMs = new Date(event.battle_started_at).getTime()
  if (isRegearEligibilityExpired(battleStartMs, eligibilityDays)) {
    return { error: tErr('regearEligibilityExpired', { days: eligibilityDays }) }
  }
  let latestEndedMs = 0
  if (event.participation_closeout_required !== true) {
    // 레거시 이벤트의 전투 종료 기반 조기 오픈에만 추적 전투 조회가 필요하다.
    // 조회 실패 시 battle_started_at + windowMinutes 로 안전하게 폴백한다.
    try {
      const matchedBattles = await findTrackedBattleIdsForEvent(
        db,
        guildId,
        event.battle_started_at,
      )
      latestEndedMs = latestEndedMsOf(matchedBattles)
    } catch (err) {
      log.error('[requestRegear] findTrackedBattleIdsForEvent failed', err, {
        tenant_id: guildId,
        event_id: eventId,
      })
    }
  }
  const windowOpenMs = computeManualRegearWindowOpenMs({
    battleStartMs,
    latestEndedMs,
    windowMinutes,
    participantCloseoutRequired: event.participation_closeout_required === true,
  })
  if (Date.now() < windowOpenMs) {
    return { error: tErr('regearWindowNotOpen', { minutes: windowMinutes }) }
  }

  // 3) New events use the immutable participant snapshot captured at start.
  // Legacy events deliberately keep the old resolver so existing operations
  // are not reinterpreted during rollout.
  let rolePolicyResolution: RegearRolePolicyResolution
  let policySnapshot: RegearPolicySnapshot
  let baseSilver: number
  let silver: number
  let maxDeaths: number
  if (frozenParticipantPolicy) {
    const frozen = frozenParticipantPolicy.manualPolicy
    if (frozen.enabled === false) {
      if (frozen.disabledReason === 'event') return { error: tErr('eventRegearDisabled') }
      if (frozen.disabledReason === 'invalid_event') {
        return { error: tErr('eventRegearLimitInvalid') }
      }
      if (frozen.disabledReason === 'slot_excluded') {
        return { error: tErr('manualRegearExcluded') }
      }
      return { error: tErr('ceilingNotSetForRole') }
    }
    rolePolicyResolution = regearRolePolicyResolutionFromSnapshot(frozen, roleName)
    policySnapshot = materializeRegearPolicySnapshot(frozen, Boolean(videoProofUrl))
    baseSilver = frozen.baseCapSilver
    silver = resolveSnapshotClaimCeilingSilver(
      frozen,
      Boolean(videoProofUrl),
      frozen.baseCapSilver,
    )
    maxDeaths = frozen.maxDeathsPerMember
  } else {
    const [
      { data: reward, error: rewardError },
      { data: roleOverride, error: roleOverrideError },
      baseRatePercent,
      videoRatePercent,
      videoClaimCeilingBonusSilver,
    ] = await Promise.all([
      db
        .from('role_rewards')
        .select('silver, payout_rate_percent')
        .eq('guild_id', guildId)
        .eq('role_name', roleName)
        .maybeSingle(),
      db
        .from('event_regear_role_overrides')
        .select('enabled, silver_cap, payout_rate_percent')
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
        .eq('role_name', roleName)
        .maybeSingle(),
      loadPayoutRatePercent(guildId),
      loadVideoPayoutRatePercent(guildId),
      loadVideoClaimCeilingBonusSilver(guildId),
    ])
    if (rewardError) return { error: await publicActionError(rewardError, 'actions/regear') }
    if (roleOverrideError) return { error: await publicActionError(roleOverrideError, 'actions/regear') }
    const [legacyRolePolicy, rateFloorResolution] = await Promise.all([
      resolveRequesterRegearRolePolicy({
        db,
        guildId,
        discordId: session.discordId,
        roleName,
        fallbackSilverCap: reward?.silver ?? 0,
      }),
      resolveRequesterRegearRoleRateFloor({
        db,
        guildId,
        discordId: session.discordId,
      }),
    ])
    if (legacyRolePolicy.error) return { error: legacyRolePolicy.error }
    if (rateFloorResolution.error) return { error: rateFloorResolution.error }
    rolePolicyResolution = legacyRolePolicy
    const resolvedPolicy = resolveEventRegearPolicy({
      category: eventCategory,
      eventPolicy: event.regear_policy,
      eventSilverCap: event.regear_silver_cap,
      eventMaxDeathsPerMember: event.regear_max_deaths_per_member,
      eventVideoPolicy: event.regear_video_policy,
      eventVideoPayoutRatePercent: event.regear_video_payout_rate_percent,
      eventVideoClaimCeilingBonusSilver: event.regear_video_claim_ceiling_bonus_silver,
      eventVideoRateAppliesWithoutProof: event.regear_video_rate_applies_without_proof,
      eventAutoPolicy: event.regear_auto_policy,
      roleSilver: reward?.silver ?? 0,
      rolePayoutRatePercent: reward?.payout_rate_percent ?? null,
      discordRolePolicy: rolePolicyResolution,
      discordRoleRateFloor: toRegearDiscordRoleRateFloorSnapshot(
        rateFloorResolution.matched,
      ),
      useMaximumVideoPayoutRate: rateFloorResolution.configured,
      roleOverride: roleOverride
        ? {
            enabled: roleOverride.enabled === true,
            silverCap: roleOverride.silver_cap ?? null,
            payoutRatePercent: roleOverride.payout_rate_percent ?? null,
          }
        : null,
      guildBasePayoutRatePercent: baseRatePercent,
      guildVideoPayoutRatePercent: videoRatePercent,
      guildVideoClaimCeilingBonusSilver: videoClaimCeilingBonusSilver,
      globalMaxDeaths,
      hasVideoProof: Boolean(videoProofUrl),
      flow: 'manual',
    })
    if (!resolvedPolicy.enabled) {
      if (resolvedPolicy.disabledReason === 'event') return { error: tErr('eventRegearDisabled') }
      if (resolvedPolicy.disabledReason === 'invalid_event') {
        return { error: tErr('eventRegearLimitInvalid') }
      }
      return { error: tErr('ceilingNotSetForRole') }
    }
    policySnapshot = resolvedPolicy.snapshot
    baseSilver = resolvedPolicy.baseSilverCap
    silver = resolvedPolicy.silverCap
    maxDeaths = resolvedPolicy.maxDeathsPerMember
  }
  if (requestType === 'overcharge' && overchargePayoutRatePercent !== null) {
    policySnapshot = applyOverchargePayoutRate(
      policySnapshot,
      policySnapshot.overchargePayoutRatePercent ?? overchargePayoutRatePercent,
    )
  }

  // 4) Supersede policy: pending 자동 리기어 행이 있으면 반려로 밀어내고 수동
  //    death 를 받는다. 자동이 cron 에서 선행되어 pending 으로 자리 잡았더라도, 실제
  //    사망한 유저가 직접 신청서를 올리는 쪽을 최종 소스 오브 트루스로 취급.
  //    오버차지는 사망이 아니므로 자동 death row 를 대체하지 않는다.
  //    비고 컬럼에 사유를 남겨 관리자/청구자가 내역에서 구분 가능.
  if (requestType === 'death') {
    let supersedeQuery = db
      .from('regear_requests')
      .update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        admin_notes: tRegear('autoSupersededByManual'),
      })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('auto_generated', true)
      .eq('request_type', 'death')
      .eq('status', 'pending')
    supersedeQuery = ownership.guildMemberId
      ? supersedeQuery.eq('guild_member_id', ownership.guildMemberId)
      : supersedeQuery.eq('discord_id', session.discordId)
    const { error: supersedeError } = await supersedeQuery
    if (supersedeError) return { error: await publicActionError(supersedeError, 'actions/regear') }

    // Non-rejected death rows count toward the event-specific limit so a user
    // can re-submit after a rejection but can't spam past the configured cap.
    let activeCountQuery = db
      .from('regear_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('request_type', 'death')
      .neq('status', 'rejected')
    activeCountQuery = ownership.guildMemberId
      ? activeCountQuery.eq('guild_member_id', ownership.guildMemberId)
      : activeCountQuery.eq('discord_id', session.discordId)
    const { count: activeCount, error: countError } = await activeCountQuery
    if (countError) return { error: await publicActionError(countError, 'actions/regear') }
    if ((activeCount ?? 0) >= maxDeaths) {
      return { error: tErr('regearDeathsLimitReached', { max: maxDeaths }) }
    }
  }

  // 4a) Validate the member's claimed amount against the ceiling.
  const claimedSilver = Number(claimedSilverRaw.replace(/,/g, '').trim())
  const forceZeroReview = isRegearRolePolicyZeroReview(rolePolicyResolution)
  if (
    !Number.isFinite(claimedSilver) ||
    !Number.isInteger(claimedSilver) ||
    claimedSilver < 0 ||
    (!forceZeroReview && claimedSilver <= 0)
  ) {
    return { error: tErr('invalidClaimAmount') }
  }
  if (forceZeroReview && claimedSilver > 0) {
    return { error: tErr('claimOverCeiling', { ceiling: '0' }) }
  }
  if (!forceZeroReview && claimedSilver > silver) {
    return { error: tErr('claimOverCeiling', { ceiling: silver.toLocaleString() }) }
  }
  const storedClaimedSilver = forceZeroReview ? 0 : claimedSilver
  const videoProofTitle = await fetchYoutubeVideoProofTitle(videoProofUrl)

  // 5) Upload screenshot first — if the DB insert below fails, an orphaned
  //    file is far cheaper to clean up than a phantom request row.
  const path = `${guildId}/${session.discordId}/${eventId}-${Date.now()}.${image.ext}`
  const { error: uploadError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, image.file, { contentType: image.mime, upsert: false })
  if (uploadError) return { error: await publicActionError(uploadError, 'actions/regear') }

  // 5a) 두 번째 스크린샷이 있으면 같은 버킷에 업로드. 파일명은 첫 번째 경로에
  //     `-2` 접미사를 붙여 쌍 관계를 쉽게 파악할 수 있게 한다. 업로드 실패 시
  //     앞서 올린 첫 번째 파일도 같이 지워 고아 파일을 남기지 않는다.
  let path2: string | null = null
  if (image2?.ok) {
    path2 = `${guildId}/${session.discordId}/${eventId}-${Date.now()}-2.${image2.ext}`
    const { error: upload2Error } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path2, image2.file, { contentType: image2.mime, upsert: false })
    if (upload2Error) {
      await db.storage.from(SCREENSHOT_BUCKET).remove([path])
      return { error: await publicActionError(upload2Error, 'actions/regear') }
    }
  }

  // 6) Killboard verification (hint-only — admin still reviews). We look from
  //    battle start up to now; the submission itself is already gated behind
  //    the collection delay, so the killboard should have the death indexed.
  //    overcharge 신청은 죽음이 발생하지 않으므로 검증을 건너뛴다 — killboard 에
  //    매치될 일이 없고, false negative 가 admin_notes 로 노이즈를 만든다.
  const kbResult =
    requestType === 'overcharge'
      ? {
          verified: false,
          matchedEventId: null,
          reason: null,
          reasonCode: null,
          reasonValues: null,
          matchedEquipment: null,
        }
      : await verifyDeathInWindow(
          requesterCharacterName,
          new Date(battleStartMs).toISOString(),
          new Date().toISOString(),
          { guildId },
        )
  const killboardNote = formatKillboardVerificationReason(kbResult, tKillboard)
  const policyNote = rolePolicyReviewNote(tRegear, rolePolicyResolution)
  const adminNotes = [killboardNote, policyNote].filter(Boolean).join('\n') || null

  // 7) Insert the request. request_type 는 mig 010 에서 추가된 컬럼.
  //    mig 018 이 type-branched check 를 풀어서 application 흐름은 통일됐고,
  //    이 컬럼은 라벨/감사용으로 보존된다.
  const { data: inserted, error: insertError } = await db
    .from('regear_requests')
    .insert({
      guild_id: guildId,
      event_id: eventId,
      event_title_snapshot: event.title,
      discord_id: session.discordId,
      username: requesterDisplayName,
      role_name: roleName,
      base_silver: baseSilver,
      silver,
      claimed_silver: storedClaimedSilver,
      video_proof_url: videoProofUrl,
      video_proof_title: videoProofTitle,
      request_type: requestType,
      screenshot_path: path,
      screenshot_path_2: path2,
      killboard_verified: kbResult.verified,
      killboard_event_id: kbResult.matchedEventId,
      admin_notes: adminNotes, // Shown to admin as the killboard/policy hint.
      build_snapshot: buildSnapshot,
      fulfillment_mode: fulfillmentMode,
      craft_requested_slots: craftRequestedSlots,
      requester_relation: requesterRelation,
      regear_policy_snapshot: policySnapshot,
      event_regear_policy_snapshot_id: frozenParticipantPolicy?.id ?? null,
      regear_origin_type: 'event',
      ...rolePolicySnapshotColumns(rolePolicyResolution),
    })
    .select('id')
    .single()
  if (insertError) {
    // Best-effort cleanup so we don't leak orphaned screenshots.
    const cleanup = path2 ? [path, path2] : [path]
    await db.storage.from(SCREENSHOT_BUCKET).remove(cleanup)
    if (insertError.message.includes('event_actual_participant_required')) {
      return { error: tErr('actualParticipantRequired') }
    }
    if (insertError.message.includes('event_regear_policy_snapshot_required')) {
      return { error: tErr('eventRegearPolicyUnavailable') }
    }
    return { error: await publicActionError(insertError, 'actions/regear') }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  const { t: tAdminNotify } = await getAdminNotificationTranslations(guildId)
  void sendAdminNotification({
    guildId,
    topic: 'regear',
    sourceTable: 'regear_requests',
    sourceId: inserted.id as string,
    title: tAdminNotify('regearTitle'),
    body: tAdminNotify('regearBody', {
      user: requesterDisplayName,
      event: event.title,
      silver: storedClaimedSilver.toLocaleString('en-US'),
    }),
    url: '/admin/dashboard/approvals',
  })
  const allianceContentVideoStatus = isScopedGuest
    ? null
    : await submitRegearVideoForAllianceContent({
        guildId,
        discordId: session.discordId,
        regearRequestId: inserted.id as string,
        link: videoProofUrl ? allianceContentLink : null,
      })
  return {
    id: inserted.id,
    ...(allianceContentVideoStatus ? { allianceContentVideoStatus } : {}),
  }
}

export async function listMyRegearRequests(): Promise<{
  requests: MyRegearRequest[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const tCommon = await getTranslations('common')
  const session = await getSession()
  if (!session) return { requests: [], error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const ownership = session.isGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return {
      requests: [],
      error: await publicActionError(new Error(ownership.error), 'actions/regear'),
    }
  }
  let requestQuery = db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, base_silver, silver, regear_role_group, regear_role_policy_enabled, regear_role_policy_match_status, regear_role_policy_discord_role_name, request_type, claimed_silver, payout_silver, video_proof_url, video_proof_title, status, killboard_verified, admin_notes, reject_reason_code, created_at, resolved_at, handled_by_username, build_snapshot, auto_generated, requester_relation, participant_confirmation_status, events(title)',
    )
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
  requestQuery = ownership.guildMemberId
    ? requestQuery.eq('guild_member_id', ownership.guildMemberId)
    : requestQuery.eq('discord_id', session.discordId)
  if (session.isGuest && session.eventScope) {
    requestQuery = requestQuery.eq('event_id', session.eventScope)
  }
  const { data, error } = await requestQuery
  if (error) return { requests: [], error: await publicActionError(error, 'actions/regear') }

  const deletedEventLabel = tCommon('deletedEvent')
  const requests: MyRegearRequest[] = (data ?? []).map((row) => {
    const event = row.events as { title?: string } | { title?: string }[] | null
    const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
    return {
      id: row.id,
      event_id: row.event_id ?? '',
      event_title: liveTitle || row.event_title_snapshot || deletedEventLabel,
      role_name: row.role_name,
      base_silver:
        typeof row.base_silver === 'number' && Number.isFinite(row.base_silver)
          ? Math.trunc(row.base_silver)
          : null,
      silver: row.silver,
      regear_role_group: row.regear_role_group ?? null,
      regear_role_policy_enabled: row.regear_role_policy_enabled === true,
      regear_role_policy_match_status:
        (row.regear_role_policy_match_status as RegearRolePolicyMatchStatus | null) ?? 'disabled',
      regear_role_policy_discord_role_name:
        (row.regear_role_policy_discord_role_name as string | null) ?? null,
      request_type: (row.request_type ?? 'death') as RegearType,
      claimed_silver: row.claimed_silver,
      payout_silver: row.payout_silver ?? null,
      video_proof_url: row.video_proof_url ?? null,
      video_proof_title: row.video_proof_title ?? null,
      status: row.status as MyRegearRequest['status'],
      killboard_verified: row.killboard_verified,
      admin_notes: row.admin_notes,
      reject_reason_code: isRegearRejectReasonCode(row.reject_reason_code)
        ? row.reject_reason_code
        : null,
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      handled_by_username: row.handled_by_username ?? null,
      build_snapshot: (row.build_snapshot as BuildSnapshot | null) ?? null,
      auto_generated: Boolean(row.auto_generated),
      requester_relation: isAlbionIdentityRelation(row.requester_relation)
        ? row.requester_relation
        : 'home_guild',
      participant_confirmation_status: isRegearParticipantConfirmationStatus(
        row.participant_confirmation_status,
      )
        ? row.participant_confirmation_status
        : 'not_required',
    }
  })
  return { requests }
}

export async function listMyRegearEligibleEvents(): Promise<{
  events: RegearEligibleEvent[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { events: [], error: tErr('loginRequired') }
  const isScopedGuest =
    session.isGuest === true &&
    typeof session.eventScope === 'string' &&
    session.eventScope.length > 0
  if (!session.isMember && !isScopedGuest) {
    return { events: [], error: tErr('memberOnlyRegear') }
  }
  const guildId = await getSessionGuildId(session)
  const requireVerification =
    !isScopedGuest &&
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  if (requireVerification) {
    const gate = await requireManualRegearAllowed(session.discordId, guildId)
    if (gate.error) return { events: [], error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${gate.error}` }
  }

  const db = getAdminClient()
  const ownership = isScopedGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return {
      events: [],
      error: await publicActionError(new Error(ownership.error), 'actions/regear'),
    }
  }
  if (isScopedGuest) {
    const { data: application, error: applicationError } = await db
      .from('event_guest_applications')
      .select('status')
      .eq('guild_id', guildId)
      .eq('event_id', session.eventScope as string)
      .eq('guest_id', session.discordId)
      .maybeSingle()
    if (applicationError) {
      return { events: [], error: await publicActionError(applicationError, 'actions/regear') }
    }
    if (application?.status !== 'assigned') return { events: [] }
  }

  // 적격 컷오프: regear_eligibility_days 가 지난 이벤트는 "신청 가능" 리스트에서
  // 사라진다. 행 자체는 events 테이블에 남아 통계/이력 추적이 깨지지 않게 한다.
  const eligibilityDays = await getRegearEligibilityDays(guildId)
  const eligibilityCutoffIso = new Date(
    Date.now() - eligibilityDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Combat uses assigned slots. FF/ganking uses the event-local regear
  // participant list so party swaps do not silently remove eligibility.
  let slotsQuery = db
    .from('slots')
    .select('role_name, party_id, manual_regear_excluded')
    .eq('guild_id', guildId)
    .eq('manual_regear_excluded', false)
  slotsQuery = ownership.guildMemberId
    ? slotsQuery.eq('assigned_guild_member_id', ownership.guildMemberId)
    : slotsQuery.eq('assigned_discord_id', session.discordId)
  const { data: slots, error: slotError } = await slotsQuery
  if (slotError) return { events: [], error: await publicActionError(slotError, 'actions/regear') }

  let participantRowsQuery = db
    .from('event_regear_participants')
    .select('event_id, role_name')
    .eq('guild_id', guildId)
  participantRowsQuery = ownership.guildMemberId
    ? participantRowsQuery.eq('guild_member_id', ownership.guildMemberId)
    : participantRowsQuery.eq('discord_id', session.discordId)
  const { data: participantRows, error: participantError } = await participantRowsQuery
  if (participantError) return { events: [], error: await publicActionError(participantError, 'actions/regear') }

  let frozenPolicyQuery = db
    .from('event_regear_policy_snapshots')
    .select('event_id, manual_policy_snapshot')
    .eq('guild_id', guildId)
  frozenPolicyQuery = ownership.guildMemberId
    ? frozenPolicyQuery.eq('guild_member_id', ownership.guildMemberId)
    : frozenPolicyQuery.eq('discord_id', session.discordId)
  const { data: allFrozenPolicyRows, error: frozenPolicyError } = await frozenPolicyQuery
  if (frozenPolicyError) {
    return { events: [], error: await publicActionError(frozenPolicyError, 'actions/regear') }
  }
  const allFrozenPolicyByEvent = new Map<string, RegearPolicySnapshot>()
  for (const row of allFrozenPolicyRows ?? []) {
    const snapshot = parseRegearPolicySnapshot(row.manual_policy_snapshot)
    if (snapshot) allFrozenPolicyByEvent.set(row.event_id as string, snapshot)
  }

  if (
    (!slots || slots.length === 0) &&
    (!participantRows || participantRows.length === 0) &&
    allFrozenPolicyByEvent.size === 0
  ) {
    return { events: [] }
  }

  const partyIds = Array.from(
    new Set((slots ?? []).map((slot) => slot.party_id).filter((id): id is string => Boolean(id))),
  )
  let parties: { id: string; event_id: string }[] = []
  if (partyIds.length > 0) {
    const { data, error } = await db
      .from('parties')
      .select('id, event_id')
      .eq('guild_id', guildId)
      .in('id', partyIds)
    if (error) return { events: [], error: await publicActionError(error, 'actions/regear') }
    parties = data ?? []
  }

  const partyToEvent = new Map(parties.map((p) => [p.id, p.event_id]))
  const participantRoleByEvent = buildRegearEventRoleMap(
    (participantRows ?? []).map((row) => ({
      eventId: row.event_id,
      roleName: row.role_name,
    })),
  )
  let eventIds = Array.from(
    new Set([
      ...parties.map((p) => p.event_id),
      ...participantRoleByEvent.keys(),
      ...allFrozenPolicyByEvent.keys(),
    ]),
  )
  if (isScopedGuest) {
    eventIds = eventIds.filter((eventId) => eventId === session.eventScope)
  }
  if (eventIds.length === 0) return { events: [] }

  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, title, gather_time, gather_at, gather_location, battle_started_at, category, regear_policy, regear_silver_cap, regear_max_deaths_per_member, regear_video_policy, regear_video_payout_rate_percent, regear_video_claim_ceiling_bonus_silver, regear_video_rate_applies_without_proof, regear_auto_policy, regear_policy_version_id, guest_regear_enabled, participation_closeout_required')
    .eq('guild_id', guildId)
    .in('id', eventIds)
    .not('battle_started_at', 'is', null)
    .gte('battle_started_at', eligibilityCutoffIso)
    .order('battle_started_at', { ascending: false })
  if (eventsError) return { events: [], error: await publicActionError(eventsError, 'actions/regear') }
  if (!events || events.length === 0) return { events: [] }

  const closeoutRequiredIds = events
    .filter((event) => event.participation_closeout_required === true)
    .map((event) => event.id)
  let finalizedCloseoutEventIds = new Set<string>()
  let includedCloseoutEventIds = new Set<string>()
  if (closeoutRequiredIds.length > 0) {
    let entryQuery = db
      .from('event_participation_closeout_entries')
      .select('event_id')
      .eq('guild_id', guildId)
      .eq('decision', 'included')
      .in('event_id', closeoutRequiredIds)
    entryQuery = ownership.guildMemberId
      ? entryQuery.eq('guild_member_id', ownership.guildMemberId)
      : entryQuery.eq('discord_id', session.discordId)
    const [closeoutResult, entryResult] = await Promise.all([
      db
        .from('event_participation_closeouts')
        .select('event_id')
        .eq('guild_id', guildId)
        .in('event_id', closeoutRequiredIds),
      entryQuery,
    ])
    if (closeoutResult.error) {
      return { events: [], error: await publicActionError(closeoutResult.error, 'actions/regear') }
    }
    if (entryResult.error) {
      return { events: [], error: await publicActionError(entryResult.error, 'actions/regear') }
    }
    finalizedCloseoutEventIds = new Set(
      (closeoutResult.data ?? []).map((closeout) => closeout.event_id as string),
    )
    includedCloseoutEventIds = new Set(
      (entryResult.data ?? []).map((entry) => entry.event_id as string),
    )
  }
  const rosterEligibleEvents = events.filter(
    (event) =>
      (!isScopedGuest || event.guest_regear_enabled === true) &&
      (
        event.participation_closeout_required !== true ||
        !finalizedCloseoutEventIds.has(event.id) ||
        includedCloseoutEventIds.has(event.id)
      ),
  )
  if (rosterEligibleEvents.length === 0) return { events: [] }

  const eventIdSet = new Set(rosterEligibleEvents.map((e) => e.id))
  const frozenPolicyByEvent = new Map<string, RegearPolicySnapshot>()
  for (const [eventId, snapshot] of allFrozenPolicyByEvent) {
    if (eventIdSet.has(eventId)) frozenPolicyByEvent.set(eventId, snapshot)
  }

  // Map each event to my regear role. Combat keeps slot behavior. FF/ganking
  // must come from the regear participant list.
  const slotRoleByEvent = buildRegearEventRoleMap(
    (slots ?? [])
      .map((slot) => ({
        eventId: partyToEvent.get(slot.party_id),
        roleName: slot.role_name,
      }))
      .filter((slot) => slot.eventId && eventIdSet.has(slot.eventId)),
  )
  const missingCombatSnapshotEvents = rosterEligibleEvents.filter(
    (event) =>
      event.category === '전투' &&
      Boolean(event.regear_policy_version_id) &&
      !frozenPolicyByEvent.has(event.id) &&
      slotRoleByEvent.has(event.id),
  )
  if (missingCombatSnapshotEvents.length > 0) {
    const repairedSnapshots = await Promise.allSettled(
      missingCombatSnapshotEvents.map((event) =>
        ensureCurrentSlotEventRegearPolicySnapshot({
          db,
          guildId,
          eventId: event.id,
          discordId: session.discordId,
        }),
      ),
    )
    repairedSnapshots.forEach((result, index) => {
      const eventId = missingCombatSnapshotEvents[index]?.id
      if (!eventId) return
      if (result.status === 'fulfilled' && result.value) {
        frozenPolicyByEvent.set(eventId, result.value.manualPolicy)
        return
      }
      if (result.status === 'rejected') {
        log.error(
          '[listMyRegearEligibleEvents] missing slot policy snapshot repair failed',
          result.reason,
          {
            tenant_id: guildId,
            event_id: eventId,
            discord_id: session.discordId,
          },
        )
      }
    })
  }
  const eventToRole = buildManualRegearEligibilityRoleMap(
    rosterEligibleEvents.map((event) => ({
      eventId: event.id,
      category: event.category,
    })),
    slotRoleByEvent,
    participantRoleByEvent,
  )
  for (const [eventId, snapshot] of frozenPolicyByEvent) {
    const frozenRole = snapshot.participant?.roleName?.trim()
    if (frozenRole) eventToRole.set(eventId, frozenRole)
  }

  const roleNames = Array.from(
    new Set(Array.from(eventToRole.values()).filter((role) => role.length > 0)),
  )
  const [
    rewardRes,
    overrideRes,
    requestRes,
    baseRatePercent,
    overchargeRatePercent,
    videoRatePercent,
    videoClaimCeilingBonusSilver,
  ] = await Promise.all([
    roleNames.length > 0
      ? db
          .from('role_rewards')
          .select('role_name, silver, payout_rate_percent')
          .eq('guild_id', guildId)
          .in('role_name', roleNames)
      : Promise.resolve({
          data: [] as {
            role_name: string
            silver: number
            payout_rate_percent: number | null
          }[],
          error: null,
        }),
    db
      .from('event_regear_role_overrides')
      .select('event_id, role_name, enabled, silver_cap, payout_rate_percent')
      .eq('guild_id', guildId)
      .in('event_id', Array.from(eventIdSet)),
    (() => {
      let query = db
      .from('regear_requests')
      .select('id, event_id, auto_generated, request_type, status, created_at')
      .eq('guild_id', guildId)
      .neq('status', 'rejected')
      .in('event_id', Array.from(eventIdSet))
      query = ownership.guildMemberId
        ? query.eq('guild_member_id', ownership.guildMemberId)
        : query.eq('discord_id', session.discordId)
      return query.order('created_at', { ascending: false })
    })(),
    loadPayoutRatePercent(guildId),
    loadOverchargePayoutRatePercent(guildId),
    loadVideoPayoutRatePercent(guildId),
    loadVideoClaimCeilingBonusSilver(guildId),
  ])
  if (rewardRes.error) return { events: [], error: await publicActionError(rewardRes.error, 'actions/regear') }
  if (overrideRes.error) return { events: [], error: await publicActionError(overrideRes.error, 'actions/regear') }
  if (requestRes.error) return { events: [], error: await publicActionError(requestRes.error, 'actions/regear') }

  const rewardMap = new Map(
    (rewardRes.data ?? []).map((r) => [
      r.role_name,
      {
        silver: r.silver,
        payoutRatePercent: r.payout_rate_percent,
      },
    ]),
  )
  const overrideMap = new Map<
    string,
    { enabled: boolean; silverCap: number | null; payoutRatePercent: number | null }
  >()
  for (const row of overrideRes.data ?? []) {
    overrideMap.set(`${row.event_id}::${row.role_name}`, {
      enabled: row.enabled === true,
      silverCap: row.silver_cap ?? null,
      payoutRatePercent: row.payout_rate_percent ?? null,
    })
  }
  const countByEvent = new Map<string, number>()
  // Pending auto-generated death rows are replaceable by a manual death submit,
  // so they stay visible as "view auto claim" but do not consume the member's
  // UI death limit. Approved auto rows and manual death rows still count.
  // 가장 최근 pending auto-generated 요청 id 만 보존 (rows 가 created_at desc 로
  // 정렬돼 있으므로 첫 매칭이 곧 최신).
  const autoRequestByEvent = new Map<string, string>()
  for (const row of requestRes.data ?? []) {
    const requestType = (row.request_type ?? 'death') as RegearType
    const status = (row.status ?? 'pending') as 'pending' | 'approved' | 'rejected'
    if (
      countsTowardDeathLimit({
        requestType,
        autoGenerated: Boolean(row.auto_generated),
        status,
      })
    ) {
      countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1)
    }
    if (
      requestType === 'death' &&
      row.auto_generated &&
      status === 'pending' &&
      !autoRequestByEvent.has(row.event_id)
    ) {
      autoRequestByEvent.set(row.event_id, row.id)
    }
  }

  // 이벤트별 신청 오픈 시각 사전 계산. 참가 확정 이벤트는 시작 즉시 열리고,
  // 레거시 이벤트만 킬보드 대기 규칙을 적용한다. 추적 전투 쿼리가 실패해도
  // /regear 페이지 전체가 죽지 않도록 allSettled — 실패한 이벤트는
  // battle_started_at 기준으로 폴백되어 클라이언트는 정상 표시.
  const { windowMinutes, maxDeaths: globalMaxDeaths } = await loadRegearLimits(guildId)
  const eligibleEvents = rosterEligibleEvents.filter(
    (e) =>
      eventToRole.has(e.id) &&
      (!e.regear_policy_version_id || frozenPolicyByEvent.has(e.id)) &&
      (!isScopedGuest || frozenPolicyByEvent.has(e.id)) &&
      shouldListManualRegearEligibleEvent({
        activeDeathCount: countByEvent.get(e.id) ?? 0,
      }),
  )
  let matchedByEvent = new Map<string, Awaited<ReturnType<typeof findTrackedBattleIdsForEvent>>>()
  try {
    matchedByEvent = await findTrackedBattleIdsForEvents(
      db,
      guildId,
      eligibleEvents.map((e) => ({
        eventId: e.id,
        battleStartedAtIso: e.battle_started_at as string,
      })),
    )
  } catch (err) {
    log.error('[listMyRegearEligibleEvents] findTrackedBattleIdsForEvents failed', err, {
      tenant_id: guildId,
      event_count: eligibleEvents.length,
    })
  }
  const windowOpenByEvent = new Map<string, string>()
  const deadlineByEvent = new Map<string, string>()
  eligibleEvents.forEach((e) => {
    const matched = matchedByEvent.get(e.id) ?? []
    const battleStartMs = new Date(e.battle_started_at as string).getTime()
    const windowOpenMs = computeManualRegearWindowOpenMs({
      battleStartMs,
      latestEndedMs: latestEndedMsOf(matched),
      windowMinutes,
      participantCloseoutRequired: e.participation_closeout_required === true,
    })
    windowOpenByEvent.set(e.id, new Date(windowOpenMs).toISOString())
    deadlineByEvent.set(
      e.id,
      new Date(computeRegearEligibilityDeadlineMs(battleStartMs, eligibilityDays)).toISOString(),
    )
  })

  const rolePolicyResolver = isScopedGuest
    ? {
        enabled: false,
        resolve: (roleName: string, fallbackSilverCap: number) =>
          resolveRegearRolePolicy({
            enabled: false,
            roleGroup: roleGroupFromSlotRole(roleName),
            fallbackSilverCap,
            memberRoleIds: [],
            policies: [],
          }),
      }
    : await createRequesterRegearRolePolicyResolver({
        db,
        guildId,
        discordId: session.discordId,
      })
  if (rolePolicyResolver.error) return { events: [], error: rolePolicyResolver.error }
  const rateFloorResolution = isScopedGuest
    ? {
        configured: false,
        matched: null,
        rolesUnavailable: false,
      }
    : await resolveRequesterRegearRoleRateFloor({
        db,
        guildId,
        discordId: session.discordId,
      })
  if (rateFloorResolution.error) return { events: [], error: rateFloorResolution.error }
  const discordRoleRateFloor = toRegearDiscordRoleRateFloorSnapshot(
    rateFloorResolution.matched,
  )

  const result: RegearEligibleEvent[] = eligibleEvents.map((e) => {
    const role = eventToRole.get(e.id) ?? ''
    const frozenPolicy = frozenPolicyByEvent.get(e.id)
    if (frozenPolicy) {
      const frozenRolePolicy = regearRolePolicyResolutionFromSnapshot(
        frozenPolicy,
        role,
      )
      return {
        id: e.id,
        title: e.title,
        gather_time: e.gather_time,
        gather_at: e.gather_at,
        gather_location: e.gather_location,
        battle_started_at: e.battle_started_at as string,
        role_name: role,
        role_reward: frozenPolicy.baseCapSilver,
        role_payout_rate_percent: resolveSnapshotPayoutRatePercent(
          frozenPolicy,
          false,
          frozenPolicy.basePayoutRatePercent,
        ),
        overcharge_payout_rate_percent:
          frozenPolicy.overchargePayoutRatePercent ?? overchargeRatePercent,
        role_policy_enabled: frozenRolePolicy.enabled,
        role_policy_match_status: frozenRolePolicy.matchStatus,
        role_policy_discord_role_name:
          frozenRolePolicy.matchedPolicy?.discordRoleName ?? null,
        role_policy_silver_cap: frozenRolePolicy.enabled
          ? frozenRolePolicy.silverCap
          : null,
        video_payout_rate_percent: frozenPolicy.videoPayoutRatePercent,
        video_claim_ceiling_bonus_silver:
          frozenPolicy.videoClaimCeilingBonusSilver,
        video_rate_applies_without_proof:
          frozenPolicy.videoRateAppliesWithoutProof,
        max_deaths_per_member: frozenPolicy.maxDeathsPerMember,
        regear_policy: frozenPolicy.eventPolicy,
        existing_active_count: countByEvent.get(e.id) ?? 0,
        auto_request_id: autoRequestByEvent.get(e.id) ?? null,
        window_open_at:
          windowOpenByEvent.get(e.id) ?? (e.battle_started_at as string),
        deadline_at:
          deadlineByEvent.get(e.id) ?? new Date(
            computeRegearEligibilityDeadlineMs(
              new Date(e.battle_started_at as string).getTime(),
              eligibilityDays,
            ),
          ).toISOString(),
        matched_albion_battle_ids: (matchedByEvent.get(e.id) ?? []).map(
          (battle) => battle.albionBattleId,
        ),
        participant_confirmation_status:
          e.participation_closeout_required === true
            ? includedCloseoutEventIds.has(e.id)
              ? 'confirmed'
              : 'awaiting_closeout'
            : 'not_required',
      }
    }
    const eventCategory: EventCategory = EVENT_CATEGORIES.includes(e.category as EventCategory)
      ? (e.category as EventCategory)
      : '전투'
    const reward = rewardMap.get(role)
    const rolePolicyResolution = rolePolicyResolver.resolve(role, reward?.silver ?? 0)
    const resolvedPolicy = resolveEventRegearPolicy({
      category: eventCategory,
      eventPolicy: e.regear_policy,
      eventSilverCap: e.regear_silver_cap,
      eventMaxDeathsPerMember: e.regear_max_deaths_per_member,
      eventVideoPolicy: e.regear_video_policy,
      eventVideoPayoutRatePercent: e.regear_video_payout_rate_percent,
      eventVideoClaimCeilingBonusSilver: e.regear_video_claim_ceiling_bonus_silver,
      eventVideoRateAppliesWithoutProof: e.regear_video_rate_applies_without_proof,
      eventAutoPolicy: e.regear_auto_policy,
      roleSilver: reward?.silver ?? 0,
      rolePayoutRatePercent: reward?.payoutRatePercent ?? null,
      discordRolePolicy: rolePolicyResolution,
      discordRoleRateFloor,
      useMaximumVideoPayoutRate: rateFloorResolution.configured,
      roleOverride: overrideMap.get(`${e.id}::${role}`) ?? null,
      guildBasePayoutRatePercent: baseRatePercent,
      guildVideoPayoutRatePercent: videoRatePercent,
      guildVideoClaimCeilingBonusSilver: videoClaimCeilingBonusSilver,
      globalMaxDeaths,
      hasVideoProof: false,
      flow: 'manual',
    })
    return {
      id: e.id,
      title: e.title,
      gather_time: e.gather_time,
      gather_at: e.gather_at,
      gather_location: e.gather_location,
      battle_started_at: e.battle_started_at as string,
      role_name: role,
      role_reward: resolvedPolicy.silverCap,
      role_payout_rate_percent: resolvedPolicy.payoutRatePercent,
      overcharge_payout_rate_percent: overchargeRatePercent,
      role_policy_enabled: rolePolicyResolution.enabled,
      role_policy_match_status: rolePolicyResolution.matchStatus,
      role_policy_discord_role_name:
        rolePolicyResolution.matchedPolicy?.discordRoleName ?? null,
      role_policy_silver_cap: rolePolicyResolution.enabled ? rolePolicyResolution.silverCap : null,
      video_payout_rate_percent: resolvedPolicy.videoPayoutRatePercent,
      video_claim_ceiling_bonus_silver: resolvedPolicy.videoClaimCeilingBonusSilver,
      video_rate_applies_without_proof: resolvedPolicy.videoRateAppliesWithoutProof,
      max_deaths_per_member: resolvedPolicy.maxDeathsPerMember,
      regear_policy: resolvedPolicy.source,
      existing_active_count: countByEvent.get(e.id) ?? 0,
      auto_request_id: autoRequestByEvent.get(e.id) ?? null,
      window_open_at:
        windowOpenByEvent.get(e.id) ?? (e.battle_started_at as string),
      deadline_at:
        deadlineByEvent.get(e.id) ?? new Date(
          computeRegearEligibilityDeadlineMs(
            new Date(e.battle_started_at as string).getTime(),
            eligibilityDays,
          ),
        ).toISOString(),
      matched_albion_battle_ids: (matchedByEvent.get(e.id) ?? []).map(
        (battle) => battle.albionBattleId,
      ),
      participant_confirmation_status:
        e.participation_closeout_required === true
          ? includedCloseoutEventIds.has(e.id)
            ? 'confirmed'
            : 'awaiting_closeout'
          : 'not_required',
    }
  })

  return { events: result }
}

export async function getMyPointsSummary(): Promise<{
  summary?: MyPointsSummary
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { summary, error } = await getMemberPointSummary(db, guildId, session.discordId)
  if (error) return { error }
  return { summary }
}

export interface MyRegearDetail {
  id: string
  eventId: string
  eventTitle: string
  roleName: string
  status: 'pending' | 'approved' | 'rejected'
  autoGenerated: boolean
  requestType: RegearType
  // 현재 영상 증빙 상태까지 반영한 유효 청구 상한. 수정 후에도 claimed 가 이 값을 넘지 않는다.
  roleCap: number
  claimedSilver: number
  payoutSilver: number | null
  payoutRatePercent: number
  videoProofUrl: string | null
  videoProofTitle: string | null
  marketSilver: number
  items: RegearLineItem[]
  warningLevel: 'quality' | 'window' | 'bluezone' | 'redzone' | null
  createdAt: string
  adminNotes: string | null
  // 마이그 151. 거절 시 enum 코드. status='rejected' 만 채워진다.
  rejectReasonCode: RegearRejectReasonCode | null
  // 수동 신청에 첨부된 스크린샷 경로 (auto-regear 면 null). UI 가 미리보기 / 교체에 사용.
  screenshotPath: string | null
  screenshotPath2: string | null
  // 길드 단위 청구 모드. 'crafted' 면 청구자가 build_snapshot 을 보강해야
  // 제작자가 작업할 수 있다 — 자동 생성된 행은 killboard equipment 에서
  // 추출되어 들어오지만 sync 지연 시 빈 슬롯이 있을 수 있다.
  fulfillmentMode: 'silver' | 'crafted'
  buildSnapshot: BuildSnapshot | null
}

export async function getMyRegearDetail(
  id: string,
): Promise<{ detail?: MyRegearDetail; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tCommon = await getTranslations('common')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const ownership = session.isGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/regear') }
  }
  let detailQuery = db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, silver, base_silver, request_type, claimed_silver, payout_silver, video_proof_url, video_proof_title, status, auto_generated, gear_breakdown, price_warning_level, created_at, admin_notes, reject_reason_code, screenshot_path, screenshot_path_2, fulfillment_mode, build_snapshot, regear_policy_snapshot, events(title)',
    )
    .eq('guild_id', guildId)
    .eq('id', id)
  detailQuery = ownership.guildMemberId
    ? detailQuery.eq('guild_member_id', ownership.guildMemberId)
    : detailQuery.eq('discord_id', session.discordId)
  const { data, error } = await detailQuery
    .maybeSingle()
  if (error) return { error: await publicActionError(error, 'actions/regear') }
  if (!data) return { error: tErr('requestNotFound') }

  const event = data.events as { title?: string } | { title?: string }[] | null
  const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
  const breakdown = (data.gear_breakdown as RawBreakdown | null) ?? {}
  const items = normalizeBreakdownItems(breakdown.items)
  const marketSilver =
    typeof breakdown.market_silver === 'number' && Number.isFinite(breakdown.market_silver)
      ? Math.trunc(breakdown.market_silver)
      : computeMarketSilverFromItems(items)
  const baseRoleCap =
    typeof breakdown.base_role_cap === 'number' && Number.isFinite(breakdown.base_role_cap)
      ? Math.trunc(breakdown.base_role_cap)
      : typeof breakdown.role_cap === 'number' && Number.isFinite(breakdown.role_cap)
      ? Math.trunc(breakdown.role_cap)
      : typeof data.base_silver === 'number' && Number.isFinite(data.base_silver)
        ? Math.trunc(data.base_silver)
      : (data.silver as number | null) ?? 0
  const [
    baseRatePercent,
    overchargeRatePercent,
    videoRatePercent,
    videoClaimCeilingBonusSilver,
  ] = await Promise.all([
    loadPayoutRatePercent(guildId),
    loadOverchargePayoutRatePercent(guildId),
    loadVideoPayoutRatePercent(guildId),
    loadVideoClaimCeilingBonusSilver(guildId),
  ])
  const { data: roleRewardRate } = await db
    .from('role_rewards')
    .select('payout_rate_percent')
    .eq('guild_id', guildId)
    .eq('role_name', data.role_name as string)
    .maybeSingle()
  const snapshot = parseRegearPolicySnapshot(data.regear_policy_snapshot)
  const fallbackPayoutRatePercent =
    data.request_type === 'overcharge'
      ? overchargeRatePercent
      : resolveRegearPayoutRatePercent({
          baseRatePercent,
          roleRatePercent:
            typeof roleRewardRate?.payout_rate_percent === 'number'
              ? roleRewardRate.payout_rate_percent
              : null,
          videoRatePercent,
          hasVideoProof: Boolean(data.video_proof_url),
        })
  const payoutRatePercent = resolveSnapshotPayoutRatePercent(
    snapshot,
    Boolean(data.video_proof_url),
    fallbackPayoutRatePercent,
  )
  const fallbackRoleCap = resolveRegearClaimCeilingSilver({
    baseCeilingSilver: baseRoleCap,
    videoCeilingBonusSilver: videoClaimCeilingBonusSilver,
    hasVideoProof: Boolean(data.video_proof_url),
  })
  const roleCap = resolveSnapshotClaimCeilingSilver(
    snapshot,
    Boolean(data.video_proof_url),
    fallbackRoleCap,
  )
  const warningLevel =
    breakdown.warning_level === 'quality' ||
    breakdown.warning_level === 'window' ||
    breakdown.warning_level === 'bluezone' ||
    breakdown.warning_level === 'redzone'
      ? breakdown.warning_level
      : null

  const rawMode = data.fulfillment_mode as string | null
  const fulfillmentMode: 'silver' | 'crafted' = rawMode === 'crafted' ? 'crafted' : 'silver'

  const detail: MyRegearDetail = {
    id: data.id as string,
    eventId: (data.event_id as string | null) ?? '',
    eventTitle: liveTitle || (data.event_title_snapshot as string | null) || tCommon('deletedEvent'),
    roleName: (data.role_name as string) ?? '',
    status: data.status as MyRegearDetail['status'],
    autoGenerated: Boolean(data.auto_generated),
    requestType: (data.request_type ?? 'death') as RegearType,
    roleCap,
    claimedSilver: (data.claimed_silver as number | null) ?? 0,
    payoutSilver: (data.payout_silver as number | null) ?? null,
    payoutRatePercent,
    videoProofUrl: (data.video_proof_url as string | null) ?? null,
    videoProofTitle: (data.video_proof_title as string | null) ?? null,
    marketSilver,
    items,
    warningLevel,
    createdAt: data.created_at as string,
    adminNotes: (data.admin_notes as string | null) ?? null,
    rejectReasonCode: isRegearRejectReasonCode(data.reject_reason_code)
      ? data.reject_reason_code
      : null,
    screenshotPath: (data.screenshot_path as string | null) ?? null,
    screenshotPath2: (data.screenshot_path_2 as string | null) ?? null,
    fulfillmentMode,
    buildSnapshot: (data.build_snapshot as BuildSnapshot | null) ?? null,
  }
  return { detail }
}

// 멤버 본인의 리기어 스크린샷 signed URL 발급 — 관리자용 getScreenshotUrl 과
// 같은 버킷이지만 ownership 체크가 다르다 (관리자 권한 X, discord_id 일치 필수).
export async function getMyRegearScreenshotUrl(
  requestId: string,
  slot: 'primary' | 'secondary',
): Promise<{ url?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const ownership = session.isGuest
    ? { guildMemberId: null, error: undefined }
    : await resolveStableMemberOwnership(db, guildId, session.discordId)
  if (ownership.error) {
    return { error: await publicActionError(new Error(ownership.error), 'actions/regear') }
  }
  const { data, error } = await db
    .from('regear_requests')
    .select('discord_id, guild_member_id, screenshot_path, screenshot_path_2')
    .eq('guild_id', guildId)
    .eq('id', requestId)
    .maybeSingle()
  if (error) return { error: await publicActionError(error, 'actions/regear') }
  if (!data) return { error: tErr('requestNotFound') }
  if (!isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: session.discordId,
    rowGuildMemberId: data.guild_member_id,
    rowSubjectId: data.discord_id,
  })) return { error: tErr('onlyOwnEdit') }

  const path = slot === 'primary' ? data.screenshot_path : data.screenshot_path_2
  if (!path) return { error: tErr('requestNotFound') }

  const { data: urlData, error: urlError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrl(path as string, 10 * 60)
  if (urlError) return { error: await publicActionError(urlError, 'actions/regear') }
  return { url: urlData.signedUrl }
}
