'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { REGEAR_VERIFICATION_ERROR_PREFIX } from '@/lib/regear-verification'
import { SLOT_KEYS, SLOT_ROLES, type BuildSnapshot, type SlotRole } from '@/types'

// 이벤트와 무관한 자유 신청 창구 (regear_windows). 관리자가 윈도우를 열고
// (open) / 닫고 (close), 멤버는 열려 있는 윈도우에 manual flow 로 신청한다.
// auto-regear 와 killboard 매칭은 windows 흐름에선 사용하지 않는다 — 본인이
// 사망한 사실을 직접 기재하고 부위별 가격을 입력해 신청.

const SCREENSHOT_BUCKET = 'regear-screenshots'
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])

const DEFAULT_MAX_DEATHS_PER_WINDOW = 1

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

export interface WindowRoleOption {
  roleName: string
  silver: number
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
    .select('role_name, silver')
    .eq('guild_id', guildId)
    .gt('silver', 0)
    .order('role_name')
  if (error) return { options: [], error: error.message }
  const options: WindowRoleOption[] = (data ?? []).map((r) => ({
    roleName: r.role_name as string,
    silver: r.silver as number,
  }))
  return { options }
}

export async function listRegearWindows(scope: 'open' | 'all' = 'all'): Promise<{
  windows: RegearWindow[]
  error?: string
}> {
  const session = await getSession()
  if (!session) return { windows: [] }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  let query = db
    .from('regear_windows')
    .select(
      'id, title, description, max_deaths_per_member, opens_at, closes_at, closed_at, closed_by_username, created_by_username, created_at',
    )
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (scope === 'open') query = query.is('closed_at', null)

  const { data, error } = await query
  if (error) return { windows: [], error: error.message }

  const now = Date.now()
  const windows = (data ?? []).map((row) => rowToWindow(row as WindowRow, now))
  if (scope === 'open') {
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
  const db = await requireAdmin()
  const guildId = await getSessionGuildId(session)

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const maxDeathsRaw = String(formData.get('maxDeathsPerMember') ?? '')
  const closesAtRaw = String(formData.get('closesAt') ?? '').trim()

  if (!title) return { error: tErr('regearWindowTitleRequired') }
  if (title.length > 100) return { error: tErr('regearWindowTitleTooLong') }

  const maxDeaths = Number(maxDeathsRaw)
  if (!Number.isFinite(maxDeaths) || !Number.isInteger(maxDeaths) || maxDeaths < 1 || maxDeaths > 20) {
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
  const db = await requireAdmin()
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
  const db = await requireAdmin()
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
  if (requireVerification) {
    const albionError = await requireAlbionVerified(session.discordId, guildId)
    if (albionError) return { error: `${REGEAR_VERIFICATION_ERROR_PREFIX}${albionError}` }
  }

  const windowId = String(formData.get('windowId') ?? '')
  const roleName = String(formData.get('roleName') ?? '').trim()
  const claimedSilverRaw = String(formData.get('claimedSilver') ?? '')
  const file = formData.get('screenshot')
  const file2 = formData.get('screenshot2')
  const buildSnapshotRaw = String(formData.get('buildSnapshot') ?? '')
  // 청구 방식은 길드 단위 강제. craft_regear_enabled='true' 면 모든 신규 요청이
  // 'crafted', 'false' 면 'silver'. 멤버는 모드를 선택할 수 없다.
  const craftEnabled =
    (await getAppSetting('craft_regear_enabled', 'false', guildId)) === 'true'
  const fulfillmentMode: 'silver' | 'crafted' = craftEnabled ? 'crafted' : 'silver'

  if (!windowId) return { error: tErr('regearWindowMissing') }
  if (!roleName || !(SLOT_ROLES as readonly string[]).includes(roleName)) {
    return { error: tErr('slotRoleMissing') }
  }
  const parsedBuildSnapshot = parseBuildSnapshotInput(buildSnapshotRaw, roleName)
  if (parsedBuildSnapshot === 'invalid') return { error: tErr('invalidInput') }
  if (!(file instanceof File) || file.size === 0) return { error: tErr('screenshotMissing') }
  if (file.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
  if (!ALLOWED_MIME.has(file.type)) return { error: tErr('screenshotWrongType') }
  const hasFile2 = file2 instanceof File && file2.size > 0
  if (hasFile2) {
    if (file2.size > MAX_SCREENSHOT_BYTES) return { error: tErr('screenshotTooLarge') }
    if (!ALLOWED_MIME.has(file2.type)) return { error: tErr('screenshotWrongType') }
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

  // 2) 1인당 신청 한도 (window 컬럼). non-rejected 만 카운트.
  const maxDeaths = windowRow.max_deaths_per_member ?? DEFAULT_MAX_DEATHS_PER_WINDOW
  const { count: activeCount, error: countError } = await db
    .from('regear_requests')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('regear_window_id', windowId)
    .eq('discord_id', session.discordId)
    .neq('status', 'rejected')
  if (countError) return { error: countError.message }
  if ((activeCount ?? 0) >= maxDeaths) {
    return { error: tErr('regearDeathsLimitReached', { max: maxDeaths }) }
  }

  // 3) 역할 ceiling. 0 이면 차단.
  const { data: reward, error: rewardError } = await db
    .from('role_rewards')
    .select('silver')
    .eq('guild_id', guildId)
    .eq('role_name', roleName)
    .maybeSingle()
  if (rewardError) return { error: rewardError.message }
  const silver = reward?.silver ?? 0
  if (silver <= 0) return { error: tErr('ceilingNotSetForRole') }

  const claimedSilver = Number(claimedSilverRaw.replace(/,/g, '').trim())
  if (!Number.isFinite(claimedSilver) || !Number.isInteger(claimedSilver) || claimedSilver <= 0) {
    return { error: tErr('invalidClaimAmount') }
  }
  if (claimedSilver > silver) {
    return { error: tErr('claimOverCeiling', { ceiling: silver.toLocaleString() }) }
  }

  // 4) 스크린샷 업로드 → DB insert. windowId 가 path 일부.
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${session.discordId}/window-${windowId}-${Date.now()}.${ext}`
  const { error: uploadError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return { error: tErr('screenshotUploadFailed', { reason: uploadError.message }) }

  let path2: string | null = null
  if (hasFile2) {
    const ext2 = file2.type === 'image/png' ? 'png' : file2.type === 'image/webp' ? 'webp' : 'jpg'
    path2 = `${session.discordId}/window-${windowId}-${Date.now()}-2.${ext2}`
    const { error: upload2Error } = await db.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path2, file2, { contentType: file2.type, upsert: false })
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
      role_name: roleName as SlotRole,
      silver,
      claimed_silver: claimedSilver,
      screenshot_path: path,
      screenshot_path_2: path2,
      killboard_verified: false,
      killboard_event_id: null,
      admin_notes: null,
      build_snapshot: parsedBuildSnapshot,
      auto_generated: false,
      fulfillment_mode: fulfillmentMode,
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
  return { id: inserted.id }
}
