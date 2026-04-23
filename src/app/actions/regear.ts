'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { verifyDeathInWindow } from '@/lib/killboard'
import { getAppSetting } from '@/lib/app-settings'
import { calcPayoutSilver } from '@/lib/regear-payout'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { SLOT_KEYS, getDisplayGear, type BuildSnapshot, type RegearType, type SlotGearDisplay, type SlotKey } from '@/types'

// User-facing regear actions. Admin-side lives in `regear-admin.ts`.

const SCREENSHOT_BUCKET = 'regear-screenshots'
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024 // 10 MiB — must match bucket limit in migration 003
const DEFAULT_REGEAR_WINDOW_MINUTES = 60
const DEFAULT_MAX_DEATHS_PER_EVENT = 1

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

async function loadRegearLimits(): Promise<{ windowMinutes: number; maxDeaths: number }> {
  const [windowRaw, maxRaw] = await Promise.all([
    getAppSetting('regear_window_minutes', String(DEFAULT_REGEAR_WINDOW_MINUTES)),
    getAppSetting('regear_max_deaths_per_event', String(DEFAULT_MAX_DEATHS_PER_EVENT)),
  ])
  const windowParsed = Number(windowRaw)
  const maxParsed = Number(maxRaw)
  return {
    windowMinutes: Number.isFinite(windowParsed) && windowParsed >= 1 ? Math.floor(windowParsed) : DEFAULT_REGEAR_WINDOW_MINUTES,
    maxDeaths: Number.isFinite(maxParsed) && maxParsed >= 1 ? Math.floor(maxParsed) : DEFAULT_MAX_DEATHS_PER_EVENT,
  }
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
}

export interface RegearLimits {
  windowMinutes: number
  maxDeaths: number
}

// Exposed to the regear page so it can render the window/cap labels and
// decide button state without re-reading app_settings from the client bundle.
export async function getRegearLimits(): Promise<RegearLimits> {
  return loadRegearLimits()
}

export async function requestRegear(
  formData: FormData,
): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  const requireVerification = (await getAppSetting('regear_require_verification', 'true')) !== 'false'
  if (requireVerification) {
    const albionError = await requireAlbionVerified(session.discordId)
    if (albionError) return { error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${albionError}` }
  }

  const eventId = String(formData.get('eventId') ?? '')
  const file = formData.get('screenshot')
  const file2 = formData.get('screenshot2')
  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
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
    .eq('assigned_discord_id', session.discordId)
    .eq('parties.event_id', eventId)
    .maybeSingle()
  if (slotError) return { error: slotError.message }
  if (!slot) return { error: tErr('noAssignedSlot') }
  if (slot.manual_regear_excluded === true) return { error: tErr('manualRegearExcluded') }
  const roleName = (slot.role_name ?? '').trim()
  if (!roleName) return { error: tErr('slotRoleMissing') }

  const buildSnapshot = buildSnapshotFromSlot(slot as unknown as SlotGearDisplay, roleName)

  const { windowMinutes, maxDeaths } = await loadRegearLimits()

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
    .eq('event_id', eventId)
    .eq('discord_id', session.discordId)
    .neq('status', 'rejected')
  if (countError) return { error: countError.message }
  if ((activeCount ?? 0) >= maxDeaths) {
    return { error: tErr('regearDeathsLimitReached', { max: maxDeaths }) }
  }

  // 3) Submission gate — `regear_window_minutes` is the killboard-collection
  //    delay, not a deadline. Submissions open at `battle_started_at + N` so
  //    the killboard has time to index the death; no upper bound. `gather_time`
  //    is free-text so we anchor off `battle_started_at`. Title is snapshotted
  //    here so history survives if the event is later deleted.
  const { data: event, error: eventError } = await db
    .from('events')
    .select('id, title, battle_started_at')
    .eq('id', eventId)
    .single()
  if (eventError) return { error: eventError.message }
  if (!event.battle_started_at) {
    return { error: tErr('battleNotStarted') }
  }
  const battleStartMs = new Date(event.battle_started_at).getTime()
  const windowOpenMs = battleStartMs + windowMinutes * 60 * 1000
  if (Date.now() < windowOpenMs) {
    return { error: tErr('regearWindowNotOpen', { minutes: windowMinutes }) }
  }

  // 4) Snapshot the role's silver ceiling. A ceiling of 0 blocks the role
  //    from regear entirely; admin must set it in the settings page first.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver')
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
  const kbResult = await verifyDeathInWindow(
    session.username,
    new Date(battleStartMs).toISOString(),
    new Date().toISOString(),
  )

  // 7) Insert the request. request_type column defaults to 'death' in the DB
  //    for backwards compatibility; application code no longer branches on it
  //    after migration 018 unified the flow.
  const { data: inserted, error: insertError } = await db
    .from('regear_requests')
    .insert({
      event_id: eventId,
      event_title_snapshot: event.title,
      discord_id: session.discordId,
      username: session.username,
      role_name: roleName,
      silver,
      claimed_silver: claimedSilver,
      screenshot_path: path,
      screenshot_path_2: path2,
      killboard_verified: kbResult.verified,
      killboard_event_id: kbResult.matchedEventId,
      admin_notes: kbResult.reason, // Shown to admin as the killboard hint.
      build_snapshot: buildSnapshot,
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

  const db = getAdminClient()
  const { data: row, error: fetchError } = await db
    .from('regear_requests')
    .select('id, status, discord_id, event_id, screenshot_path, screenshot_path_2')
    .eq('id', id)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!row) return { error: tErr('requestNotFound') }
  if (row.discord_id !== session.discordId) return { error: tErr('onlyOwnCancel') }
  if (row.status !== 'pending') return { error: tErr('alreadyProcessedCannotCancel') }

  const { error: deleteError } = await db
    .from('regear_requests')
    .delete()
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

  const db = getAdminClient()
  const { data, error } = await db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, silver, request_type, claimed_silver, payout_silver, status, killboard_verified, admin_notes, created_at, resolved_at, handled_by_username, build_snapshot, auto_generated, events(title)',
    )
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

  const db = getAdminClient()

  // Find slots I'm assigned to, joined through parties to events with a battle
  // start. Battle start is the gate — no start means no regear window yet.
  // We don't gate by isEnded here: members can still submit from the site after
  // the in-game 1-hour window (the cutoff is for the screenshot itself).
  const { data: slots, error: slotError } = await db
    .from('slots')
    .select('role_name, party_id, manual_regear_excluded')
    .eq('assigned_discord_id', session.discordId)
    .eq('manual_regear_excluded', false)
  if (slotError) return { events: [], error: slotError.message }
  if (!slots || slots.length === 0) return { events: [] }

  const { data: parties, error: partiesError } = await db
    .from('parties')
    .select('id, event_id')
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
    .in('id', eventIds)
    .not('battle_started_at', 'is', null)
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
      ? db.from('role_rewards').select('role_name, silver').in('role_name', roleNames)
      : Promise.resolve({ data: [] as { role_name: string; silver: number }[], error: null }),
    db
      .from('regear_requests')
      .select('event_id')
      .eq('discord_id', session.discordId)
      .neq('status', 'rejected')
      .in('event_id', Array.from(eventIdSet)),
  ])
  if (rewardRes.error) return { events: [], error: rewardRes.error.message }
  if (requestRes.error) return { events: [], error: requestRes.error.message }

  const rewardMap = new Map((rewardRes.data ?? []).map((r) => [r.role_name, r.silver]))
  const countByEvent = new Map<string, number>()
  for (const row of requestRes.data ?? []) {
    countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1)
  }

  const result: RegearEligibleEvent[] = events
    .filter((e) => eventToRole.has(e.id))
    .map((e) => {
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

  const db = getAdminClient()
  const { data, error } = await db
    .from('point_ledger')
    .select('delta')
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
    .map((v) => ({
      slot: typeof v.slot === 'string' ? v.slot : '',
      uniqueName: typeof v.uniqueName === 'string' ? v.uniqueName : '',
      enchant: typeof v.enchant === 'number' && Number.isFinite(v.enchant) ? Math.trunc(v.enchant) : 0,
      quality: typeof v.quality === 'number' && Number.isFinite(v.quality) ? Math.trunc(v.quality) : 1,
      count: typeof v.count === 'number' && Number.isFinite(v.count) && v.count > 0 ? Math.trunc(v.count) : 1,
      price:
        typeof v.price === 'number' && Number.isFinite(v.price) && v.price >= 0
          ? Math.trunc(v.price)
          : null,
      city: typeof v.city === 'string' ? v.city : null,
      fallbackTier: typeof v.fallbackTier === 'string' ? v.fallbackTier : null,
      userEdited: v.userEdited === true,
    }))
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

  const db = getAdminClient()
  const { data, error } = await db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, role_name, silver, claimed_silver, payout_silver, status, auto_generated, gear_breakdown, price_warning_level, created_at, admin_notes, events(title)',
    )
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
  }
  return { detail }
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
