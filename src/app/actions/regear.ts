'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { verifyDeathInWindow } from '@/lib/killboard'
import { getAppSetting } from '@/lib/app-settings'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { findTrackedBattleIdsForEvent } from '@/lib/auto-regear-matching'
import { SLOT_KEYS, getDisplayGear, type BuildSnapshot, type RegearType, type SlotGearDisplay, type SlotKey } from '@/types'

// User-facing regear actions. Admin-side lives in `regear-admin.ts`.

const SCREENSHOT_BUCKET = 'regear-screenshots'
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024 // 10 MiB — must match bucket limit in migration 003
const DEFAULT_REGEAR_WINDOW_MINUTES = 60
const DEFAULT_MAX_DEATHS_PER_EVENT = 1
// 신청 가능한 리기어가 적격 리스트에 머무는 기간(일). 이 시간이 지난 사망/이벤트는
// /regear 의 "신청 가능" 섹션에서 사라진다 (행 자체는 지우지 않음 — 통계·이력
// 보존). 기본 14일.
const DEFAULT_ELIGIBILITY_DAYS = 14
const MIN_ELIGIBILITY_DAYS = 1
const MAX_ELIGIBILITY_DAYS = 90

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

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

function buildSnapshotFromSlot(slot: SlotGearDisplay, roleName: string): BuildSnapshot {
  const gear = SLOT_KEYS.reduce(
    (acc, k) => {
      const { name, id } = getDisplayGear(slot, k)
      acc[k] = { name: name ?? null, id: id ?? null }
      return acc
    },
    {} as Record<SlotKey, { name: string | null; id: string | null }>,
  )
  return { role_name: roleName || null, ...gear }
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
  created_at: string
  resolved_at: string | null
  handled_by_username: string | null
  build_snapshot: BuildSnapshot | null
  // 자동 생성 여부 — true 이면 status=pending 동안 청구자가 부위별 가격을 수정할 수 있다.
  auto_generated: boolean
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
  // Non-rejected regear requests the current user already has for this event.
  // Button disables when this hits `maxDeaths` (loaded separately on the page).
  existing_active_count: number
  // Most recent active auto-generated request id for this event/member.
  // When set, the page renders a read-only "auto submitted" card variant —
  // members aren't expected to file a manual claim on top of an auto pending.
  auto_request_id: string | null
  // ISO 시각: 이 시점 이후로 신청 가능. 매칭된 tracked battle 의 가장 늦은
  // ended_at + windowMinutes 으로 계산 (정확). 매칭이 0건이면 battle_started_at
  // + windowMinutes 으로 폴백 (솔로 갱크/sync 지연 케이스 — 약간 빠를 수 있음).
  window_open_at: string
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
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  const guildId = await getSessionGuildId(session)
  const requireVerification =
    (await getAppSetting('regear_require_verification', 'true', guildId)) !== 'false'
  if (requireVerification) {
    const albionError = await requireAlbionVerified(session.discordId, guildId)
    if (albionError) return { error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${albionError}` }
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

  // 1) Must be assigned to a slot with a role in that event. Pull the full
  //    gear so we can snapshot the build — the regear admin uses this to
  //    verify in-game that the member wore what they applied with. Columns
  //    are spelled out because Supabase's select parser needs a literal.
  const { data: slot, error: slotError } = await db
    .from('slots')
    .select(
      'role_name, manual_regear_excluded, weapon_name, weapon_id, head_name, head_id, armor_name, armor_id, shoes_name, shoes_id, offhand_name, offhand_id, potion_name, potion_id, food_name, food_id, cape_name, cape_id, mount_name, mount_id, assigned_weapon_name, assigned_weapon_id, assigned_head_name, assigned_head_id, assigned_armor_name, assigned_armor_id, assigned_shoes_name, assigned_shoes_id, assigned_offhand_name, assigned_offhand_id, assigned_potion_name, assigned_potion_id, assigned_food_name, assigned_food_id, assigned_cape_name, assigned_cape_id, assigned_mount_name, assigned_mount_id, parties!inner(event_id)',
    )
    .eq('guild_id', guildId)
    .eq('assigned_discord_id', session.discordId)
    .eq('parties.event_id', eventId)
    .maybeSingle()
  if (slotError) return { error: slotError.message }
  if (!slot) return { error: tErr('noAssignedSlot') }
  if (slot.manual_regear_excluded === true) return { error: tErr('manualRegearExcluded') }
  const roleName = (slot.role_name ?? '').trim()
  if (!roleName) return { error: tErr('slotRoleMissing') }

  const buildSnapshot = buildSnapshotFromSlot(slot as unknown as SlotGearDisplay, roleName)

  const { windowMinutes, maxDeaths } = await loadRegearLimits(guildId)

  // 1a) Supersede policy: pending 자동 리기어 행이 있으면 반려로 밀어내고 수동을
  //     받는다. 자동이 cron 에서 선행되어 pending 으로 자리 잡았더라도, 실제
  //     사망한 유저가 직접 신청서를 올리는 쪽을 최종 소스 오브 트루스로 취급.
  //     비고 컬럼에 사유를 남겨 관리자/청구자가 내역에서 구분 가능.
  const { error: supersedeError } = await db
    .from('regear_requests')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      admin_notes: '수동 리기어 신청으로 자동 대체됨',
    })
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('discord_id', session.discordId)
    .eq('auto_generated', true)
    .eq('status', 'pending')
  if (supersedeError) return { error: supersedeError.message }

  // 2) Per-event death cap. Non-rejected rows count toward the limit so a user
  //    can re-submit after a rejection but can't spam past the admin-configured
  //    cap. Migration 043 removed the DB partial-unique; this is now the only
  //    gate, so the count query runs before the upload.
  const { count: activeCount, error: countError } = await db
    .from('regear_requests')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('discord_id', session.discordId)
    .neq('status', 'rejected')
  if (countError) return { error: countError.message }
  if ((activeCount ?? 0) >= maxDeaths) {
    return { error: tErr('regearDeathsLimitReached', { max: maxDeaths }) }
  }

  // 3) Submission gate — `regear_window_minutes` 은 킬보드 indexing 대기 시간이며
  //    상한이 아니다. 호스트가 누른 battle_started_at 은 부정확하므로 매칭된
  //    tracked battle 의 ended_at (Albion /battles 가 보고하는 실측치) 을
  //    anchor 로 쓴다. 매칭 0건(솔로 갱크/sync 지연) 은 battle_started_at 으로
  //    폴백. Title 은 여기서 스냅샷해 이벤트 삭제돼도 이력에 남게 한다.
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, battle_started_at')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .single()
  if (eventError) return { error: eventError.message }
  if (!event.battle_started_at) {
    return { error: tErr('battleNotStarted') }
  }
  const battleStartMs = new Date(event.battle_started_at).getTime()
  const matchedBattles = await findTrackedBattleIdsForEvent(
    db,
    guildId,
    event.battle_started_at,
  )
  const latestEndedMs = matchedBattles.reduce((acc, b) => {
    const ms = Date.parse(b.endedAtIso)
    return Number.isFinite(ms) && ms > acc ? ms : acc
  }, 0)
  const anchorMs = latestEndedMs > 0 ? latestEndedMs : battleStartMs
  const windowOpenMs = anchorMs + windowMinutes * 60 * 1000
  if (Date.now() < windowOpenMs) {
    return { error: tErr('regearWindowNotOpen', { minutes: windowMinutes }) }
  }

  // 4) Snapshot the role's silver ceiling. A ceiling of 0 blocks the role
  //    from regear entirely; admin must set it in the settings page first.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver')
    .eq('guild_id', guildId)
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const silver = reward?.silver ?? 0
  if (silver <= 0) {
    return { error: tErr('ceilingNotSetForRole') }
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
      ? { verified: false, matchedEventId: null, reason: null }
      : await verifyDeathInWindow(
          session.username,
          new Date(battleStartMs).toISOString(),
          new Date().toISOString(),
          { guildId },
        )

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
      admin_notes: kbResult.reason, // Shown to admin as the killboard hint.
      build_snapshot: buildSnapshot,
      fulfillment_mode: fulfillmentMode,
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
  return { id: inserted.id }
}

export async function cancelMyRegearRequest(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: row, error: fetchError } = await db
    .from('regear_requests')
    .select('id, status, discord_id, event_id, screenshot_path, screenshot_path_2')
    .eq('guild_id', guildId)
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: deleteError } = await db
    .from('regear_requests')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', id)
    .eq('status', 'pending')
  if (deleteError) return { error: deleteError.message }

  // Best-effort screenshot cleanup. If this fails we continue — the nightly
  // cron already has a separate sweep for orphaned files.
  const toRemove: string[] = []
  if (row.screenshot_path) toRemove.push(row.screenshot_path)
  if (row.screenshot_path_2) toRemove.push(row.screenshot_path_2)
  if (toRemove.length > 0) {
    await db.storage.from(SCREENSHOT_BUCKET).remove(toRemove)
  }

  if (row.event_id) revalidatePath(`/events/${row.event_id}`)
  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/regear')
  return {}
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
      'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, status, killboard_verified, admin_notes, created_at, resolved_at, handled_by_username, build_snapshot, auto_generated, events(title)',
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
      created_at: row.created_at,
      resolved_at: row.resolved_at,
      handled_by_username: row.handled_by_username ?? null,
      build_snapshot: (row.build_snapshot as BuildSnapshot | null) ?? null,
      auto_generated: Boolean(row.auto_generated),
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

  const db = getAdminClient()

  // 적격 컷오프: regear_eligibility_days 가 지난 이벤트는 "신청 가능" 리스트에서
  // 사라진다. 행 자체는 events 테이블에 남아 통계/이력 추적이 깨지지 않게 한다.
  const eligibilityDays = await getRegearEligibilityDays(guildId)
  const eligibilityCutoffIso = new Date(
    Date.now() - eligibilityDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  // Find slots I'm assigned to, joined through parties to events with a battle
  // start. Battle start is the gate — no start means no regear window yet.
  // We don't gate by isEnded here: members can still submit from the site after
  // the in-game 1-hour window (the cutoff is for the screenshot itself).
  const { data: slots, error: slotError } = await db
    .from('slots')
    .select('role_name, party_id, manual_regear_excluded')
    .eq('guild_id', guildId)
    .eq('assigned_discord_id', session.discordId)
    .eq('manual_regear_excluded', false)
  if (slotError) return { events: [], error: slotError.message }
  if (!slots || slots.length === 0) return { events: [] }

  const { data: parties, error: partiesError } = await db
    .from('parties')
    .select('id, event_id')
    .eq('guild_id', guildId)
    .in(
      'id',
      slots.map((s) => s.party_id),
    )
  if (partiesError) return { events: [], error: partiesError.message }
  if (!parties || parties.length === 0) return { events: [] }

  const partyToEvent = new Map(parties.map((p) => [p.id, p.event_id]))
  const eventIds = Array.from(new Set(parties.map((p) => p.event_id)))

  const { data: events, error: eventsError } = await db
    .from('events')
    .select('id, title, gather_time, gather_at, gather_location, battle_started_at')
    .eq('guild_id', guildId)
    .in('id', eventIds)
    .not('battle_started_at', 'is', null)
    .gte('battle_started_at', eligibilityCutoffIso)
    .order('battle_started_at', { ascending: false })
  if (eventsError) return { events: [], error: eventsError.message }
  if (!events || events.length === 0) return { events: [] }

  const eventIdSet = new Set(events.map((e) => e.id))

  // Map each event to my role (first matching slot wins — a member shouldn't
  // hold multiple slots in one event, but guard against it anyway).
  const eventToRole = new Map<string, string>()
  for (const slot of slots) {
    const eventId = partyToEvent.get(slot.party_id)
    if (!eventId || !eventIdSet.has(eventId)) continue
    const role = (slot.role_name ?? '').trim()
    if (!role) continue
    if (!eventToRole.has(eventId)) eventToRole.set(eventId, role)
  }

  const roleNames = Array.from(new Set(Array.from(eventToRole.values())))
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
      .select('id, event_id, auto_generated, created_at')
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
  // 가장 최근 auto-generated active 요청 id 만 보존 (rows 가 created_at desc 로
  // 정렬돼 있으므로 첫 매칭이 곧 최신).
  const autoRequestByEvent = new Map<string, string>()
  for (const row of requestRes.data ?? []) {
    countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1)
    if (row.auto_generated && !autoRequestByEvent.has(row.event_id)) {
      autoRequestByEvent.set(row.event_id, row.id)
    }
  }

  // 이벤트별 신청 오픈 시각 사전 계산. submission gate 와 동일한 anchor 규칙
  // (matched ended_at 우선, 없으면 battle_started_at 폴백) 으로 클라이언트가
  // 별도 로직 없이 바로 표시·비활성화 판단할 수 있게 한다. N 개 이벤트에 대해
  // tenant_battle_records 쿼리가 N 번 발생하므로 Promise.all 로 병렬화.
  const { windowMinutes } = await loadRegearLimits(guildId)
  const windowMinutesMs = windowMinutes * 60 * 1000
  const eligibleEvents = events.filter((e) => eventToRole.has(e.id))
  const matchedByEvent = await Promise.all(
    eligibleEvents.map((e) =>
      findTrackedBattleIdsForEvent(db, guildId, e.battle_started_at as string),
    ),
  )
  const windowOpenByEvent = new Map<string, string>()
  eligibleEvents.forEach((e, i) => {
    const matched = matchedByEvent[i]
    const battleStartMs = new Date(e.battle_started_at as string).getTime()
    const latestEndedMs = matched.reduce((acc, b) => {
      const ms = Date.parse(b.endedAtIso)
      return Number.isFinite(ms) && ms > acc ? ms : acc
    }, 0)
    const anchorMs = latestEndedMs > 0 ? latestEndedMs : battleStartMs
    windowOpenByEvent.set(e.id, new Date(anchorMs + windowMinutesMs).toISOString())
  })

  const result: RegearEligibleEvent[] = eligibleEvents.map((e) => {
    const role = eventToRole.get(e.id) ?? ''
    return {
      id: e.id,
      title: e.title,
      gather_time: e.gather_time,
      gather_at: e.gather_at,
      gather_location: e.gather_location,
      battle_started_at: e.battle_started_at as string,
      role_name: role,
      role_reward: rewardMap.get(role) ?? 0,
      existing_active_count: countByEvent.get(e.id) ?? 0,
      auto_request_id: autoRequestByEvent.get(e.id) ?? null,
      window_open_at:
        windowOpenByEvent.get(e.id) ?? (e.battle_started_at as string),
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
  const { data, error } = await db
    .from('point_ledger')
    .select('delta')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }

  let earned = 0
  let spent = 0
  for (const row of data ?? []) {
    if (row.delta >= 0) earned += row.delta
    else spent += -row.delta
  }
  return { summary: { balance: earned - spent, lifetimeEarned: earned, lifetimeSpent: spent } }
}

// 자동 리기어 pending 상태에서 청구자가 부위별 시세를 수정할 때 쓰는 구조.
// auto-regear.ts 가 만든 gear_breakdown.items 와 동일한 필드 셋 + userEdited 플래그.
export interface RegearLineItem {
  slot: string
  uniqueName: string
  enchant: number
  quality: number
  count: number
  // 단위(1개) 실버 가격. null = AODP 에서 시세를 못 찾음 (청구자가 입력해야 지급 대상).
  price: number | null
  city: string | null
  fallbackTier: string | null
  // true 면 청구자가 직접 수정한 슬롯. 관리자 UI 에 배지로 노출해 AODP 자동
  // 추정과 구분할 수 있게 한다.
  userEdited: boolean
  // AODP 결과 신뢰도. 'low' 면 청구자에게 "직접 입력해 주세요" 안내 배지를
  // 띄운다. 옛 행은 confidence 가 없을 수 있어 nullable.
  confidence: 'high' | 'medium' | 'low' | 'none' | null
}

export interface MyRegearDetail {
  id: string
  eventId: string
  eventTitle: string
  roleName: string
  status: 'pending' | 'approved' | 'rejected'
  autoGenerated: boolean
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
  // 수동 신청에 첨부된 스크린샷 경로 (auto-regear 면 null). UI 가 미리보기 / 교체에 사용.
  screenshotPath: string | null
  screenshotPath2: string | null
  // 길드 단위 청구 모드. 'crafted' 면 청구자가 build_snapshot 을 보강해야
  // 제작자가 작업할 수 있다 — 자동 생성된 행은 killboard equipment 에서
  // 추출되어 들어오지만 sync 지연 시 빈 슬롯이 있을 수 있다.
  fulfillmentMode: 'silver' | 'crafted'
  buildSnapshot: BuildSnapshot | null
}

interface RawBreakdownItem {
  slot?: unknown
  uniqueName?: unknown
  enchant?: unknown
  quality?: unknown
  count?: unknown
  price?: unknown
  city?: unknown
  fallbackTier?: unknown
  userEdited?: unknown
  confidence?: unknown
}

interface RawBreakdown {
  role_cap?: unknown
  payout_rate_percent?: unknown
  market_silver?: unknown
  items?: unknown
  warning_level?: unknown
}

function normalizeBreakdownItems(raw: unknown): RegearLineItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((v): v is RawBreakdownItem => typeof v === 'object' && v !== null)
    .map((v): RegearLineItem => {
      const confidence: 'high' | 'medium' | 'low' | 'none' | null =
        v.confidence === 'high' ||
        v.confidence === 'medium' ||
        v.confidence === 'low' ||
        v.confidence === 'none'
          ? v.confidence
          : null
      return {
        slot: typeof v.slot === 'string' ? v.slot : '',
        uniqueName: typeof v.uniqueName === 'string' ? v.uniqueName : '',
        enchant:
          typeof v.enchant === 'number' && Number.isFinite(v.enchant)
            ? Math.trunc(v.enchant)
            : 0,
        quality:
          typeof v.quality === 'number' && Number.isFinite(v.quality)
            ? Math.trunc(v.quality)
            : 1,
        count:
          typeof v.count === 'number' && Number.isFinite(v.count) && v.count > 0
            ? Math.trunc(v.count)
            : 1,
        price:
          typeof v.price === 'number' && Number.isFinite(v.price) && v.price >= 0
            ? Math.trunc(v.price)
            : null,
        city: typeof v.city === 'string' ? v.city : null,
        fallbackTier: typeof v.fallbackTier === 'string' ? v.fallbackTier : null,
        userEdited: v.userEdited === true,
        confidence,
      }
    })
    .filter((v) => v.slot.length > 0)
}

function computeMarketSilverFromItems(items: RegearLineItem[]): number {
  let total = 0
  for (const it of items) {
    if (typeof it.price === 'number' && it.price > 0) {
      total += it.price * it.count
    }
  }
  return total
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
      'id, event_id, event_title_snapshot, role_name, silver, claimed_silver, payout_silver, status, auto_generated, gear_breakdown, price_warning_level, created_at, admin_notes, screenshot_path, screenshot_path_2, fulfillment_mode, build_snapshot, events(title)',
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
    roleCap,
    claimedSilver: (data.claimed_silver as number | null) ?? 0,
    payoutSilver: (data.payout_silver as number | null) ?? null,
    payoutRatePercent,
    marketSilver,
    items,
    warningLevel,
    createdAt: data.created_at as string,
    adminNotes: (data.admin_notes as string | null) ?? null,
    screenshotPath: (data.screenshot_path as string | null) ?? null,
    screenshotPath2: (data.screenshot_path_2 as string | null) ?? null,
    fulfillmentMode,
    buildSnapshot: (data.build_snapshot as BuildSnapshot | null) ?? null,
  }
  return { detail }
}

// 제작 모드 자동 리기어 본인 빌드 한 슬롯 갱신. tier+enchant 만 다르고 base 가
// 같은 아이템(예: T5_2H_ARCANESTAFF → T7_2H_ARCANESTAFF@2) 으로 바꿔달라는 케이스가
// 대부분이지만, killboard sync 지연으로 슬롯이 비어있던 경우 새로 채우는 호출도
// 같은 액션을 재사용한다 — 차이는 입력 값(name/id) 의 채워짐 여부일 뿐.
//
// 빈 슬롯으로 되돌리는 케이스는 명시적으로 name=id=null 호출. 클라이언트에서 슬롯
// "비우기" 버튼을 누른 경우 UI 가 그렇게 부른다.
export async function updateMyRegearBuildSnapshotSlot(
  requestId: string,
  slotKey: SlotKey,
  name: string | null,
  id: string | null,
): Promise<{ error?: string; buildSnapshot?: BuildSnapshot }> {
  const tErr = await getTranslations('memberActionError')
  if (!SLOT_KEYS.includes(slotKey)) {
    return { error: tErr('slotNotFound') }
  }
  const trimmedId = typeof id === 'string' ? id.trim() : null
  const trimmedName = typeof name === 'string' ? name.trim() : null
  // (id null, name 채워짐) 같은 일관성 없는 입력은 막는다 — 둘 다 null 이거나 둘 다 truthy.
  if ((trimmedId && !trimmedName) || (!trimmedId && trimmedName)) {
    return { error: tErr('invalidInput') }
  }

  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: row, error: fetchErr } = await db
    .from('regear_requests')
    .select('id, discord_id, status, auto_generated, fulfillment_mode, build_snapshot, role_name')
    .eq('guild_id', guildId)
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr) return { error: fetchErr.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnEdit') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
  if (!row.auto_generated) return { error: tErr('autoOnlyEditable') }
  if (row.fulfillment_mode !== 'crafted') return { error: tErr('craftedOnlyEditable') }

  // 비어 있던 snapshot 도 한 슬롯만 들고 들어와도 일관된 BuildSnapshot 으로
  // 정규화 — UI 가 9개 슬롯을 항상 보여주기 위해 누락된 슬롯에 null 들을 박아둔다.
  const current = (row.build_snapshot as BuildSnapshot | null) ?? null
  const next: BuildSnapshot = {
    role_name: current?.role_name ?? ((row.role_name as string | null) ?? null),
    weapon: current?.weapon ?? { name: null, id: null },
    head: current?.head ?? { name: null, id: null },
    armor: current?.armor ?? { name: null, id: null },
    shoes: current?.shoes ?? { name: null, id: null },
    offhand: current?.offhand ?? { name: null, id: null },
    potion: current?.potion ?? { name: null, id: null },
    food: current?.food ?? { name: null, id: null },
    cape: current?.cape ?? { name: null, id: null },
    mount: current?.mount ?? { name: null, id: null },
  }
  next[slotKey] = { name: trimmedName, id: trimmedId }

  const { error: updateErr } = await db
    .from('regear_requests')
    .update({ build_snapshot: next })
    .eq('guild_id', guildId)
    .eq('id', requestId)
  if (updateErr) return { error: updateErr.message }

  revalidatePath(`/me/regear/${requestId}`)
  return { buildSnapshot: next }
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

// 수동 제출 리기어의 스크린샷 교체 (pending 한정). 새 파일 업로드 → DB 갱신
// → 옛 파일 best-effort 정리. 두 슬롯 중 일부만 교체할 수도 있고, 두 번째는
// 삭제도 가능(removeSecondary). 새 업로드가 실패하면 이미 올린 파일은 롤백.
export async function updateMyManualRegearScreenshots(
  requestId: string,
  formData: FormData,
): Promise<{
  error?: string
  primaryPath?: string | null
  secondaryPath?: string | null
}> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)

    const newPrimary = formData.get('screenshot')
    const newSecondary = formData.get('screenshot2')
    const removeSecondary = formData.get('removeSecondary') === 'true'

    const hasPrimary = newPrimary instanceof File && newPrimary.size > 0
    const hasSecondary = newSecondary instanceof File && newSecondary.size > 0

    if (hasPrimary) {
      if (newPrimary.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
      if (!ALLOWED_MIME.has(newPrimary.type)) return { error: tErr('screenshotWrongType') }
    }
    if (hasSecondary) {
      if (newSecondary.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
      if (!ALLOWED_MIME.has(newSecondary.type)) return { error: tErr('screenshotWrongType') }
    }
    if (!hasPrimary && !hasSecondary && !removeSecondary) {
      return { error: tErr('noChange') }
    }

    const db = getAdminClient()
    const { data: row, error: fetchError } = await db
      .from('regear_requests')
      .select(
        'id, status, auto_generated, discord_id, event_id, screenshot_path, screenshot_path_2',
      )
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!row) return { error: tErr('requestNotFound') }
    if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnEdit') }
    if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (row.auto_generated) return { error: tErr('manualOnlyEditable') }

    const eventId = row.event_id as string
    const oldPrimary = (row.screenshot_path as string | null) ?? null
    const oldSecondary = (row.screenshot_path_2 as string | null) ?? null

    let nextPrimary: string | null = oldPrimary
    let nextSecondary: string | null = oldSecondary
    const newlyUploaded: string[] = []
    const toRemove: string[] = []

    if (hasPrimary) {
      const ext =
        newPrimary.type === 'image/png'
          ? 'png'
          : newPrimary.type === 'image/webp'
            ? 'webp'
            : 'jpg'
      const path = `${session.discordId}/${eventId}-${Date.now()}.${ext}`
      const { error: upErr } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, newPrimary, { contentType: newPrimary.type, upsert: false })
      if (upErr) {
        return { error: tErr('screenshotUploadFailed', { reason: upErr.message }) }
      }
      newlyUploaded.push(path)
      if (oldPrimary) toRemove.push(oldPrimary)
      nextPrimary = path
    }

    if (hasSecondary) {
      const ext =
        newSecondary.type === 'image/png'
          ? 'png'
          : newSecondary.type === 'image/webp'
            ? 'webp'
            : 'jpg'
      const path = `${session.discordId}/${eventId}-${Date.now()}-2.${ext}`
      const { error: upErr } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, newSecondary, { contentType: newSecondary.type, upsert: false })
      if (upErr) {
        if (newlyUploaded.length > 0) {
          await db.storage.from(SCREENSHOT_BUCKET).remove(newlyUploaded)
        }
        return { error: tErr('screenshotUploadFailed', { reason: upErr.message }) }
      }
      newlyUploaded.push(path)
      if (oldSecondary) toRemove.push(oldSecondary)
      nextSecondary = path
    } else if (removeSecondary && oldSecondary) {
      toRemove.push(oldSecondary)
      nextSecondary = null
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        screenshot_path: nextPrimary,
        screenshot_path_2: nextSecondary,
      })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) {
      if (newlyUploaded.length > 0) {
        await db.storage.from(SCREENSHOT_BUCKET).remove(newlyUploaded)
      }
      return { error: updateError.message }
    }

    if (toRemove.length > 0) {
      await db.storage.from(SCREENSHOT_BUCKET).remove(toRemove)
    }

    revalidatePath(`/me/regear/${requestId}`)
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/me')

    return { primaryPath: nextPrimary, secondaryPath: nextSecondary }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 단위 실버 상한 — int32 를 넘지 않으면서 시세 오입력 방지. 20M 실버/단위면
// 현재 게임 내 어떤 아이템보다도 훨씬 높아 실질적 상한은 유지된다.
const MAX_UNIT_SILVER = 20_000_000

export interface UpdateLineItemResult {
  error?: string
  marketSilver?: number
  claimedSilver?: number
  payoutSilver?: number
}

export async function updateMyRegearLineItemPrice(
  requestId: string,
  slot: string,
  newUnitSilver: number,
): Promise<UpdateLineItemResult> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)

    if (!Number.isInteger(newUnitSilver) || newUnitSilver < 0) {
      return { error: tErr('priceMustBeNonNegativeInt') }
    }
    if (newUnitSilver > MAX_UNIT_SILVER) {
      return { error: tErr('priceTooLarge', { max: MAX_UNIT_SILVER.toLocaleString() }) }
    }
    const slotTrimmed = slot.trim()
    if (!slotTrimmed) return { error: tErr('slotEmpty') }

    const db = getAdminClient()
    const { data, error } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, gear_breakdown')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('requestNotFound') }
    if (data.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (!data.auto_generated) return { error: tErr('autoOnlyEditable') }

    const breakdown = (data.gear_breakdown as RawBreakdown | null) ?? {}
    const items = normalizeBreakdownItems(breakdown.items)
    const idx = items.findIndex((it) => it.slot === slotTrimmed)
    if (idx === -1) return { error: tErr('slotNotFound') }

    // Immutable update — items 배열을 재구성해 해당 슬롯만 교체.
    const updatedItems: RegearLineItem[] = items.map((it, i) =>
      i === idx ? { ...it, price: newUnitSilver, userEdited: true } : it,
    )

    const newMarketSilver = computeMarketSilverFromItems(updatedItems)
    const roleCap =
      typeof breakdown.role_cap === 'number' && Number.isFinite(breakdown.role_cap) && breakdown.role_cap > 0
        ? Math.trunc(breakdown.role_cap)
        : newMarketSilver
    const payoutRatePercent =
      typeof breakdown.payout_rate_percent === 'number' &&
      Number.isFinite(breakdown.payout_rate_percent) &&
      breakdown.payout_rate_percent >= 1 &&
      breakdown.payout_rate_percent <= 100
        ? Math.trunc(breakdown.payout_rate_percent)
        : 100
    const newClaimedSilver = Math.min(newMarketSilver, roleCap)
    const newPayoutSilver = calcPayoutSilver(newClaimedSilver, payoutRatePercent)

    const newBreakdown = {
      ...breakdown,
      items: updatedItems,
      market_silver: newMarketSilver,
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({
        gear_breakdown: newBreakdown,
        claimed_silver: newClaimedSilver,
        payout_silver: newPayoutSilver,
      })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
      .eq('auto_generated', true)
    if (updateError) return { error: updateError.message }

    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return {
      marketSilver: newMarketSilver,
      claimedSilver: newClaimedSilver,
      payoutSilver: newPayoutSilver,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 수동 제출 리기어의 청구 실버 수정 (pending 한정).
// 자동 리기어는 슬롯별로 단가를 수정해 market/claimed/payout 을 재계산하지만,
// 수동은 청구자가 직접 적은 단일 금액 (claimed_silver) 만 갱신하면 된다.
// payout_silver 는 승인 시점에 RPC 가 채우므로 여기서는 건드리지 않는다.
export async function updateMyManualRegearClaim(
  requestId: string,
  newClaimedSilver: number,
): Promise<{ error?: string; claimedSilver?: number }> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    const guildId = await getSessionGuildId(session)

    if (!Number.isInteger(newClaimedSilver) || newClaimedSilver <= 0) {
      return { error: tErr('invalidClaimAmount') }
    }

    const db = getAdminClient()
    const { data, error } = await db
      .from('regear_requests')
      .select('id, status, auto_generated, discord_id, silver')
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('requestNotFound') }
    if (data.status !== 'pending') return { error: tErr('alreadyProcessedCannotEdit') }
    if (data.auto_generated) return { error: tErr('manualOnlyEditable') }

    const ceiling = (data.silver as number | null) ?? 0
    if (newClaimedSilver > ceiling) {
      return { error: tErr('claimOverCeiling', { ceiling: ceiling.toLocaleString() }) }
    }

    const { error: updateError } = await db
      .from('regear_requests')
      .update({ claimed_silver: newClaimedSilver })
      .eq('guild_id', guildId)
      .eq('id', requestId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
      .eq('auto_generated', false)
    if (updateError) return { error: updateError.message }

    revalidatePath('/me')
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    return { claimedSilver: newClaimedSilver }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
