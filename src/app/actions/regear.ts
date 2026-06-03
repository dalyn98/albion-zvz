'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { formatKillboardVerificationReason, verifyDeathInWindow } from '@/lib/killboard'
import { getAppSetting } from '@/lib/app-settings'
import { requireManualRegearAllowed } from '@/lib/albion-identity'
import {
  isAlbionIdentityRelation,
  type AlbionIdentityRelation,
} from '@/lib/account-albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
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
  computeRegearWindowOpenMs,
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
import { countsTowardDeathLimit } from '@/lib/regear-request-policy'
import { sendAdminNotification } from '@/lib/admin-notifications'
import {
  buildManualRegearEligibilityRoleMap,
  buildRegearEventRoleMap,
} from '@/lib/regear-eligible-events'
import { resolveManualRegearPolicy, type EventRegearPolicy } from '@/lib/regear-event-policy'

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
  silver: number
  request_type: RegearType
  claimed_silver: number | null
  // Actual credited amount for approved rows (migration 044). NULL for pending/rejected.
  payout_silver: number | null
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
  max_deaths_per_member: number
  regear_policy: EventRegearPolicy
  // Non-rejected death regear requests the current user already has for this event.
  // Overcharge requests do not consume this count.
  existing_active_count: number
  // Most recent active auto-generated request id for this event/member.
  // When set, the page renders a read-only "auto submitted" card variant —
  // members aren't expected to file a manual claim on top of an auto pending.
  auto_request_id: string | null
  // ISO 시각: 이 시점 이후로 신청 가능. 규칙은 min(battle_started_at +
  // windowMinutes, latest matched ended_at) — 즉 전투 시작 후 windowMinutes 가
  // 지나거나 전투가 종료되는 시점 둘 중 빠른 쪽. 매칭이 0건이면 start +
  // windowMinutes 으로 폴백.
  window_open_at: string
  // ISO 시각: 이벤트 시작 기준 신청 마감. 자유 리기어(트래킹 사망)와 같은
  // regear_eligibility_days 정책을 수동 이벤트 리기어에도 적용한다.
  deadline_at: string
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
): Promise<{ error?: string; id?: string }> {
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
): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tKillboard = await getTranslations('killboardVerify')
  const tRegear = await getTranslations('regear')
  const tAdminNotify = await getTranslations('adminNotificationMessages')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  const guildId = await getSessionGuildId(session)
  const requireVerification =
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  let requesterRelation: AlbionIdentityRelation = 'unknown'
  if (requireVerification) {
    const gate = await requireManualRegearAllowed(session.discordId, guildId)
    requesterRelation = gate.relation
    if (gate.error) return { error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${gate.error}` }
  }

  const eventId = String(formData.get('eventId') ?? '')
  const file = formData.get('screenshot')
  const file2 = formData.get('screenshot2')
  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
  // 'death' (default) | 'overcharge'. overcharge 는 길드 정책 토글이 켜져
  // 있을 때만 허용 — UI 가 옵션을 숨기더라도 직접 폼 조작을 막기 위해 서버에서
  // 재검증한다. 다른 값은 silently 'death' 로 fallback.
  const requestTypeRaw = String(formData.get('requestType') ?? 'death')
  const requestType: RegearType = requestTypeRaw === 'overcharge' ? 'overcharge' : 'death'
  if (requestType === 'overcharge') {
    const overchargeEnabled =
      (await getAppSetting('regear_overcharge_enabled', 'false', guildId)) === 'true'
    if (!overchargeEnabled) return { error: tErr('overchargeDisabled') }
  }
  // 청구 방식은 길드 단위 강제. craft_regear_enabled='true' 면 모든 신규 요청이
  // 'crafted', 'false' 면 'silver'. 멤버는 모드를 선택할 수 없다 (기존 form
  // 'fulfillmentMode' 필드는 무시).
  const craftEnabled =
    (await getAppSetting('craft_regear_enabled', 'false', guildId)) === 'true'
  const fulfillmentMode: 'silver' | 'crafted' = craftEnabled ? 'crafted' : 'silver'
  if (!eventId) return { error: tErr('missingEventInfo') }
  if (!(file instanceof File) || file.size === 0) return { error: tErr('screenshotMissing') }
  if (file.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
  if (!ALLOWED_MIME.has(file.type)) return { error: tErr('screenshotWrongType') }
  // 두 번째 스크린샷은 선택 사항 — 제출 된 경우에만 검증.
  const hasFile2 = file2 instanceof File && file2.size > 0
  if (hasFile2) {
    if (file2.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
    if (!ALLOWED_MIME.has(file2.type)) return { error: tErr('screenshotWrongType') }
  }

  const db = getAdminClient()

  // 1) Resolve the event first so FF/ganking can use the event-local regear
  //    participant list instead of the constantly changing party slots.
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, battle_started_at, category, regear_policy, regear_silver_cap, regear_max_deaths_per_member')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .single()
  if (eventError) return { error: eventError.message }
  const eventCategory: EventCategory = EVENT_CATEGORIES.includes(event.category as EventCategory)
    ? (event.category as EventCategory)
    : '전투'
  const usesEventParticipantList = eventCategory !== '전투'

  // Combat events still require a current assigned slot. For FF/ganking, a slot
  // snapshot is used when present, but eligibility comes from
  // event_regear_participants.
  const { data: slot, error: slotError } = await db
    .from('slots')
    .select(
      'role_name, manual_regear_excluded, weapon_name, weapon_id, head_name, head_id, armor_name, armor_id, shoes_name, shoes_id, offhand_name, offhand_id, potion_name, potion_id, food_name, food_id, cape_name, cape_id, mount_name, mount_id, assigned_weapon_name, assigned_weapon_id, assigned_head_name, assigned_head_id, assigned_armor_name, assigned_armor_id, assigned_shoes_name, assigned_shoes_id, assigned_offhand_name, assigned_offhand_id, assigned_potion_name, assigned_potion_id, assigned_food_name, assigned_food_id, assigned_cape_name, assigned_cape_id, assigned_mount_name, assigned_mount_id, parties!inner(event_id)',
    )
    .eq('guild_id', guildId)
    .eq('assigned_discord_id', session.discordId)
    .eq('parties.event_id', eventId)
    .limit(1)
    .maybeSingle()
  if (slotError) return { error: slotError.message }

  let roleName = ''
  let buildSnapshot: BuildSnapshot
  if (usesEventParticipantList) {
    const { data: participant, error: participantError } = await db
      .from('event_regear_participants')
      .select('role_name')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (participantError) return { error: participantError.message }
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

  // 2) Submission gate — `regear_window_minutes` 은 킬보드 indexing 대기 시간이며
  //    상한이 아니다. 호스트가 누른 battle_started_at 은 부정확하므로 매칭된
  //    tracked battle 의 ended_at (Albion /battles 가 보고하는 실측치) 을
  //    anchor 로 쓴다. 매칭 0건(솔로 갱크/sync 지연) 은 battle_started_at 으로
  //    폴백. Title 은 여기서 스냅샷해 이벤트 삭제돼도 이력에 남게 한다.
  if (!event.battle_started_at) {
    return { error: tErr('battleNotStarted') }
  }
  const battleStartMs = new Date(event.battle_started_at).getTime()
  if (isRegearEligibilityExpired(battleStartMs, eligibilityDays)) {
    return { error: tErr('regearEligibilityExpired', { days: eligibilityDays }) }
  }
  // tenant_battle_records 쿼리가 일시 실패해도 신청 자체가 throw 되지 않도록
  // 폴백: 매칭이 없으면 battle_started_at + windowMinutes 만 사용. cron 측
  // (auto-regear.ts) 은 별도 try/catch 없이 throw 그대로 유지.
  let matchedBattles: Awaited<ReturnType<typeof findTrackedBattleIdsForEvent>> = []
  try {
    matchedBattles = await findTrackedBattleIdsForEvent(
      db,
      guildId,
      event.battle_started_at,
    )
  } catch (err) {
    log.error('[requestRegear] findTrackedBattleIdsForEvent failed', err, {
      tenant_id: guildId,
      event_id: eventId,
    })
  }
  const latestEndedMs = latestEndedMsOf(matchedBattles)
  // 신청 오픈 규칙: 전투 시작 + windowMinutes (기본 60분) 이 지나거나, 매칭된
  // 전투가 종료(ended_at 보유) 되면 즉시 오픈. 둘 중 빠른 시점.
  if (Date.now() < computeRegearWindowOpenMs(battleStartMs, latestEndedMs, windowMinutes)) {
    return { error: tErr('regearWindowNotOpen', { minutes: windowMinutes }) }
  }

  // 3) Resolve the silver ceiling/death count. Combat events always use
  //    role_rewards; FF/ganking events may replace it with an event-local cap.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver')
    .eq('guild_id', guildId)
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const resolvedPolicy = resolveManualRegearPolicy({
    category: eventCategory,
    eventPolicy: event.regear_policy,
    eventSilverCap: event.regear_silver_cap,
    eventMaxDeathsPerMember: event.regear_max_deaths_per_member,
    roleSilver: reward?.silver ?? 0,
    globalMaxDeaths,
  })
  if (!resolvedPolicy.enabled) {
    if (resolvedPolicy.source === 'disabled') return { error: tErr('eventRegearDisabled') }
    if (resolvedPolicy.source === 'event') return { error: tErr('eventRegearLimitInvalid') }
    return { error: tErr('ceilingNotSetForRole') }
  }
  const silver = resolvedPolicy.silverCap
  const maxDeaths = resolvedPolicy.maxDeathsPerMember

  // 4) Supersede policy: pending 자동 리기어 행이 있으면 반려로 밀어내고 수동
  //    death 를 받는다. 자동이 cron 에서 선행되어 pending 으로 자리 잡았더라도, 실제
  //    사망한 유저가 직접 신청서를 올리는 쪽을 최종 소스 오브 트루스로 취급.
  //    오버차지는 사망이 아니므로 자동 death row 를 대체하지 않는다.
  //    비고 컬럼에 사유를 남겨 관리자/청구자가 내역에서 구분 가능.
  if (requestType === 'death') {
    const { error: supersedeError } = await db
      .from('regear_requests')
      .update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        admin_notes: tRegear('autoSupersededByManual'),
      })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('discord_id', session.discordId)
      .eq('auto_generated', true)
      .eq('request_type', 'death')
      .eq('status', 'pending')
    if (supersedeError) return { error: supersedeError.message }

    // Non-rejected death rows count toward the event-specific limit so a user
    // can re-submit after a rejection but can't spam past the configured cap.
    const { count: activeCount, error: countError } = await db
      .from('regear_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('discord_id', session.discordId)
      .eq('request_type', 'death')
      .neq('status', 'rejected')
    if (countError) return { error: countError.message }
    if ((activeCount ?? 0) >= maxDeaths) {
      return { error: tErr('regearDeathsLimitReached', { max: maxDeaths }) }
    }
  }

  // 4a) Validate the member's claimed amount against the ceiling.
  const claimedSilver = Number(claimedSilverRaw.replace(/,/g, '').trim())
  if (!Number.isFinite(claimedSilver) || !Number.isInteger(claimedSilver) || claimedSilver <= 0) {
    return { error: tErr('invalidClaimAmount') }
  }
  if (claimedSilver > silver) {
    return { error: tErr('claimOverCeiling', { ceiling: silver.toLocaleString() }) }
  }

  // 5) Upload screenshot first — if the DB insert below fails, an orphaned
  //    file is far cheaper to clean up than a phantom request row.
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${session.discordId}/${eventId}-${Date.now()}.${ext}`
  const { error: uploadError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return { error: tErr('screenshotUploadFailed', { reason: uploadError.message }) }

  // 5a) 두 번째 스크린샷이 있으면 같은 버킷에 업로드. 파일명은 첫 번째 경로에
  //     `-2` 접미사를 붙여 쌍 관계를 쉽게 파악할 수 있게 한다. 업로드 실패 시
  //     앞서 올린 첫 번째 파일도 같이 지워 고아 파일을 남기지 않는다.
  let path2: string | null = null
  if (hasFile2) {
    const ext2 = file2.type === 'image/png' ? 'png' : file2.type === 'image/webp' ? 'webp' : 'jpg'
    path2 = `${session.discordId}/${eventId}-${Date.now()}-2.${ext2}`
    const { error: upload2Error } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path2, file2, { contentType: file2.type, upsert: false })
    if (upload2Error) {
      await db.storage.from(SCREENSHOT_BUCKET).remove([path])
      return { error: tErr('screenshotUploadFailed', { reason: upload2Error.message }) }
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
          session.username,
          new Date(battleStartMs).toISOString(),
          new Date().toISOString(),
          { guildId },
        )
  const killboardNote = formatKillboardVerificationReason(kbResult, tKillboard)

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
      username: session.username,
      role_name: roleName,
      silver,
      claimed_silver: claimedSilver,
      request_type: requestType,
      screenshot_path: path,
      screenshot_path_2: path2,
      killboard_verified: kbResult.verified,
      killboard_event_id: kbResult.matchedEventId,
      admin_notes: killboardNote, // Shown to admin as the killboard hint.
      build_snapshot: buildSnapshot,
      fulfillment_mode: fulfillmentMode,
      requester_relation: requesterRelation,
    })
    .select('id')
    .single()
  if (insertError) {
    // Best-effort cleanup so we don't leak orphaned screenshots.
    const cleanup = path2 ? [path, path2] : [path]
    await db.storage.from(SCREENSHOT_BUCKET).remove(cleanup)
    return { error: insertError.message }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  void sendAdminNotification({
    guildId,
    topic: 'regear',
    sourceTable: 'regear_requests',
    sourceId: inserted.id as string,
    title: tAdminNotify('regearTitle'),
    body: tAdminNotify('regearBody', {
      user: session.username,
      event: event.title,
      silver: claimedSilver.toLocaleString('en-US'),
    }),
    url: '/admin/dashboard/approvals',
  })
  return { id: inserted.id }
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
  const { data, error } = await db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, status, killboard_verified, admin_notes, reject_reason_code, created_at, resolved_at, handled_by_username, build_snapshot, auto_generated, requester_relation, events(title)',
    )
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .order('created_at', { ascending: false })
  if (error) return { requests: [], error: error.message }

  const deletedEventLabel = tCommon('deletedEvent')
  const requests: MyRegearRequest[] = (data ?? []).map((row) => {
    const event = row.events as { title?: string } | { title?: string }[] | null
    const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
    return {
      id: row.id,
      event_id: row.event_id ?? '',
      event_title: liveTitle || row.event_title_snapshot || deletedEventLabel,
      role_name: row.role_name,
      silver: row.silver,
      request_type: (row.request_type ?? 'death') as RegearType,
      claimed_silver: row.claimed_silver,
      payout_silver: row.payout_silver ?? null,
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
  if (!session.isMember) return { events: [], error: tErr('memberOnlyRegear') }
  const guildId = await getSessionGuildId(session)
  const requireVerification =
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  if (requireVerification) {
    const gate = await requireManualRegearAllowed(session.discordId, guildId)
    if (gate.error) return { events: [], error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${gate.error}` }
  }

  const db = getAdminClient()

  // 적격 컷오프: regear_eligibility_days 가 지난 이벤트는 "신청 가능" 리스트에서
  // 사라진다. 행 자체는 events 테이블에 남아 통계/이력 추적이 깨지지 않게 한다.
  const eligibilityDays = await getRegearEligibilityDays(guildId)
  const eligibilityCutoffIso = new Date(
    Date.now() - eligibilityDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Combat uses assigned slots. FF/ganking uses the event-local regear
  // participant list so party swaps do not silently remove eligibility.
  const { data: slots, error: slotError } = await db
    .from('slots')
    .select('role_name, party_id, manual_regear_excluded')
    .eq('guild_id', guildId)
    .eq('assigned_discord_id', session.discordId)
    .eq('manual_regear_excluded', false)
  if (slotError) return { events: [], error: slotError.message }

  const { data: participantRows, error: participantError } = await db
    .from('event_regear_participants')
    .select('event_id, role_name')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (participantError) return { events: [], error: participantError.message }

  if ((!slots || slots.length === 0) && (!participantRows || participantRows.length === 0)) {
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
    if (error) return { events: [], error: error.message }
    parties = data ?? []
  }

  const partyToEvent = new Map(parties.map((p) => [p.id, p.event_id]))
  const participantRoleByEvent = buildRegearEventRoleMap(
    (participantRows ?? []).map((row) => ({
      eventId: row.event_id,
      roleName: row.role_name,
    })),
  )
  const eventIds = Array.from(
    new Set([...parties.map((p) => p.event_id), ...participantRoleByEvent.keys()]),
  )
  if (eventIds.length === 0) return { events: [] }

  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, title, gather_time, gather_at, gather_location, battle_started_at, category, regear_policy, regear_silver_cap, regear_max_deaths_per_member')
    .eq('guild_id', guildId)
    .in('id', eventIds)
    .not('battle_started_at', 'is', null)
    .gte('battle_started_at', eligibilityCutoffIso)
    .order('battle_started_at', { ascending: false })
  if (eventsError) return { events: [], error: eventsError.message }
  if (!events || events.length === 0) return { events: [] }

  const eventIdSet = new Set(events.map((e) => e.id))

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
  const eventToRole = buildManualRegearEligibilityRoleMap(
    events.map((event) => ({
      eventId: event.id,
      category: event.category,
    })),
    slotRoleByEvent,
    participantRoleByEvent,
  )

  const roleNames = Array.from(
    new Set(Array.from(eventToRole.values()).filter((role) => role.length > 0)),
  )
  const [rewardRes, requestRes] = await Promise.all([
    roleNames.length > 0
      ? db
          .from('role_rewards')
          .select('role_name, silver')
          .eq('guild_id', guildId)
          .in('role_name', roleNames)
      : Promise.resolve({ data: [] as { role_name: string; silver: number }[], error: null }),
    db
      .from('regear_requests')
      .select('id, event_id, auto_generated, request_type, status, created_at')
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .neq('status', 'rejected')
      .in('event_id', Array.from(eventIdSet))
      .order('created_at', { ascending: false }),
  ])
  if (rewardRes.error) return { events: [], error: rewardRes.error.message }
  if (requestRes.error) return { events: [], error: requestRes.error.message }

  const rewardMap = new Map((rewardRes.data ?? []).map((r) => [r.role_name, r.silver]))
  const countByEvent = new Map<string, number>()
  // Pending auto-generated death rows are replaceable by a manual death submit,
  // so they stay visible as "view auto claim" but do not consume the member's
  // UI death limit. Approved auto rows and manual death rows still count.
  // 가장 최근 auto-generated active 요청 id 만 보존 (rows 가 created_at desc 로
  // 정렬돼 있으므로 첫 매칭이 곧 최신).
  const autoRequestByEvent = new Map<string, string>()
  for (const row of requestRes.data ?? []) {
    const requestType = (row.request_type ?? 'death') as RegearType
    if (
      countsTowardDeathLimit({
        requestType,
        autoGenerated: Boolean(row.auto_generated),
        status: (row.status ?? 'pending') as 'pending' | 'approved' | 'rejected',
      })
    ) {
      countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1)
    }
    if (requestType === 'death' && row.auto_generated && !autoRequestByEvent.has(row.event_id)) {
      autoRequestByEvent.set(row.event_id, row.id)
    }
  }

  // 이벤트별 신청 오픈 시각 사전 계산. submission gate 와 동일한 규칙
  // (computeRegearWindowOpenMs). tenant_battle_records 쿼리가 일시적으로 실패해도
  // /regear 페이지 전체가 죽지 않도록 allSettled — 실패한 이벤트는
  // battle_started_at 기준으로 폴백되어 클라이언트는 정상 표시.
  const { windowMinutes, maxDeaths: globalMaxDeaths } = await loadRegearLimits(guildId)
  const eligibleEvents = events.filter((e) => eventToRole.has(e.id))
  const matchedSettled = await Promise.allSettled(
    eligibleEvents.map((e) =>
      findTrackedBattleIdsForEvent(db, guildId, e.battle_started_at as string),
    ),
  )
  const windowOpenByEvent = new Map<string, string>()
  const deadlineByEvent = new Map<string, string>()
  eligibleEvents.forEach((e, i) => {
    const settled = matchedSettled[i]
    const matched = settled.status === 'fulfilled' ? settled.value : []
    const battleStartMs = new Date(e.battle_started_at as string).getTime()
    const windowOpenMs = computeRegearWindowOpenMs(
      battleStartMs,
      latestEndedMsOf(matched),
      windowMinutes,
    )
    windowOpenByEvent.set(e.id, new Date(windowOpenMs).toISOString())
    deadlineByEvent.set(
      e.id,
      new Date(computeRegearEligibilityDeadlineMs(battleStartMs, eligibilityDays)).toISOString(),
    )
  })

  const result: RegearEligibleEvent[] = eligibleEvents.map((e) => {
    const role = eventToRole.get(e.id) ?? ''
    const eventCategory: EventCategory = EVENT_CATEGORIES.includes(e.category as EventCategory)
      ? (e.category as EventCategory)
      : '전투'
    const resolvedPolicy = resolveManualRegearPolicy({
      category: eventCategory,
      eventPolicy: e.regear_policy,
      eventSilverCap: e.regear_silver_cap,
      eventMaxDeathsPerMember: e.regear_max_deaths_per_member,
      roleSilver: rewardMap.get(role) ?? 0,
      globalMaxDeaths,
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
  // 역할 상한(role_rewards.silver). 수정 후에도 claimed/payout 이 이 값을 넘지 않는다.
  roleCap: number
  claimedSilver: number
  payoutSilver: number | null
  payoutRatePercent: number
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
  const { data, error } = await db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, status, auto_generated, gear_breakdown, price_warning_level, created_at, admin_notes, reject_reason_code, screenshot_path, screenshot_path_2, fulfillment_mode, build_snapshot, events(title)',
    )
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: tErr('requestNotFound') }

  const event = data.events as { title?: string } | { title?: string }[] | null
  const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
  const breakdown = (data.gear_breakdown as RawBreakdown | null) ?? {}
  const items = normalizeBreakdownItems(breakdown.items)
  const marketSilver =
    typeof breakdown.market_silver === 'number' && Number.isFinite(breakdown.market_silver)
      ? Math.trunc(breakdown.market_silver)
      : computeMarketSilverFromItems(items)
  const roleCap =
    typeof breakdown.role_cap === 'number' && Number.isFinite(breakdown.role_cap)
      ? Math.trunc(breakdown.role_cap)
      : (data.silver as number | null) ?? 0
  const payoutRatePercent =
    typeof breakdown.payout_rate_percent === 'number' && Number.isFinite(breakdown.payout_rate_percent)
      ? Math.trunc(breakdown.payout_rate_percent)
      : 100
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
  const { data, error } = await db
    .from('regear_requests')
    .select('discord_id, screenshot_path, screenshot_path_2')
    .eq('guild_id', guildId)
    .eq('id', requestId)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: tErr('requestNotFound') }
  if (data.discord_id !== session.discordId) return { error: tErr('onlyOwnEdit') }

  const path = slot === 'primary' ? data.screenshot_path : data.screenshot_path_2
  if (!path) return { error: tErr('requestNotFound') }

  const { data: urlData, error: urlError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .createSignedUrl(path as string, 10 * 60)
  if (urlError) return { error: urlError.message }
  return { url: urlData.signedUrl }
}
