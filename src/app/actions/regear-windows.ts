'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { requireManualRegearAllowed } from '@/lib/albion-identity'
import type { AlbionIdentityRelation } from '@/lib/account-albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { REGEAR_WINDOW_MANAGE_CAPS } from '@/lib/regear-window-permissions'
import { SLOT_KEYS, type BuildSnapshot, type RegearType } from '@/types'
import { validateImageUploadFile } from '@/lib/image-upload'
import { parsePositiveSafeInt } from '@/lib/parse-bounded-int'
import {
  craftRegearSlots,
  parseCraftIncludeCapeFormValue,
} from '@/lib/regear-craft-slots'
import { normalizeYoutubeVideoProofUrl } from '@/lib/regear-video-proof'
import { fetchYoutubeVideoProofTitle } from '@/lib/regear-video-proof-metadata'
import { resolveEventRegearPolicy } from '@/lib/regear-event-policy'
import {
  loadPayoutRatePercent,
  loadVideoClaimCeilingBonusSilver,
  loadVideoPayoutRatePercent,
} from './regear-admin-types'

// 이벤트와 무관한 자유 신청 창구 (regear_windows). 관리자가 윈도우를 열고
// (open) / 닫고 (close), 멤버는 열려 있는 윈도우에 manual flow 로 신청한다.
// auto-regear 와 killboard 매칭은 windows 흐름에선 사용하지 않는다 — 본인이
// 사망한 사실을 직접 기재하고 부위별 가격을 입력해 신청.

const SCREENSHOT_BUCKET = 'regear-screenshots'
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

const DEFAULT_MAX_DEATHS_PER_WINDOW = 1

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

// 클라이언트가 보낸 buildSnapshot JSON 을 검증·정규화. 슬롯 키는 SLOT_KEYS 로
// 한정하고 각 슬롯은 { name, id } 두 필드만 허용. 둘 다 null 이거나 둘 다 string
// 이어야 한다 — 혼합 입력은 invalidInput. 빈 스냅샷 (모든 슬롯 null) 은 null 반환.
function parseBuildSnapshotInput(raw: string, roleName: string): BuildSnapshot | 'invalid' | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return 'invalid'
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'invalid'
  const obj = parsed as Record<string, unknown>
  const next: BuildSnapshot = {
    role_name: roleName,
    weapon: { name: null, id: null },
    head: { name: null, id: null },
    armor: { name: null, id: null },
    shoes: { name: null, id: null },
    offhand: { name: null, id: null },
    potion: { name: null, id: null },
    food: { name: null, id: null },
    cape: { name: null, id: null },
    mount: { name: null, id: null },
  }
  let populated = false
  for (const slot of SLOT_KEYS) {
    const slotValue = obj[slot]
    if (slotValue == null) continue
    if (typeof slotValue !== 'object' || Array.isArray(slotValue)) return 'invalid'
    const sv = slotValue as Record<string, unknown>
    const rawName = sv.name
    const rawId = sv.id
    const name = typeof rawName === 'string' && rawName.trim().length > 0 ? rawName.trim() : null
    const id = typeof rawId === 'string' && rawId.trim().length > 0 ? rawId.trim() : null
    if ((name && !id) || (!name && id)) return 'invalid'
    if (name && id) {
      next[slot] = { name, id }
      populated = true
    }
  }
  return populated ? next : null
}

export interface RegearWindow {
  id: string
  title: string
  description: string | null
  maxDeathsPerMember: number
  opensAt: string
  closesAt: string | null
  closedAt: string | null
  closedByUsername: string | null
  createdByUsername: string | null
  createdAt: string
  isOpen: boolean
}

type RegearWindowScope = 'open' | 'all'

interface WindowRow {
  id: string
  title: string
  description: string | null
  max_deaths_per_member: number
  opens_at: string
  closes_at: string | null
  closed_at: string | null
  closed_by_username: string | null
  created_by_username: string | null
  created_at: string
}

function rowToWindow(row: WindowRow, now: number): RegearWindow {
  const closesMs = row.closes_at ? new Date(row.closes_at).getTime() : null
  const opensMs = new Date(row.opens_at).getTime()
  const isOpen =
    !row.closed_at &&
    now >= opensMs &&
    (closesMs === null || now < closesMs)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    maxDeathsPerMember: row.max_deaths_per_member,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    closedAt: row.closed_at,
    closedByUsername: row.closed_by_username,
    createdByUsername: row.created_by_username,
    createdAt: row.created_at,
    isOpen,
  }
}

function normalizeRegearWindowScope(scope: unknown): RegearWindowScope | null {
  return scope === 'open' || scope === 'all' ? scope : null
}

export interface WindowRoleOption {
  roleName: string
  silver: number
  payoutRatePercent: number | null
}

// 멤버가 윈도우 신청 모달에서 역할 + ceiling 을 보고 선택할 수 있게 노출.
// admin-only 인 listRoleRewards 와 별개 — member 세션도 호출 가능.
export async function listRegearRoleOptions(): Promise<{
  options: WindowRoleOption[]
  error?: string
}> {
  const session = await getSession()
  if (!session) return { options: [] }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data, error } = await db
    .from('role_rewards')
    .select('role_name, silver, payout_rate_percent')
    .eq('guild_id', guildId)
    .gt('silver', 0)
    .order('role_name')
  if (error) return { options: [], error: error.message }
  const options: WindowRoleOption[] = (data ?? []).map((row) => ({
    roleName: row.role_name as string,
    silver: row.silver as number,
    payoutRatePercent:
      typeof row.payout_rate_percent === 'number'
        ? row.payout_rate_percent
        : null,
  }))
  return { options }
}

export async function listRegearWindows(scope: unknown = 'open'): Promise<{
  windows: RegearWindow[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  const normalizedScope = normalizeRegearWindowScope(scope)
  if (!normalizedScope) return { windows: [], error: tErr('invalidInput') }

  const session = await getSession()
  if (!session) return { windows: [] }
  const guildId = await getSessionGuildId(session)
  const db =
    normalizedScope === 'all'
      ? await requireAnyCapability(REGEAR_WINDOW_MANAGE_CAPS)
      : getAdminClient()

  let query = db
    .from('regear_windows')
    .select(
      'id, title, description, max_deaths_per_member, opens_at, closes_at, closed_at, closed_by_username, created_by_username, created_at',
    )
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (normalizedScope === 'open') query = query.is('closed_at', null)

  const { data, error } = await query
  if (error) return { windows: [], error: error.message }

  const now = Date.now()
  const windows = (data ?? []).map((row) => rowToWindow(row as WindowRow, now))
  if (normalizedScope === 'open') {
    return { windows: windows.filter((w) => w.isOpen) }
  }
  return { windows }
}

export async function openRegearWindow(formData: FormData): Promise<{
  error?: string
  id?: string
}> {
  const tErr = await getTranslations('adminActionError')
  const session = await getSession()
  if (!session) return { error: tErr('unauthorized') }
  const db = await requireAnyCapability(REGEAR_WINDOW_MANAGE_CAPS)
  const guildId = await getSessionGuildId(session)

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const maxDeathsRaw = String(formData.get('maxDeathsPerMember') ?? '')
  const closesAtRaw = String(formData.get('closesAt') ?? '').trim()

  if (!title) return { error: tErr('regearWindowTitleRequired') }
  if (title.length > 100) return { error: tErr('regearWindowTitleTooLong') }

  const maxDeaths = parsePositiveSafeInt(maxDeathsRaw)
  if (maxDeaths === null || maxDeaths > 20) {
    return { error: tErr('regearWindowMaxDeathsInvalid') }
  }

  let closesAt: string | null = null
  if (closesAtRaw) {
    const ts = new Date(closesAtRaw).getTime()
    if (!Number.isFinite(ts)) return { error: tErr('regearWindowClosesAtInvalid') }
    if (ts <= Date.now()) return { error: tErr('regearWindowClosesAtPast') }
    closesAt = new Date(ts).toISOString()
  }

  const { data, error } = await db
    .from('regear_windows')
    .insert({
      guild_id: guildId,
      title,
      description,
      max_deaths_per_member: maxDeaths,
      opens_at: new Date().toISOString(),
      closes_at: closesAt,
      created_by_discord_id: session.discordId,
      created_by_username: session.username,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/admin/dashboard/regear-windows')
  revalidatePath('/regear')
  return { id: data.id }
}

export async function closeRegearWindow(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const session = await getSession()
  if (!session) return { error: tErr('unauthorized') }
  const db = await requireAnyCapability(REGEAR_WINDOW_MANAGE_CAPS)
  const guildId = await getSessionGuildId(session)

  const { error } = await db
    .from('regear_windows')
    .update({
      closed_at: new Date().toISOString(),
      closed_by_username: session.username,
    })
    .eq('guild_id', guildId)
    .eq('id', id)
    .is('closed_at', null)
  if (error) return { error: error.message }

  revalidatePath('/admin/dashboard/regear-windows')
  revalidatePath('/regear')
  return {}
}

export async function deleteRegearWindow(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const session = await getSession()
  if (!session) return { error: tErr('unauthorized') }
  const db = await requireAnyCapability(REGEAR_WINDOW_MANAGE_CAPS)
  const guildId = await getSessionGuildId(session)

  // 신청이 하나라도 매달려 있으면 삭제 차단 (CASCADE 로 신청까지 사라지면 ledger
  // 괴리 위험). 관리자는 close 만 가능하고 truly empty window 만 삭제 허용.
  const { count, error: countError } = await db
    .from('regear_requests')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('regear_window_id', id)
  if (countError) return { error: countError.message }
  if ((count ?? 0) > 0) return { error: tErr('regearWindowHasRequests') }

  const { error } = await db
    .from('regear_windows')
    .delete()
    .eq('guild_id', guildId)
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/dashboard/regear-windows')
  revalidatePath('/regear')
  return {}
}

export async function requestWindowRegear(formData: FormData): Promise<{
  error?: string
  id?: string
}> {
  const tErr = await getTranslations('memberActionError')
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

  const windowId = String(formData.get('windowId') ?? '')
  const roleName = String(formData.get('roleName') ?? '').trim()
  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
  const videoProofRaw = String(formData.get('videoProofUrl') ?? '').trim()
  const videoProofUrl = videoProofRaw ? normalizeYoutubeVideoProofUrl(videoProofRaw) : null
  if (videoProofRaw && !videoProofUrl) return { error: tErr('invalidVideoProofUrl') }
  const file = formData.get('screenshot')
  const file2 = formData.get('screenshot2')
  const buildSnapshotRaw = String(formData.get('buildSnapshot') ?? '')
  const requestTypeRaw = String(formData.get('requestType') ?? 'death')
  const requestType: RegearType = requestTypeRaw === 'overcharge' ? 'overcharge' : 'death'
  if (requestType === 'overcharge') {
    const overchargeEnabled =
      (await getAppSetting('regear_overcharge_enabled', 'false', guildId)) === 'true'
    if (!overchargeEnabled) return { error: tErr('overchargeDisabled') }
  }
  // 청구 방식은 길드 단위 강제. craft_regear_enabled='true' 면 모든 신규 요청이
  // 'crafted', 'false' 면 'silver'. 멤버는 모드를 선택할 수 없다.
  const craftEnabled =
    (await getAppSetting('craft_regear_enabled', 'false', guildId)) === 'true'
  const fulfillmentMode: 'silver' | 'crafted' = craftEnabled ? 'crafted' : 'silver'
  const craftRequestedSlots = craftEnabled
    ? craftRegearSlots(parseCraftIncludeCapeFormValue(formData.get('craftIncludeCape')))
    : null

  if (!windowId) return { error: tErr('regearWindowMissing') }
  if (!roleName) {
    return { error: tErr('slotRoleMissing') }
  }
  const parsedBuildSnapshot = parseBuildSnapshotInput(buildSnapshotRaw, roleName)
  if (parsedBuildSnapshot === 'invalid') return { error: tErr('invalidInput') }
  const image = await validateImageUploadFile(file, {
    allowedTypes: ALLOWED_MIME,
    maxBytes: MAX_SCREENSHOT_BYTES,
  })
  if (!image.ok) return { error: screenshotUploadErrorMessage(tErr, image.error) }
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

  // 1) 윈도우가 열려 있는지 검증.
  const { data: windowRow, error: windowError } = await db
    .from('regear_windows')
    .select(
      'id, title, max_deaths_per_member, opens_at, closes_at, closed_at',
    )
    .eq('guild_id', guildId)
    .eq('id', windowId)
    .maybeSingle()
  if (windowError) return { error: windowError.message }
  if (!windowRow) return { error: tErr('regearWindowNotFound') }
  const now = Date.now()
  const opensMs = new Date(windowRow.opens_at).getTime()
  const closesMs = windowRow.closes_at ? new Date(windowRow.closes_at).getTime() : null
  if (windowRow.closed_at || now < opensMs || (closesMs !== null && now >= closesMs)) {
    return { error: tErr('regearWindowClosed') }
  }

  // 2) 1인당 데스 신청 한도 (window 컬럼). 오버차지는 데스 횟수에 포함하지 않는다.
  const maxDeaths = windowRow.max_deaths_per_member ?? DEFAULT_MAX_DEATHS_PER_WINDOW
  if (requestType === 'death') {
    const { count: activeCount, error: countError } = await db
      .from('regear_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('regear_window_id', windowId)
      .eq('discord_id', session.discordId)
      .eq('request_type', 'death')
      .neq('status', 'rejected')
    if (countError) return { error: countError.message }
    if ((activeCount ?? 0) >= maxDeaths) {
      return { error: tErr('regearDeathsLimitReached', { max: maxDeaths }) }
    }
  }

  // 3) 역할 ceiling. 0 이면 차단.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver, payout_rate_percent')
    .eq('guild_id', guildId)
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const baseSilver = reward?.silver ?? 0
  if (baseSilver <= 0) return { error: tErr('ceilingNotSetForRole') }
  const [guildBasePayoutRatePercent, guildVideoPayoutRatePercent, guildVideoClaimCeilingBonusSilver] =
    await Promise.all([
      loadPayoutRatePercent(guildId),
      loadVideoPayoutRatePercent(guildId),
      loadVideoClaimCeilingBonusSilver(guildId),
    ])
  const resolvedPolicy = resolveEventRegearPolicy({
    category: '전투',
    eventPolicy: 'role',
    eventSilverCap: null,
    eventMaxDeathsPerMember: maxDeaths,
    eventVideoPolicy: 'inherit',
    eventVideoPayoutRatePercent: null,
    eventVideoClaimCeilingBonusSilver: null,
    eventVideoRateAppliesWithoutProof: false,
    eventAutoPolicy: 'inherit',
    roleSilver: baseSilver,
    rolePayoutRatePercent:
      typeof reward?.payout_rate_percent === 'number' ? reward.payout_rate_percent : null,
    guildBasePayoutRatePercent,
    guildVideoPayoutRatePercent,
    guildVideoClaimCeilingBonusSilver,
    globalMaxDeaths: maxDeaths,
    hasVideoProof: Boolean(videoProofUrl),
    flow: 'manual',
  })
  const silver = resolvedPolicy.silverCap

  const claimedSilver = parsePositiveSafeInt(claimedSilverRaw.replace(/,/g, ''))
  if (claimedSilver === null) {
    return { error: tErr('invalidClaimAmount') }
  }
  if (claimedSilver > silver) {
    return { error: tErr('claimOverCeiling', { ceiling: silver.toLocaleString() }) }
  }
  const videoProofTitle = await fetchYoutubeVideoProofTitle(videoProofUrl)

  // 4) 스크린샷 업로드 → DB insert. windowId 가 path 일부.
  const path = `${session.discordId}/window-${windowId}-${Date.now()}.${image.ext}`
  const { error: uploadError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, image.file, { contentType: image.mime, upsert: false })
  if (uploadError) return { error: tErr('screenshotUploadFailed', { reason: uploadError.message }) }

  let path2: string | null = null
  if (image2?.ok) {
    path2 = `${session.discordId}/window-${windowId}-${Date.now()}-2.${image2.ext}`
    const { error: upload2Error } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path2, image2.file, { contentType: image2.mime, upsert: false })
    if (upload2Error) {
      await db.storage.from(SCREENSHOT_BUCKET).remove([path])
      return { error: tErr('screenshotUploadFailed', { reason: upload2Error.message }) }
    }
  }

  const { data: inserted, error: insertError } = await db
    .from('regear_requests')
    .insert({
      guild_id: guildId,
      event_id: null,
      regear_window_id: windowId,
      event_title_snapshot: windowRow.title,
      discord_id: session.discordId,
      username: session.username,
      role_name: roleName,
      base_silver: baseSilver,
      silver,
      claimed_silver: claimedSilver,
      video_proof_url: videoProofUrl,
      video_proof_title: videoProofTitle,
      request_type: requestType,
      screenshot_path: path,
      screenshot_path_2: path2,
      killboard_verified: false,
      killboard_event_id: null,
      admin_notes: null,
      build_snapshot: parsedBuildSnapshot,
      auto_generated: false,
      fulfillment_mode: fulfillmentMode,
      craft_requested_slots: craftRequestedSlots,
      requester_relation: requesterRelation,
      regear_policy_snapshot: resolvedPolicy.snapshot,
    })
    .select('id')
    .single()
  if (insertError) {
    const cleanup = path2 ? [path, path2] : [path]
    await db.storage.from(SCREENSHOT_BUCKET).remove(cleanup)
    return { error: insertError.message }
  }

  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/regear')
  revalidatePath('/admin/dashboard/regear-windows')
  revalidatePath('/', 'layout')
  return { id: inserted.id }
}
