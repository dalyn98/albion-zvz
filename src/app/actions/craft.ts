'use server'


import { publicActionError } from '@/lib/public-action-error'
// Crafting-based regear server actions — public types + 멤버 픽업 + 크래프터
// 본인 프로필 + 자동 박스 배정. 크래프터 큐 플로우는 craft-queue.ts, 어드민
// 운영은 craft-admin.ts, 통계는 craft-stats-admin.ts 로 분리되어 있다.
//
// Tenant scoping: every read/write filters by guild_id. Crafter eligibility
// (is_crafter) is also tenant-scoped because the column lives on
// guild_avatars (composite PK guild_id+discord_id).

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  getSession,
  sessionHasAny,
  type SessionPayload,
} from '@/lib/session'
import { requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { CAP } from '@/lib/permissions'
import {
  collectCraftTask,
  type CraftMaterialSource,
  type CraftTaskStatus,
} from '@/lib/craft-tasks'
import {
  loadIsCrafter,
  parseRangeBoundary,
} from '@/lib/craft-task-mapping'
import type { BuildSnapshot } from '@/types'
import {
  normalizeCraftRegearSlots,
  type CraftRegearSlot,
} from '@/lib/regear-craft-slots'
import { isCraftedRegearSupported } from '@/lib/regear-support-server'

const CRAFT_SELF_OPERATOR_CAPS = [
  CAP.CRAFT_TASK_CREATE,
  CAP.CRAFT_TASK_DELIVER,
  CAP.CRAFT_MASTER,
] as const

function hasCraftAuthority(session: SessionPayload): boolean {
  return sessionHasAny(session, CRAFT_SELF_OPERATOR_CAPS)
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type CraftCompensationMode = 'volunteer' | 'paid'

export interface CrafterProfile {
  isCrafter: boolean
  materialSource: CraftMaterialSource
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
  craftIncludedSlots: CraftRegearSlot[]
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
  materialSilverCost: number | null
  premiumSilver: number
  reimbursementSilver: number | null
  reimbursementStatus: 'not_required' | 'pending' | 'approved' | 'rejected'
  reimbursementApprovedAt: string | null
  reimbursementApprovedBy: string | null
  reimbursementApprovedByUsername: string | null
  reimbursementRejectedAt: string | null
  reimbursementRejectedBy: string | null
  reimbursementRejectedByUsername: string | null
  reimbursementRejectReason: string | null
  compensationMode: CraftCompensationMode | null
  supplyStatus:
    | 'queued'
    | 'in_progress'
    | 'ready_for_pickup'
    | 'receipt_overdue'
    | 'completed'
    | 'returned_unclaimed'
    | 'cancelled'
    | 'legacy_expired'
    | null
  materialSource: CraftMaterialSource | null
  quotedMaterialValueSilver: number
  materialReimbursementSilver: number
  craftFeeSilver: number
  settlementTotalSilver: number
  settlementStatus: 'payable' | 'paid' | 'void' | null
}

export interface MyCraftPickup {
  taskId: string
  eventTitle: string
  roleName: string
  buildSnapshot: BuildSnapshot | null
  craftIncludedSlots: CraftRegearSlot[]
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
  enabled: boolean
  includeCape: boolean
}

// ────────────────────────────────────────────────────────────
// Public — read tenant config (used by both crafter form + admin settings)
// ────────────────────────────────────────────────────────────

export async function getCraftConfig(): Promise<CraftBoxConfig> {
  const session = await getSession()
  // Defaults match the migration's documented defaults.
  if (!session) {
    return { rangeMin: 1, rangeMax: 30, expiryDays: 7, enabled: false, includeCape: false }
  }
  const guildId = await getSessionGuildId(session)
  const [enabledRaw, includeCapeRaw, minRaw, maxRaw, expiryRaw] = await Promise.all([
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getAppSetting('craft_regear_include_cape', 'false', guildId),
    getAppSetting('craft_box_range_min', '1', guildId),
    getAppSetting('craft_box_range_max', '30', guildId),
    getAppSetting('craft_box_expiry_days', '7', guildId),
  ])
  return {
    enabled: enabledRaw === 'true',
    includeCape: includeCapeRaw === 'true',
    rangeMin: parseIntegerSetting(minRaw, 1, 1, 999),
    rangeMax: parseIntegerSetting(maxRaw, 30, 1, 999),
    expiryDays: parseIntegerSetting(expiryRaw, 7, 1, 30),
  }
}

function parseIntegerSetting(raw: string, fallback: number, min: number, max: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return fallback
  return n
}

export async function getMyCrafterProfile(): Promise<CrafterProfile | null> {
  const session = await requireLiveSession().catch(() => null)
  if (!session) return null
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select(
      'is_crafter, craft_compensation_mode, craft_premium_pct, craft_material_source, craft_box_range_start, craft_box_range_end',
    )
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (!data) return null
  const mode = (data.craft_compensation_mode as CraftCompensationMode | null) ?? 'volunteer'
  return {
    isCrafter: (data.is_crafter as boolean | undefined) === true,
    materialSource:
      (data as { craft_material_source?: string }).craft_material_source === 'crafter_purchase'
        ? 'crafter_purchase'
        : 'guild_stock',
    compensationMode: mode === 'paid' ? 'paid' : 'volunteer',
    premiumPct: typeof data.craft_premium_pct === 'number' ? data.craft_premium_pct : 0,
    boxRangeStart: parseRangeBoundary(data.craft_box_range_start),
    boxRangeEnd: parseRangeBoundary(data.craft_box_range_end),
  }
}

// ────────────────────────────────────────────────────────────
// Member — pickup from box
// ────────────────────────────────────────────────────────────

export async function listMyCraftPickups(): Promise<{ pickups: MyCraftPickup[]; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { pickups: [], error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  // Inner-join filters to the requester (regear_requests.discord_id) — only
  // tasks belonging to this member's regear are returned.
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'id, regear_request_id, status, crafter_username, box_number, craft_city, delivered_at, expires_at, created_at, regear_requests!inner(discord_id, role_name, event_title_snapshot, build_snapshot, craft_included_slots)',
    )
    .eq('guild_id', guildId)
    .eq('status', 'delivered')
    .eq('regear_requests.discord_id', session.discordId)
    .order('delivered_at', { ascending: true })
  if (error) return { pickups: [], error: await publicActionError(error, 'actions/craft') }

  const pickups: MyCraftPickup[] = (data ?? []).map((row) => {
    const r = Array.isArray(row.regear_requests)
      ? row.regear_requests[0]
      : row.regear_requests
    return {
      taskId: row.id as string,
      eventTitle: r?.event_title_snapshot ?? '',
      roleName: r?.role_name ?? '',
      buildSnapshot: (r?.build_snapshot as BuildSnapshot | null) ?? null,
      craftIncludedSlots: normalizeCraftRegearSlots(
        (r as { craft_included_slots?: unknown } | null)?.craft_included_slots,
        false,
      ),
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
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)
  if (!(await isCraftedRegearSupported(guildId))) {
    return { error: tErr('craftRegearDisabled') }
  }

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
    return { error: await publicActionError(e, 'actions/craft') }
  }

  // collect 단계는 재고 변동 없음. 재고 차감은 deliver 시점에 이미 끝남.
  // (이전 모델: deliver 시 +1, collect 시 -1 → 새 모델: deliver 시 -1, collect 무변동.)

  revalidatePath('/me')
  revalidatePath('/craft/queue')
  return {}
}

// ────────────────────────────────────────────────────────────
// Crafter — own profile defaults
// ────────────────────────────────────────────────────────────

export async function setMyCrafterDefaults(
  compensationMode: CraftCompensationMode,
  premiumPct: number,
  materialSource: CraftMaterialSource = 'guild_stock',
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)
  if (!(await isCraftedRegearSupported(guildId))) {
    return { error: tErr('craftRegearDisabled') }
  }

  if (compensationMode !== 'volunteer' && compensationMode !== 'paid') {
    return { error: tErr('invalidInput') }
  }
  if (materialSource !== 'guild_stock' && materialSource !== 'crafter_purchase') {
    return { error: tErr('invalidInput') }
  }
  if (!Number.isInteger(premiumPct) || premiumPct < 0 || premiumPct > 200) {
    return { error: tErr('craftPremiumOutOfRange') }
  }
  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !hasCraftAuthority(session)) {
    return { error: tErr('crafterOnly') }
  }

  const db = getAdminClient()
  const { error } = await db
    .from('guild_avatars')
    .update({
      craft_compensation_mode: compensationMode,
      craft_premium_pct: premiumPct,
      craft_material_source: materialSource,
    })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (error) return { error: await publicActionError(error, 'actions/craft') }
  revalidatePath('/craft/queue')
  revalidatePath('/craft/my-tasks')
  return {}
}

// ────────────────────────────────────────────────────────────
// Auto box-assignment — DeliverDialog 가 열릴 때 호출. 어드민 권한 없어도
// 작동 (멤버 측 자동화) 하므로 craft.ts 에 둔다.
// ────────────────────────────────────────────────────────────

// 자동 박스 배정 — DeliverDialog 가 열릴 때 호출해 모달의 박스 칸을 미리
// 채운다. 크래프터의 범위 [start, end] 안에서 현재 delivered task 가 점유하지
// 않은 가장 작은 박스를 제안한다.
//
// 반환되는 reason 으로 클라이언트가 적절한 안내를 띄운다 (예: "범위 미지정,
// 관리자에게 요청하세요" / "범위 박스가 모두 사용 중").
export type AutoAssignReason =
  | 'rangeFree' // 범위 안 빈 박스 자동 선택
  | 'rangeFull' // 범위 안 박스가 모두 다른 요청자 점유
  | 'noRange' // 크래프터 범위 미지정

export interface AutoAssignResult {
  boxNumber: number | null
  availableBoxes: number[]
  reason: AutoAssignReason
}

export async function computeAutoAssignBox(
  taskId: string,
): Promise<AutoAssignResult & { error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireLiveSession().catch(() => null)
  if (!session) {
    return { boxNumber: null, availableBoxes: [], reason: 'noRange', error: tErr('loginRequired') }
  }
  const guildId = await getSessionGuildId(session)
  if (!(await isCraftedRegearSupported(guildId))) {
    return {
      boxNumber: null,
      availableBoxes: [],
      reason: 'noRange',
      error: tErr('craftRegearDisabled'),
    }
  }
  const db = getAdminClient()

  const { data: task, error: taskErr } = await db
    .from('craft_tasks')
    .select(
      'id, guild_id, crafter_discord_id, regear_request_id',
    )
    .eq('id', taskId)
    .eq('guild_id', guildId)
    .maybeSingle()
  if (taskErr || !task) {
    return { boxNumber: null, availableBoxes: [], reason: 'noRange', error: tErr('craftTaskNotFound') }
  }
  if (
    task.crafter_discord_id !== session.discordId &&
    !hasCraftAuthority(session)
  ) {
    return { boxNumber: null, availableBoxes: [], reason: 'noRange', error: tErr('craftNotClaimer') }
  }
  // 크래프터의 범위 조회. 미지정이면 noRange.
  const { data: crafter } = await db
    .from('guild_avatars')
    .select('craft_box_range_start, craft_box_range_end')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  const rangeStart = parseRangeBoundary(crafter?.craft_box_range_start)
  const rangeEnd = parseRangeBoundary(crafter?.craft_box_range_end)
  if (rangeStart == null || rangeEnd == null) {
    return { boxNumber: null, availableBoxes: [], reason: 'noRange' }
  }

  // DB unique invariant 는 (guild_id, box_number) 이므로 delivered 상태에서
  // 이미 점유 중인 박스는 누구 요청인지와 무관하게 재사용하지 않는다.
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

  const availableBoxes: number[] = []
  for (let n = rangeStart; n <= rangeEnd; n++) {
    if (!occupied.has(n)) availableBoxes.push(n)
  }
  if (availableBoxes.length > 0) {
    return { boxNumber: availableBoxes[0], availableBoxes, reason: 'rangeFree' }
  }
  return { boxNumber: null, availableBoxes: [], reason: 'rangeFull' }
}
