'use server'

// Crafting-based regear server actions. Wraps craft-tasks.ts (which speaks to
// the SQL RPCs) with auth, i18n, and revalidation. Three audiences:
//   1. members — see what's waiting in their box, mark collected
//   2. crafters (is_crafter=true on guild_avatars) — pick up queued tasks,
//      preview material cost, deliver with box number
//   3. admins — toggle is_crafter, view all tasks, cancel
//
// Tenant scoping: every read/write filters by guild_id. Crafter eligibility
// (is_crafter) is also tenant-scoped because the column lives on
// guild_avatars (composite PK guild_id+discord_id).

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAdmin } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import {
  claimCraftTask,
  releaseCraftTask,
  deliverCraftTask,
  collectCraftTask,
  cancelCraftTask,
  convertCraftTaskToSilver,
  type CraftTaskRow,
  type CraftTaskStatus,
} from '@/lib/craft-tasks'
import {
  aggregateBuildSnapshots,
  type CraftAggregateBreakdown,
  type CraftItemAggregateRow,
} from '@/lib/craft-aggregation'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import {
  decrementBuildForDelivery,
  extractGearItemIdsFromBuild,
} from '@/lib/inventory'
import { formatSilver } from '@/lib/silver'
import { getCurrentWeekStartIso } from '@/lib/timezone'
import type { BuildSnapshot } from '@/types'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type CraftCompensationMode = 'volunteer' | 'paid'

export interface CrafterProfile {
  isCrafter: boolean
  compensationMode: CraftCompensationMode
  premiumPct: number
  // 관리자가 할당한 박스 범위. NULL/NULL = 미지정. 둘 다 not-null 이어야만
  // 자동 배정이 동작한다 (DB constraint 로 보장).
  boxRangeStart: number | null
  boxRangeEnd: number | null
}

export interface CraftQueueItem {
  taskId: string
  status: CraftTaskStatus
  regearRequestId: string
  // requester info — denormalized so the UI can render without an extra join
  requesterDiscordId: string
  requesterUsername: string
  // 큐 카드 이벤트별 그룹화에 사용. event_id 가 null 인 경우(과거 데이터/삭제) 는
  // "이벤트 미연결" 그룹으로 분리한다.
  eventId: string | null
  eventTitle: string
  // 이벤트 모임 시각 — 그룹 헤더에 노출. 게시 안 된 이벤트는 null.
  gatherAt: string | null
  roleName: string
  buildSnapshot: BuildSnapshot | null
  claimedSilver: number | null
  // When the underlying regear request was approved (== task creation moment).
  createdAt: string
  // null on queued; set on claimed onwards.
  claimedAt: string | null
  deliveredAt: string | null
  expiresAt: string | null
  // crafter who picked it up (null for queued)
  crafterDiscordId: string | null
  crafterUsername: string | null
  // Filled in at delivery time
  boxNumber: number | null
  craftCity: string | null
  craftFocusUsed: boolean
  materialSilverCost: number | null
  premiumSilver: number
  reimbursementSilver: number | null
  compensationMode: CraftCompensationMode | null
}

export interface MyCraftPickup {
  taskId: string
  eventTitle: string
  roleName: string
  buildSnapshot: BuildSnapshot | null
  boxNumber: number
  craftCity: string | null
  deliveredAt: string
  expiresAt: string | null
  crafterUsername: string | null
}

export interface CraftBoxConfig {
  rangeMin: number
  rangeMax: number
  expiryDays: number
  focusBonusPct: number
  enabled: boolean
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

interface RegearRequestJoin {
  id: string
  discord_id: string
  username: string
  role_name: string
  event_id: string | null
  event_title_snapshot: string | null
  claimed_silver: number | null
  build_snapshot: unknown
}

interface CraftTaskJoinedRow extends CraftTaskRow {
  regear_requests: RegearRequestJoin | RegearRequestJoin[] | null
}

function pickRegearJoin(
  row: CraftTaskJoinedRow,
): RegearRequestJoin | null {
  const j = row.regear_requests
  if (!j) return null
  return Array.isArray(j) ? j[0] ?? null : j
}

function toQueueItem(
  row: CraftTaskJoinedRow,
  fallbackEventTitle: string,
  gatherAtByEventId?: Map<string, string | null>,
): CraftQueueItem {
  const r = pickRegearJoin(row)
  const eventId = r?.event_id ?? null
  return {
    taskId: row.id,
    status: row.status,
    regearRequestId: row.regear_request_id,
    requesterDiscordId: r?.discord_id ?? '',
    requesterUsername: r?.username ?? '',
    eventId,
    eventTitle: r?.event_title_snapshot ?? fallbackEventTitle,
    gatherAt: eventId ? gatherAtByEventId?.get(eventId) ?? null : null,
    roleName: r?.role_name ?? '',
    buildSnapshot: (r?.build_snapshot as BuildSnapshot | null) ?? null,
    claimedSilver: r?.claimed_silver ?? null,
    createdAt: row.created_at,
    claimedAt: row.claimed_at,
    deliveredAt: row.delivered_at,
    expiresAt: row.expires_at,
    crafterDiscordId: row.crafter_discord_id,
    crafterUsername: row.crafter_username,
    boxNumber: row.box_number,
    craftCity: row.craft_city,
    craftFocusUsed: row.craft_focus_used,
    materialSilverCost: row.material_silver_cost,
    premiumSilver: row.premium_silver,
    reimbursementSilver: row.reimbursement_silver,
    compensationMode: row.compensation_mode,
  }
}

async function loadIsCrafter(guildId: string, discordId: string): Promise<boolean> {
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('is_crafter')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  return (data?.is_crafter as boolean | undefined) === true
}

function parseIntegerSetting(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return fallback
  return n
}

// ────────────────────────────────────────────────────────────
// Public — read tenant config (used by both crafter form + admin settings)
// ────────────────────────────────────────────────────────────

export async function getCraftConfig(): Promise<CraftBoxConfig> {
  const session = await getSession()
  // Defaults match the migration's documented defaults.
  if (!session) {
    return { rangeMin: 1, rangeMax: 30, expiryDays: 7, focusBonusPct: 35, enabled: false }
  }
  const guildId = await getSessionGuildId(session)
  const [enabledRaw, minRaw, maxRaw, expiryRaw, focusRaw] = await Promise.all([
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getAppSetting('craft_box_range_min', '1', guildId),
    getAppSetting('craft_box_range_max', '30', guildId),
    getAppSetting('craft_box_expiry_days', '7', guildId),
    getAppSetting('craft_focus_bonus_pct', '35', guildId),
  ])
  return {
    enabled: enabledRaw === 'true',
    rangeMin: parseIntegerSetting(minRaw, 1, 1, 999),
    rangeMax: parseIntegerSetting(maxRaw, 30, 1, 999),
    expiryDays: parseIntegerSetting(expiryRaw, 7, 1, 30),
    focusBonusPct: parseIntegerSetting(focusRaw, 35, 0, 200),
  }
}

export async function getMyCrafterProfile(): Promise<CrafterProfile | null> {
  const session = await getSession()
  if (!session) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select(
      'is_crafter, craft_compensation_mode, craft_premium_pct, craft_box_range_start, craft_box_range_end',
    )
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (!data) return null
  const mode = (data.craft_compensation_mode as CraftCompensationMode | null) ?? 'volunteer'
  return {
    isCrafter: (data.is_crafter as boolean | undefined) === true,
    compensationMode: mode === 'paid' ? 'paid' : 'volunteer',
    premiumPct: typeof data.craft_premium_pct === 'number' ? data.craft_premium_pct : 0,
    boxRangeStart: parseRangeBoundary(data.craft_box_range_start),
    boxRangeEnd: parseRangeBoundary(data.craft_box_range_end),
  }
}

function parseRangeBoundary(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? raw : null
}

// ────────────────────────────────────────────────────────────
// Member — pickup from box
// ────────────────────────────────────────────────────────────

export async function listMyCraftPickups(): Promise<{ pickups: MyCraftPickup[]; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { pickups: [], error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  // Inner-join filters to the requester (regear_requests.discord_id) — only
  // tasks belonging to this member's regear are returned.
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'id, regear_request_id, status, crafter_username, box_number, craft_city, delivered_at, expires_at, created_at, regear_requests!inner(discord_id, role_name, event_title_snapshot, build_snapshot)',
    )
    .eq('guild_id', guildId)
    .eq('status', 'delivered')
    .eq('regear_requests.discord_id', session.discordId)
    .order('delivered_at', { ascending: true })
  if (error) return { pickups: [], error: error.message }

  const pickups: MyCraftPickup[] = (data ?? []).map((row) => {
    const r = Array.isArray(row.regear_requests)
      ? row.regear_requests[0]
      : row.regear_requests
    return {
      taskId: row.id as string,
      eventTitle: r?.event_title_snapshot ?? '',
      roleName: r?.role_name ?? '',
      buildSnapshot: (r?.build_snapshot as BuildSnapshot | null) ?? null,
      boxNumber: (row.box_number as number | null) ?? 0,
      craftCity: row.craft_city as string | null,
      deliveredAt: row.delivered_at as string,
      expiresAt: row.expires_at as string | null,
      crafterUsername: row.crafter_username as string | null,
    }
  })
  return { pickups }
}

export async function markCraftPickupCollected(taskId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  try {
    await collectCraftTask(taskId, guildId, session.discordId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : tErr('serverError')
    if (msg.includes('CRAFT_TASK_NOT_DELIVERED')) {
      return { error: tErr('craftTaskNotDelivered') }
    }
    if (msg.includes('CRAFT_TASK_NOT_YOURS')) {
      return { error: tErr('craftTaskNotYours') }
    }
    return { error: msg }
  }

  // collect 단계는 재고 변동 없음. 재고 차감은 deliver 시점에 이미 끝남.
  // (이전 모델: deliver 시 +1, collect 시 -1 → 새 모델: deliver 시 -1, collect 무변동.)

  revalidatePath('/me')
  revalidatePath('/craft/queue')
  return {}
}

// ────────────────────────────────────────────────────────────
// Crafter — queue + claim/release/deliver
// ────────────────────────────────────────────────────────────

// Lists the open queue (status='queued') plus the caller's own active tasks
// (claimed/delivered). Both lists are tenant-scoped.
export async function listCraftQueueForCrafter(): Promise<{
  queued: CraftQueueItem[]
  mine: CraftQueueItem[]
  isCrafter: boolean
  // 큐 카드에 itemId 별 길드 재고 수량을 표시하기 위한 lookup. 모든 task 의
  // build_snapshot 에서 등장하는 itemId 들의 현재 재고를 한 번에 묶어서 조회.
  // 재고 0/미관리 itemId 는 누락(=undefined) 로 둔다.
  stockByItemId: Record<string, number>
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) {
    return { queued: [], mine: [], isCrafter: false, stockByItemId: {}, error: tErr('loginRequired') }
  }
  const guildId = await getSessionGuildId(session)

  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) {
    return { queued: [], mine: [], isCrafter: false, stockByItemId: {}, error: tErr('crafterOnly') }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, craft_focus_used, material_silver_cost, premium_silver, reimbursement_silver, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_id, event_title_snapshot, claimed_silver, build_snapshot)',
    )
    .eq('guild_id', guildId)
    .in('status', ['queued', 'claimed', 'delivered'])
    .order('created_at', { ascending: true })
  if (error) {
    return { queued: [], mine: [], isCrafter, stockByItemId: {}, error: error.message }
  }

  const tCommon = await getTranslations('common')
  const fallback = tCommon('deletedEvent')
  const rows = (data ?? []) as unknown as CraftTaskJoinedRow[]

  // 그룹 헤더에 모임 시각을 노출하기 위한 events 배치 조회.
  const eventIds = new Set<string>()
  for (const row of rows) {
    const r = pickRegearJoin(row)
    if (r?.event_id) eventIds.add(r.event_id)
  }
  const gatherAtByEventId = new Map<string, string | null>()
  if (eventIds.size > 0) {
    const { data: evs } = await db
      .from('events')
      .select('id, gather_at')
      .in('id', Array.from(eventIds))
    for (const ev of evs ?? []) {
      gatherAtByEventId.set(
        (ev.id as string),
        ((ev as { gather_at?: string | null }).gather_at ?? null),
      )
    }
  }

  const queued: CraftQueueItem[] = []
  const mine: CraftQueueItem[] = []
  for (const row of rows) {
    const item = toQueueItem(row, fallback, gatherAtByEventId)
    if (row.status === 'queued') {
      queued.push(item)
    } else if (row.crafter_discord_id === session.discordId) {
      mine.push(item)
    }
    // 다른 크래프터가 잡고 있는 task 는 노출하지 않는다 (혼동 방지).
  }

  // build_snapshot 에 등장하는 모든 itemId 의 현재 재고를 한 번에 조회. 큐 카드
  // 에서 "이 부위 재고 N 개" 배지를 띄우는 용도. listing 자체는 queued + mine
  // 만 보여주지만, 재고 정보는 두 리스트 합쳐서 한 번의 select 으로 처리.
  const allItemIds = new Set<string>()
  for (const item of [...queued, ...mine]) {
    if (!item.buildSnapshot) continue
    for (const id of extractGearItemIdsFromBuild(item.buildSnapshot)) {
      allItemIds.add(id)
    }
  }
  // 사전에 모든 trackable id 를 0 으로 깔아두고 DB row 가 있는 것만 덮어쓴다.
  // 길드가 한 번도 입출고를 안 한 itemId 는 row 자체가 없는데 (mig 110 의 upsert
  // 패턴), 그런 경우에도 클라이언트가 "tracked·stock 0" 으로 배지를 노출하게.
  const stockByItemId: Record<string, number> = {}
  for (const id of allItemIds) stockByItemId[id] = 0
  if (allItemIds.size > 0) {
    const { data: stock } = await db
      .from('guild_inventory_gear')
      .select('item_id, quantity')
      .eq('guild_id', guildId)
      .in('item_id', Array.from(allItemIds))
    for (const row of stock ?? []) {
      stockByItemId[row.item_id as string] = Number(row.quantity ?? 0)
    }
  }

  return { queued, mine, isCrafter, stockByItemId }
}

export interface CraftQueueTaskEvent {
  id: string
  title: string
  gatherAt: string | null
}

export interface CraftQueueTaskDetail {
  task: CraftQueueItem
  event: CraftQueueTaskEvent | null
  // 현재 로그인한 크래프터가 잡고 있는 task 인지. claimed 상태인 task 의 액션
  // 버튼 노출 여부 결정에 쓰인다.
  isMine: boolean
}

// 단일 craft task 의 디테일 (큐 카드의 "상세" 링크 → /craft/queue/[taskId]).
// 이벤트 / 청구자 / 빌드 / 청구금액 등 전부 노출. 권한 검사는 큐 listing 과 동일.
export async function getCraftQueueTaskDetail(
  taskId: string,
): Promise<{ detail: CraftQueueTaskDetail | null; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { detail: null, error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) {
    return { detail: null, error: tErr('crafterOnly') }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, craft_focus_used, material_silver_cost, premium_silver, reimbursement_silver, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_title_snapshot, claimed_silver, build_snapshot, event_id)',
    )
    .eq('guild_id', guildId)
    .eq('id', taskId)
    .maybeSingle()
  if (error) return { detail: null, error: error.message }
  if (!data) return { detail: null, error: tErr('craftTaskNotFound') }

  const tCommon = await getTranslations('common')
  const fallback = tCommon('deletedEvent')
  const row = data as unknown as CraftTaskJoinedRow & {
    regear_requests: (RegearRequestJoin & { event_id: string | null }) | (RegearRequestJoin & { event_id: string | null })[] | null
  }
  const task = toQueueItem(row, fallback)

  // 다른 크래프터가 잡고 있는 task 는 본인 task 아니면 노출 안 한다 (큐 페이지와
  // 동일 정책). admin 은 모든 task 조회 허용.
  if (
    task.status === 'claimed' &&
    task.crafterDiscordId !== session.discordId &&
    !session.isAdmin
  ) {
    return { detail: null, error: tErr('craftTaskNotFound') }
  }

  const reg = pickRegearJoin(row)
  const eventId = (reg as (RegearRequestJoin & { event_id?: string | null }) | null)?.event_id ?? null
  let event: CraftQueueTaskEvent | null = null
  if (eventId) {
    const { data: ev } = await db
      .from('events')
      .select('id, title, gather_at')
      .eq('id', eventId)
      .maybeSingle()
    if (ev) {
      event = {
        id: ev.id as string,
        title: (ev.title as string | null) ?? task.eventTitle,
        gatherAt: (ev.gather_at as string | null) ?? null,
      }
    }
  }

  const isMine = task.crafterDiscordId === session.discordId
  return { detail: { task, event, isMine } }
}

export interface ClaimCraftQueueInput {
  taskId: string
  compensationMode: CraftCompensationMode
  // 0..200 — only meaningful for paid mode. Caller passes the value the
  // crafter actually entered; we validate range here.
  premiumPct: number
}

export async function claimCraftQueueItem(
  input: ClaimCraftQueueInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) return { error: tErr('crafterOnly') }

  if (input.compensationMode !== 'volunteer' && input.compensationMode !== 'paid') {
    return { error: tErr('invalidInput') }
  }
  if (
    !Number.isInteger(input.premiumPct) ||
    input.premiumPct < 0 ||
    input.premiumPct > 200
  ) {
    return { error: tErr('craftPremiumOutOfRange') }
  }

  try {
    await claimCraftTask({
      taskId: input.taskId,
      guildId,
      crafterDiscordId: session.discordId,
      crafterUsername: session.username,
      compensationMode: input.compensationMode,
      premiumPct: input.premiumPct,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : tErr('serverError')
    if (msg.includes('CRAFT_TASK_NOT_QUEUED')) return { error: tErr('craftTaskNotQueued') }
    if (msg.includes('INVALID_COMPENSATION_MODE')) return { error: tErr('invalidInput') }
    if (msg.includes('INVALID_PREMIUM_PCT')) return { error: tErr('craftPremiumOutOfRange') }
    return { error: msg }
  }
  revalidatePath('/craft/queue')
  return {}
}

export async function releaseCraftQueueItem(
  taskId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  try {
    await releaseCraftTask(taskId, guildId, session.discordId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : tErr('serverError')
    if (msg.includes('CRAFT_TASK_NOT_CLAIMED_BY_YOU')) {
      return { error: tErr('craftTaskNotClaimedByYou') }
    }
    return { error: msg }
  }
  revalidatePath('/craft/queue')
  return {}
}

export interface BulkClaimResult {
  ok: number
  failed: number
  error?: string
}

// 큐에서 여러 task 를 사용자의 default compensation_mode + premium 으로 한 번에
// 잡는다. 개별 RPC 호출이라 race condition 으로 일부가 실패해도 (이미 다른 사람
// 이 잡은 경우) 나머지는 계속 진행. 마지막에 (성공, 실패) 카운트만 반환한다.
const BULK_LIMIT = 50

export async function bulkClaimCraftQueueItems(
  taskIds: string[],
  compensationMode: CraftCompensationMode,
  premiumPct: number,
): Promise<BulkClaimResult> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { ok: 0, failed: 0, error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) return { ok: 0, failed: 0, error: tErr('crafterOnly') }

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return { ok: 0, failed: 0, error: tErr('invalidInput') }
  }
  if (taskIds.length > BULK_LIMIT) {
    return { ok: 0, failed: 0, error: tErr('invalidInput') }
  }
  if (compensationMode !== 'volunteer' && compensationMode !== 'paid') {
    return { ok: 0, failed: 0, error: tErr('invalidInput') }
  }
  if (!Number.isInteger(premiumPct) || premiumPct < 0 || premiumPct > 200) {
    return { ok: 0, failed: 0, error: tErr('craftPremiumOutOfRange') }
  }

  let ok = 0
  let failed = 0
  for (const taskId of taskIds) {
    try {
      await claimCraftTask({
        taskId,
        guildId,
        crafterDiscordId: session.discordId,
        crafterUsername: session.username,
        compensationMode,
        premiumPct,
      })
      ok += 1
    } catch {
      failed += 1
    }
  }

  if (ok > 0) revalidatePath('/craft/queue')
  return { ok, failed }
}

export async function bulkReleaseCraftQueueItems(
  taskIds: string[],
): Promise<BulkClaimResult> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { ok: 0, failed: 0, error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return { ok: 0, failed: 0, error: tErr('invalidInput') }
  }
  if (taskIds.length > BULK_LIMIT) {
    return { ok: 0, failed: 0, error: tErr('invalidInput') }
  }

  let ok = 0
  let failed = 0
  for (const taskId of taskIds) {
    try {
      await releaseCraftTask(taskId, guildId, session.discordId)
      ok += 1
    } catch {
      failed += 1
    }
  }

  if (ok > 0) revalidatePath('/craft/queue')
  return { ok, failed }
}

export interface DeliverCraftQueueInput {
  taskId: string
  boxNumber: number
  materialSilverCost: number
}

export async function deliverCraftQueueItem(
  input: DeliverCraftQueueInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const tDm = await getTranslations('discordDm')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) return { error: tErr('crafterOnly') }

  if (
    !Number.isInteger(input.boxNumber) ||
    input.boxNumber < 1
  ) {
    return { error: tErr('craftBoxInvalid') }
  }
  if (
    !Number.isInteger(input.materialSilverCost) ||
    input.materialSilverCost < 0
  ) {
    return { error: tErr('craftMaterialCostInvalid') }
  }

  const cfg = await getCraftConfig()
  if (input.boxNumber < cfg.rangeMin || input.boxNumber > cfg.rangeMax) {
    return { error: tErr('craftBoxOutOfRange') }
  }

  try {
    await deliverCraftTask({
      taskId: input.taskId,
      guildId,
      crafterDiscordId: session.discordId,
      boxNumber: input.boxNumber,
      materialSilverCost: input.materialSilverCost,
      expiryDays: cfg.expiryDays,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : tErr('serverError')
    if (msg.includes('BOX_OUT_OF_RANGE')) return { error: tErr('craftBoxOutOfRange') }
    if (msg.includes('MATERIAL_COST_NEGATIVE')) return { error: tErr('craftMaterialCostInvalid') }
    if (msg.includes('CRAFT_TASK_NOT_CLAIMED_BY_YOU')) {
      return { error: tErr('craftTaskNotClaimedByYou') }
    }
    if (msg.includes('CRAFT_TASK_DELIVER_FAILED')) {
      return { error: tErr('craftTaskNotClaimedByYou') }
    }
    if (msg.includes('duplicate key value') || msg.includes('craft_tasks_box_unique_delivered')) {
      return { error: tErr('craftBoxTaken') }
    }
    return { error: msg }
  }

  // DM the requester — best-effort. The reverse-join lookup also pulls
  // build_snapshot so we can update gear inventory in the same query.
  const db = getAdminClient()
  const { data: dmRow } = await db
    .from('craft_tasks')
    .select(
      'box_number, regear_requests!inner(discord_id, event_title_snapshot, build_snapshot)',
    )
    .eq('guild_id', guildId)
    .eq('id', input.taskId)
    .maybeSingle()
  const r = Array.isArray(dmRow?.regear_requests)
    ? dmRow?.regear_requests[0]
    : dmRow?.regear_requests
  if (r?.discord_id) {
    void sendDiscordDmToUser(r.discord_id, guildId, {
      title: tDm('craftDeliveredTitle'),
      body: tDm('craftDeliveredBody', {
        event: r.event_title_snapshot ?? '',
        box: input.boxNumber,
        crafter: session.username,
      }),
      url: '/me',
    })
  }

  // 자동 재고 -1: 박스에 들어가는 장비는 길드 재고에서 빠져나간 상태로 본다.
  // 베스트 에포트 — RPC floor=0 라 음수가 되지 않고, 사전 재고가 부족했던
  // itemId 가 한 개라도 있으면 craft_tasks.inventory_warned=true 로 마킹해
  // "경고 납품" (시장 구매로 즉시 리기어) 으로 통계에서 분리한다.
  const buildSnapshot = (r?.build_snapshot as BuildSnapshot | null) ?? null
  if (buildSnapshot) {
    try {
      const result = await decrementBuildForDelivery(
        guildId,
        buildSnapshot,
        session.discordId,
      )
      if (!result.empty && result.warnedItemIds.length > 0) {
        await db
          .from('craft_tasks')
          .update({ inventory_warned: true })
          .eq('guild_id', guildId)
          .eq('id', input.taskId)
      }
    } catch (e) {
      console.error('[craft.deliver] inventory hook failed', {
        guildId,
        taskId: input.taskId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  revalidatePath('/craft/queue')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/inventory')
  revalidatePath('/craft/inventory')
  return {}
}

// ────────────────────────────────────────────────────────────
// Crafter — own profile defaults
// ────────────────────────────────────────────────────────────

export async function setMyCrafterDefaults(
  compensationMode: CraftCompensationMode,
  premiumPct: number,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  if (compensationMode !== 'volunteer' && compensationMode !== 'paid') {
    return { error: tErr('invalidInput') }
  }
  if (!Number.isInteger(premiumPct) || premiumPct < 0 || premiumPct > 200) {
    return { error: tErr('craftPremiumOutOfRange') }
  }
  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) return { error: tErr('crafterOnly') }

  const db = getAdminClient()
  const { error } = await db
    .from('guild_avatars')
    .update({
      craft_compensation_mode: compensationMode,
      craft_premium_pct: premiumPct,
    })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }
  revalidatePath('/craft/queue')
  revalidatePath('/craft/my-tasks')
  return {}
}

// ────────────────────────────────────────────────────────────
// Admin — manage crafters + tasks
// ────────────────────────────────────────────────────────────

export interface AdminCrafterRow {
  discordId: string
  username: string
  isCrafter: boolean
  compensationMode: CraftCompensationMode
  premiumPct: number
  boxRangeStart: number | null
  boxRangeEnd: number | null
}

export async function listGuildCrafters(): Promise<{
  crafters: AdminCrafterRow[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { crafters: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data, error } = await db
      .from('guild_avatars')
      .select(
        'discord_id, username, is_crafter, craft_compensation_mode, craft_premium_pct, craft_box_range_start, craft_box_range_end',
      )
      .eq('guild_id', guildId)
      .eq('is_crafter', true)
      .is('withdrawn_at', null)
      .order('username', { ascending: true })
    if (error) return { crafters: [], error: error.message }
    const crafters: AdminCrafterRow[] = (data ?? []).map((r) => ({
      discordId: r.discord_id as string,
      username: r.username as string,
      isCrafter: (r.is_crafter as boolean | undefined) === true,
      compensationMode:
        ((r.craft_compensation_mode as string | null) ?? 'volunteer') === 'paid'
          ? 'paid'
          : 'volunteer',
      premiumPct:
        typeof r.craft_premium_pct === 'number' ? r.craft_premium_pct : 0,
      boxRangeStart: parseRangeBoundary(r.craft_box_range_start),
      boxRangeEnd: parseRangeBoundary(r.craft_box_range_end),
    }))
    return { crafters }
  } catch (e) {
    return { crafters: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function setMemberCrafterFlag(
  discordId: string,
  isCrafter: boolean,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { error } = await db
      .from('guild_avatars')
      .update({ is_crafter: isCrafter })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/craft')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 관리자가 크래프터별 박스 범위 [start, end] 를 지정하거나 (둘 다 number) 해제
// (둘 다 null) 한다. 길드 내 다른 크래프터의 범위와 겹치면 거부 — 실수로 같은
// 박스를 두 명에게 할당해서 충돌 나는 것을 방지한다.
export async function setCrafterBoxRange(
  discordId: string,
  start: number | null,
  end: number | null,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tCraft = await getTranslations('memberActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    // 둘 다 null (해제) or 둘 다 not-null (할당) — 한쪽만 들어오면 입력 오류.
    if ((start == null) !== (end == null)) return { error: tErr('invalidInput') }
    if (start != null && end != null) {
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start
      ) {
        return { error: tErr('invalidInput') }
      }
      // 길드 설정 박스 범위 안인지 검사 — 어드민 설정에서 정한 rangeMin/rangeMax 를 벗어난
      // 번호는 의미 없음 (DeliverDialog 자체가 그 범위 밖 박스 번호를 거부한다).
      const cfg = await getCraftConfig()
      if (start < cfg.rangeMin || end > cfg.rangeMax) {
        return { error: tCraft('craftBoxOutOfRange') }
      }
      // 겹침 검사 — 같은 길드의 다른 크래프터 중에 (other.start ≤ end) AND
      // (other.end ≥ start) 인 행이 있으면 거부.
      const { data: overlaps, error: overlapErr } = await db
        .from('guild_avatars')
        .select('discord_id, username, craft_box_range_start, craft_box_range_end')
        .eq('guild_id', guildId)
        .neq('discord_id', discordId)
        .eq('is_crafter', true)
        .is('withdrawn_at', null)
        .not('craft_box_range_start', 'is', null)
        .not('craft_box_range_end', 'is', null)
        .lte('craft_box_range_start', end)
        .gte('craft_box_range_end', start)
      if (overlapErr) return { error: overlapErr.message }
      if (overlaps && overlaps.length > 0) {
        const conflict = overlaps[0] as {
          username: string
          craft_box_range_start: number
          craft_box_range_end: number
        }
        return {
          error: tErr('craftBoxRangeOverlap', {
            user: conflict.username,
            start: conflict.craft_box_range_start,
            end: conflict.craft_box_range_end,
          }),
        }
      }
    }

    const { error } = await db
      .from('guild_avatars')
      .update({
        craft_box_range_start: start,
        craft_box_range_end: end,
      })
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/queue')
    revalidatePath('/craft/my-tasks')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 자동 박스 배정 — DeliverDialog 가 열릴 때 호출해 모달의 박스 칸을 미리
// 채운다. 알고리즘:
//   1) 이 task 의 요청자(R) 가 이미 점유 중인 박스 N 이 있으면 → N 재사용.
//      "점유 중" = 그 박스에 status='delivered' 인 task 가 하나라도 있음.
//   2) 없으면 → 이 크래프터의 범위 [start, end] 안에서 다른 요청자가 점유
//      안 한 가장 작은 박스. ("다른 요청자가 점유" = 그 박스에 다른 사람의
//      delivered task 가 있음.)
//   3) 범위 미지정 / 범위 안 박스가 모두 다른 요청자 점유 → null + reason.
//
// 반환되는 reason 으로 클라이언트가 적절한 안내를 띄운다 (예: "범위 미지정,
// 관리자에게 요청하세요" / "범위 박스가 모두 사용 중").
export type AutoAssignReason =
  | 'requesterReuse' // 요청자가 이미 사용 중인 박스 — 같이 모음
  | 'rangeFree' // 범위 안 빈 박스 자동 선택
  | 'rangeFull' // 범위 안 박스가 모두 다른 요청자 점유
  | 'noRange' // 크래프터 범위 미지정

export interface AutoAssignResult {
  boxNumber: number | null
  reason: AutoAssignReason
}

export async function computeAutoAssignBox(
  taskId: string,
): Promise<AutoAssignResult & { error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) {
    return { boxNumber: null, reason: 'noRange', error: tErr('loginRequired') }
  }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()

  const { data: task, error: taskErr } = await db
    .from('craft_tasks')
    .select(
      'id, guild_id, crafter_discord_id, regear_request_id, regear_requests!inner(discord_id)',
    )
    .eq('id', taskId)
    .eq('guild_id', guildId)
    .maybeSingle()
  if (taskErr || !task) {
    return { boxNumber: null, reason: 'noRange', error: tErr('craftTaskNotFound') }
  }
  if (task.crafter_discord_id !== session.discordId && !session.isAdmin) {
    return { boxNumber: null, reason: 'noRange', error: tErr('craftNotClaimer') }
  }
  const requesterDiscordId = (
    task.regear_requests as unknown as { discord_id: string }
  ).discord_id

  // 1) 이 요청자가 이미 점유 중인 박스가 있는지 — 같은 길드의 status='delivered'
  //    + 같은 요청자 + 박스 번호 not-null. 있으면 그 박스 그대로 사용.
  const { data: requesterOccupied } = await db
    .from('craft_tasks')
    .select('box_number, regear_requests!inner(discord_id)')
    .eq('guild_id', guildId)
    .eq('status', 'delivered')
    .eq('regear_requests.discord_id', requesterDiscordId)
    .not('box_number', 'is', null)
    .order('delivered_at', { ascending: false })
    .limit(1)
  if (requesterOccupied && requesterOccupied.length > 0) {
    const n = requesterOccupied[0].box_number as number | null
    if (typeof n === 'number') {
      return { boxNumber: n, reason: 'requesterReuse' }
    }
  }

  // 2) 크래프터의 범위 조회. 미지정이면 noRange.
  const { data: crafter } = await db
    .from('guild_avatars')
    .select('craft_box_range_start, craft_box_range_end')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  const rangeStart = parseRangeBoundary(crafter?.craft_box_range_start)
  const rangeEnd = parseRangeBoundary(crafter?.craft_box_range_end)
  if (rangeStart == null || rangeEnd == null) {
    return { boxNumber: null, reason: 'noRange' }
  }

  // 다른 요청자가 점유 중인 박스 번호들. (같은 요청자가 이미 점유 중인 케이스는
  // 위에서 처리됐으므로 여기 도달했다는 건 이 요청자는 점유 중인 박스 없음.)
  const { data: occupiedRows } = await db
    .from('craft_tasks')
    .select('box_number')
    .eq('guild_id', guildId)
    .eq('status', 'delivered')
    .gte('box_number', rangeStart)
    .lte('box_number', rangeEnd)
  const occupied = new Set<number>()
  for (const row of occupiedRows ?? []) {
    const n = row.box_number as number | null
    if (typeof n === 'number') occupied.add(n)
  }

  for (let n = rangeStart; n <= rangeEnd; n++) {
    if (!occupied.has(n)) {
      return { boxNumber: n, reason: 'rangeFree' }
    }
  }
  return { boxNumber: null, reason: 'rangeFull' }
}

export async function listAllCraftTasksAdmin(
  scope: 'active' | 'all' = 'active',
): Promise<{ tasks: CraftQueueItem[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tCommon = await getTranslations('common')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { tasks: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const activeStatuses: CraftTaskStatus[] = ['queued', 'claimed', 'delivered']
    let query = db
      .from('craft_tasks')
      .select(
        'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, craft_focus_used, material_silver_cost, premium_silver, reimbursement_silver, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_id, event_title_snapshot, claimed_silver, build_snapshot)',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (scope === 'active') query = query.in('status', activeStatuses as string[])
    const { data, error } = await query
    if (error) return { tasks: [], error: error.message }

    const fallback = tCommon('deletedEvent')
    const rows = (data ?? []) as unknown as CraftTaskJoinedRow[]

    // 어드민 화면에서도 그룹 헤더용 모임 시각이 필요할 수 있어 events 배치 조회.
    const eventIds = new Set<string>()
    for (const row of rows) {
      const r = pickRegearJoin(row)
      if (r?.event_id) eventIds.add(r.event_id)
    }
    const gatherAtByEventId = new Map<string, string | null>()
    if (eventIds.size > 0) {
      const { data: evs } = await db
        .from('events')
        .select('id, gather_at')
        .in('id', Array.from(eventIds))
      for (const ev of evs ?? []) {
        gatherAtByEventId.set(
          (ev.id as string),
          ((ev as { gather_at?: string | null }).gather_at ?? null),
        )
      }
    }

    const tasks = rows.map((r) => toQueueItem(r, fallback, gatherAtByEventId))
    return { tasks }
  } catch (e) {
    return { tasks: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Admin force-cancel. Used when the request was approved as crafted but the
// guild can't actually craft it (artifact, missing recipe, etc.) — admin
// cancels the craft task; if they also want to pay out silver, they should
// follow up with the existing manual point adjustment flow.
export async function cancelCraftTaskAdmin(taskId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    try {
      await cancelCraftTask(taskId, guildId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr('serverError')
      if (msg.includes('CRAFT_TASK_NOT_CANCELLABLE')) {
        return { error: tErr('craftTaskNotCancellable') }
      }
      return { error: msg }
    }
    revalidatePath('/admin/dashboard/craft')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Convert a queued/claimed crafted task to silver: cancel the craft side and
// credit the original member's point ledger for the claimed amount. Useful
// when the build turns out to contain artifacts. The DB function does all
// three updates (cancel + flip mode + ledger insert) atomically — partial
// failure can't leave the member without a payout.
export async function convertCraftTaskToSilverAdmin(
  taskId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    // Look up the requester + event title for the DM before mutating.
    const { data: task, error: fetchError } = await db
      .from('craft_tasks')
      .select(
        'status, regear_requests!inner(discord_id, event_title_snapshot)',
      )
      .eq('guild_id', guildId)
      .eq('id', taskId)
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!task) return { error: tErr('craftTaskNotFound') }
    if (task.status !== 'queued' && task.status !== 'claimed') {
      return { error: tErr('craftTaskNotCancellable') }
    }
    const r = Array.isArray(task.regear_requests)
      ? task.regear_requests[0]
      : task.regear_requests

    let credit = 0
    try {
      credit = await convertCraftTaskToSilver(taskId, guildId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr('serverError')
      if (msg.includes('CRAFT_TASK_NOT_CANCELLABLE')) {
        return { error: tErr('craftTaskNotCancellable') }
      }
      if (msg.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      return { error: msg }
    }

    if (credit > 0 && r?.discord_id) {
      void sendDiscordDmToUser(r.discord_id as string, guildId, {
        title: tDm('regearApprovedTitle'),
        body: tDm('regearApprovedBody', {
          event: r.event_title_snapshot ?? '',
          silver: formatSilver(credit),
        }),
        url: '/me',
      })
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/me')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// "되돌리기" — admin 이 "제작 의뢰로 보내기" 결정을 취소하고 청구를 다시
// 처음 pending 상태로 복구. craft_task 는 cancelled 처리되고 regear_requests
// 는 status=pending 으로 되돌아가서 admin 이 다시 (silver / crafted / reject)
// 중 하나를 고를 수 있게 된다. 마이그 128 RPC 위임.
export async function revertCraftTaskToPendingAdmin(
  taskId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { error } = await db.rpc('revert_crafted_to_pending', {
      p_task_id: taskId,
      p_guild_id: guildId,
    })
    if (error) {
      const msg = error.message
      if (msg.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      if (msg.includes('CRAFT_TASK_NOT_REVERTIBLE')) {
        return { error: tErr('craftTaskNotCancellable') }
      }
      return { error: msg }
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/craft/queue')
    revalidatePath('/me')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Tenant-wide settings setter (admin only). Validation here mirrors the SQL
// constraints; UI passes already-coerced numbers.
export interface UpdateCraftSettingsInput {
  enabled: boolean
  rangeMin: number
  rangeMax: number
  expiryDays: number
  focusBonusPct: number
}

export async function updateCraftSettingsAdmin(
  input: UpdateCraftSettingsInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    if (
      !Number.isInteger(input.rangeMin) ||
      !Number.isInteger(input.rangeMax) ||
      input.rangeMin < 1 ||
      input.rangeMax < input.rangeMin ||
      input.rangeMax > 999
    ) {
      return { error: tErr('craftBoxRangeInvalid') }
    }
    if (
      !Number.isInteger(input.expiryDays) ||
      input.expiryDays < 1 ||
      input.expiryDays > 30
    ) {
      return { error: tErr('craftExpiryInvalid') }
    }
    if (
      !Number.isInteger(input.focusBonusPct) ||
      input.focusBonusPct < 0 ||
      input.focusBonusPct > 200
    ) {
      return { error: tErr('craftFocusBonusInvalid') }
    }

    const rows = [
      { key: 'craft_regear_enabled', value: input.enabled ? 'true' : 'false' },
      { key: 'craft_box_range_min', value: String(input.rangeMin) },
      { key: 'craft_box_range_max', value: String(input.rangeMax) },
      { key: 'craft_box_expiry_days', value: String(input.expiryDays) },
      { key: 'craft_focus_bonus_pct', value: String(input.focusBonusPct) },
    ].map((r) => ({ ...r, guild_id: guildId, updated_at: new Date().toISOString() }))

    const { error } = await db
      .from('app_settings')
      .upsert(rows, { onConflict: 'guild_id,key' })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/craft')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// ────────────────────────────────────────────────────────────
// Admin — per-event craft regear aggregation
// ────────────────────────────────────────────────────────────

export interface EventCraftAggregateResult {
  breakdown: CraftAggregateBreakdown
  // 진행 단계별 카운트 — 어드민이 "재료 얼마나 더 사야 하나" 가늠.
  // queued = 아직 크래프터가 안 잡음, claimed = 잡고 작업 중,
  // delivered = 박스에 넣어둠 (청구자 픽업 대기). collected/expired/cancelled 는
  // 합산에서 제외 (이미 가져갔거나 무효).
  queuedCount: number
  claimedCount: number
  deliveredCount: number
}

// 이벤트 상세 페이지 위젯에 노출할 집계. 해당 이벤트에서 발생한 제작 리기어 청구
// (regear_requests.event_id + craft_tasks 가 이미 만들어진 = admin 승인됨) 의
// build_snapshot 들을 모아 aggregateBuildSnapshots() 에 넘긴다. fulfillment_mode
// 별도 필터 불필요 — craft_tasks 가 존재한다는 사실 자체가 'crafted' 모드 임을
// 보장 (104/106 마이그레이션의 RPC 가 그렇게만 만든다).
export async function getEventCraftAggregate(eventId: string): Promise<{
  result: EventCraftAggregateResult | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { result: null, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const db = getAdminClient()
    const { data, error } = await db
      .from('craft_tasks')
      .select(
        'status, regear_requests!inner(event_id, build_snapshot)',
      )
      .eq('guild_id', guildId)
      .eq('regear_requests.event_id', eventId)
      .in('status', ['queued', 'claimed', 'delivered'])
    if (error) return { result: null, error: error.message }

    const snapshots: (BuildSnapshot | null)[] = []
    let queuedCount = 0
    let claimedCount = 0
    let deliveredCount = 0
    for (const row of (data ?? []) as Array<{
      status: CraftTaskStatus
      regear_requests:
        | { build_snapshot: unknown }
        | { build_snapshot: unknown }[]
        | null
    }>) {
      const r = Array.isArray(row.regear_requests)
        ? row.regear_requests[0]
        : row.regear_requests
      snapshots.push((r?.build_snapshot as BuildSnapshot | null) ?? null)
      if (row.status === 'queued') queuedCount++
      else if (row.status === 'claimed') claimedCount++
      else if (row.status === 'delivered') deliveredCount++
    }

    const breakdown = aggregateBuildSnapshots(snapshots)
    return { result: { breakdown, queuedCount, claimedCount, deliveredCount } }
  } catch (e) {
    return {
      result: null,
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}

// 어드민 화면용 "제작 수요" 통계. 운영 KPI (회수/만료/실버) 가 아니라 인게임에
// 가까운 질문 — "지금 길드원들이 어떤 장비를 가장 많이 청구하나" — 에 답한다.
// 데이터 소스는 regear_requests.build_snapshot. craft_tasks 가 아니라 모든 리기어
// 신청을 포함한다 (실버/제작 모드 무관). 자동 리기어도 포함되어 ZvZ 손실 추세를
// 그대로 보여준다.
//
// 두 윈도우: lifetime (가입 이후 전체) + weekly (PT 월요일 00:00~). 주 경계는
// timezone.ts:getCurrentWeekStartIso — 사이트 다른 위젯과 동일.
//
// 슬롯 필터: 제작자가 만들 수 없는 mount/food/potion 은 craft-aggregation 의
// 기본 제외 규칙으로 자동 제거. 결과는 무기/머리/갑옷/신발/보조무기/망토.
export interface CraftDemandTopItem {
  itemId: string
  itemName: string | null
  count: number
  // 같은 itemId 가 여러 슬롯에 등장한 경우 — 예: 한 손 단도가 weapon 과 offhand
  // 양쪽에 나오면 ['weapon','offhand']. UI 가 "주무기 외 보조무기로도 쓰임"
  // 같은 힌트를 표시할 때 활용.
  slots: string[]
}

export interface CraftDemandSlotBucket {
  // SLOT_KEYS 와 동일 (mount/food/potion 제외) — 표시 라벨은 i18n 측에서 매핑.
  slotKey: string
  count: number
}

export interface CraftDemandBucket {
  taskCount: number
  topItems: CraftDemandTopItem[]
  slotTotals: CraftDemandSlotBucket[]
}

export interface CraftDemandStatsResult {
  lifetime: CraftDemandBucket
  weekly: CraftDemandBucket
  weekSinceIso: string
  mode: CraftDemandStatsMode
}

// 'all' = 모든 청구 (예전 동작) — 거절/취소 포함, "그 시점 수요" 관점.
// 'delivered' = 실제로 제작 납품된 작업 (craft_tasks.status in ('delivered','collected'))
//   기준 — "운영자가 정말로 만들어 채운 분량" 관점. 기본값은 'delivered'.
export type CraftDemandStatsMode = 'all' | 'delivered'

const DEMAND_TOP_ITEM_LIMIT = 8

export async function loadCraftDemandStatsAdmin(
  mode: CraftDemandStatsMode = 'delivered',
): Promise<{
  stats: CraftDemandStatsResult | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { stats: null, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const weekSinceIso = getCurrentWeekStartIso()

    const { lifetimeSnapshots, weeklySnapshots, error: queryError } =
      mode === 'delivered'
        ? await fetchDeliveredDemandSnapshots(db, guildId, weekSinceIso)
        : await fetchAllDemandSnapshots(db, guildId, weekSinceIso)
    if (queryError) return { stats: null, error: queryError }

    return {
      stats: {
        lifetime: bucketFromSnapshots(lifetimeSnapshots),
        weekly: bucketFromSnapshots(weeklySnapshots),
        weekSinceIso,
        mode,
      },
    }
  } catch (e) {
    return {
      stats: null,
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}

interface DemandSnapshotResult {
  lifetimeSnapshots: (BuildSnapshot | null)[]
  weeklySnapshots: (BuildSnapshot | null)[]
  error?: string
}

async function fetchAllDemandSnapshots(
  db: Awaited<ReturnType<typeof requireAdmin>>,
  guildId: string,
  weekSinceIso: string,
): Promise<DemandSnapshotResult> {
  // 자동 리기어 (auto_generated=true) 도 포함해야 사망 트래킹 흐름의 수요까지
  // 한 그래프로 보인다. 어드민이 거절·취소한 건도 "그 시점 수요" 로는 유효 —
  // status 필터를 걸지 않는다.
  const { data, error } = await db
    .from('regear_requests')
    .select('build_snapshot, created_at')
    .eq('guild_id', guildId)
  if (error) {
    return { lifetimeSnapshots: [], weeklySnapshots: [], error: error.message }
  }

  const rows = (data ?? []) as Array<{
    build_snapshot: unknown
    created_at: string
  }>

  const lifetimeSnapshots: (BuildSnapshot | null)[] = []
  const weeklySnapshots: (BuildSnapshot | null)[] = []
  for (const row of rows) {
    const snap = (row.build_snapshot as BuildSnapshot | null) ?? null
    lifetimeSnapshots.push(snap)
    if (row.created_at >= weekSinceIso) weeklySnapshots.push(snap)
  }

  return { lifetimeSnapshots, weeklySnapshots }
}

async function fetchDeliveredDemandSnapshots(
  db: Awaited<ReturnType<typeof requireAdmin>>,
  guildId: string,
  weekSinceIso: string,
): Promise<DemandSnapshotResult> {
  // 'delivered' 모드: 제작자가 실제로 박스에 납품한 작업 (status delivered/collected)
  // 만 집계. 시간 기준은 craft_tasks.delivered_at — "이번 주에 만들어진 분량"
  // 의미를 살리기 위해 regear_requests.created_at 대신 사용.
  const { data, error } = await db
    .from('craft_tasks')
    .select('delivered_at, regear_requests!inner(build_snapshot)')
    .eq('guild_id', guildId)
    .in('status', ['delivered', 'collected'])
    .not('delivered_at', 'is', null)
  if (error) {
    return { lifetimeSnapshots: [], weeklySnapshots: [], error: error.message }
  }

  const rows = (data ?? []) as Array<{
    delivered_at: string | null
    regear_requests:
      | { build_snapshot: unknown }
      | { build_snapshot: unknown }[]
      | null
  }>

  const lifetimeSnapshots: (BuildSnapshot | null)[] = []
  const weeklySnapshots: (BuildSnapshot | null)[] = []
  for (const row of rows) {
    const r = Array.isArray(row.regear_requests)
      ? row.regear_requests[0]
      : row.regear_requests
    const snap = (r?.build_snapshot as BuildSnapshot | null) ?? null
    lifetimeSnapshots.push(snap)
    if (row.delivered_at && row.delivered_at >= weekSinceIso) {
      weeklySnapshots.push(snap)
    }
  }

  return { lifetimeSnapshots, weeklySnapshots }
}

function bucketFromSnapshots(snapshots: (BuildSnapshot | null)[]): CraftDemandBucket {
  const breakdown = aggregateBuildSnapshots(snapshots)
  const slotTotalsMap = new Map<string, number>()
  for (const item of breakdown.items) {
    for (const slot of item.slots) {
      slotTotalsMap.set(slot, (slotTotalsMap.get(slot) ?? 0) + item.count)
    }
  }
  const slotTotals = [...slotTotalsMap.entries()]
    .map(([slotKey, count]) => ({ slotKey, count }))
    .sort((a, b) => b.count - a.count)

  const topItems = breakdown.items.slice(0, DEMAND_TOP_ITEM_LIMIT).map((item) => ({
    itemId: item.itemId,
    itemName: item.itemName,
    count: item.count,
    slots: [...item.slots],
  }))

  return {
    taskCount: breakdown.taskCount,
    topItems,
    slotTotals,
  }
}

// 진행 중인 제작 작업 (queued + claimed) 의 itemId 별 합산. delivered 는 이미
// 박스에 들어갔으니 작업 끝난 상태라 제외한다. 운영자가 "지금 길드 창고에서 어떤
// 장비를 미리 빼두면 제작자들이 일을 멈추지 않을까" 를 보기 위한 집계.
//
// 정련 재료 분해는 폐기 (마이그 112 + 2026-05-02 recipe 데이터 폐기). 완제품
// itemId 단위만 카운트한다.
export interface CraftActiveItemRow {
  itemId: string
  itemName: string | null
  count: number
}

export interface CraftActiveMaterialStatsResult {
  // queued + claimed 합계.
  taskCount: number
  queuedCount: number
  claimedCount: number
  items: CraftActiveItemRow[]
}

export async function loadCraftActiveMaterialStatsAdmin(): Promise<{
  result: CraftActiveMaterialStatsResult | null
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAdmin()
    const session = await getSession()
    if (!session) return { result: null, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const db = getAdminClient()
    const { data, error } = await db
      .from('craft_tasks')
      .select('status, regear_requests!inner(build_snapshot)')
      .eq('guild_id', guildId)
      .in('status', ['queued', 'claimed'])
    if (error) return { result: null, error: error.message }

    const snapshots: (BuildSnapshot | null)[] = []
    let queuedCount = 0
    let claimedCount = 0
    for (const row of (data ?? []) as Array<{
      status: CraftTaskStatus
      regear_requests:
        | { build_snapshot: unknown }
        | { build_snapshot: unknown }[]
        | null
    }>) {
      const r = Array.isArray(row.regear_requests)
        ? row.regear_requests[0]
        : row.regear_requests
      snapshots.push((r?.build_snapshot as BuildSnapshot | null) ?? null)
      if (row.status === 'queued') queuedCount++
      else if (row.status === 'claimed') claimedCount++
    }

    const breakdown = aggregateBuildSnapshots(snapshots)
    const items: CraftActiveItemRow[] = breakdown.items.map(
      (it: CraftItemAggregateRow) => ({
        itemId: it.itemId,
        itemName: it.itemName,
        count: it.count,
      }),
    )

    return {
      result: {
        taskCount: breakdown.taskCount,
        queuedCount,
        claimedCount,
        items,
      },
    }
  } catch (e) {
    return {
      result: null,
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}
