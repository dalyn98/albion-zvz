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
  computeBuildCraftCost,
  type BuildCostBreakdown,
} from '@/lib/craft-recipes'
import {
  CRAFT_LOCATION_PRESETS,
  type CraftLocationPreset,
} from '@/lib/albion-return-rates'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { formatSilver } from '@/lib/silver'
import type { BuildSnapshot } from '@/types'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type CraftCompensationMode = 'volunteer' | 'paid'

export interface CrafterProfile {
  isCrafter: boolean
  compensationMode: CraftCompensationMode
  premiumPct: number
}

export interface CraftQueueItem {
  taskId: string
  status: CraftTaskStatus
  regearRequestId: string
  // requester info — denormalized so the UI can render without an extra join
  requesterDiscordId: string
  requesterUsername: string
  eventTitle: string
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

function toQueueItem(row: CraftTaskJoinedRow, fallbackEventTitle: string): CraftQueueItem {
  const r = pickRegearJoin(row)
  return {
    taskId: row.id,
    status: row.status,
    regearRequestId: row.regear_request_id,
    requesterDiscordId: r?.discord_id ?? '',
    requesterUsername: r?.username ?? '',
    eventTitle: r?.event_title_snapshot ?? fallbackEventTitle,
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
    .select('is_crafter, craft_compensation_mode, craft_premium_pct')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (!data) return null
  const mode = (data.craft_compensation_mode as CraftCompensationMode | null) ?? 'volunteer'
  return {
    isCrafter: (data.is_crafter as boolean | undefined) === true,
    compensationMode: mode === 'paid' ? 'paid' : 'volunteer',
    premiumPct: typeof data.craft_premium_pct === 'number' ? data.craft_premium_pct : 0,
  }
}

export async function getCraftLocationPresets(): Promise<readonly CraftLocationPreset[]> {
  return CRAFT_LOCATION_PRESETS
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
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) {
    return { queued: [], mine: [], isCrafter: false, error: tErr('loginRequired') }
  }
  const guildId = await getSessionGuildId(session)

  const isCrafter = await loadIsCrafter(guildId, session.discordId)
  if (!isCrafter && !session.isAdmin) {
    return { queued: [], mine: [], isCrafter: false, error: tErr('crafterOnly') }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, craft_focus_used, material_silver_cost, premium_silver, reimbursement_silver, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_title_snapshot, claimed_silver, build_snapshot)',
    )
    .eq('guild_id', guildId)
    .in('status', ['queued', 'claimed', 'delivered'])
    .order('created_at', { ascending: true })
  if (error) {
    return { queued: [], mine: [], isCrafter, error: error.message }
  }

  const tCommon = await getTranslations('common')
  const fallback = tCommon('deletedEvent')
  const rows = (data ?? []) as unknown as CraftTaskJoinedRow[]
  const queued: CraftQueueItem[] = []
  const mine: CraftQueueItem[] = []
  for (const row of rows) {
    const item = toQueueItem(row, fallback)
    if (row.status === 'queued') {
      queued.push(item)
    } else if (row.crafter_discord_id === session.discordId) {
      mine.push(item)
    }
    // 다른 크래프터가 잡고 있는 task 는 노출하지 않는다 (혼동 방지).
  }
  return { queued, mine, isCrafter }
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
  if (!isCrafter) return { error: tErr('crafterOnly') }

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

export interface PreviewCraftMaterialCostInput {
  taskId: string
  locationReturnPct: number
  focusUsed: boolean
}

export interface PreviewCraftMaterialCostResult {
  breakdown: BuildCostBreakdown | null
  error?: string
}

// Pure read — computes net silver cost the crafter would pay for materials.
// Crafter calls this after claim, before deliver, to figure out how much to
// claim back as material_silver_cost.
export async function previewCraftMaterialCost(
  input: PreviewCraftMaterialCostInput,
): Promise<PreviewCraftMaterialCostResult> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { breakdown: null, error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  if (
    typeof input.locationReturnPct !== 'number' ||
    !Number.isFinite(input.locationReturnPct) ||
    input.locationReturnPct < 0 ||
    input.locationReturnPct > 100
  ) {
    return { breakdown: null, error: tErr('invalidInput') }
  }

  const db = getAdminClient()
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'id, status, crafter_discord_id, regear_requests!inner(build_snapshot)',
    )
    .eq('guild_id', guildId)
    .eq('id', input.taskId)
    .maybeSingle()
  if (error) return { breakdown: null, error: error.message }
  if (!data) return { breakdown: null, error: tErr('craftTaskNotFound') }
  // Either the assigned crafter, or admin can preview. Other members can't
  // peek at item costs for someone else's task.
  const isAdmin = session.isAdmin
  const isAssigned = data.crafter_discord_id === session.discordId
  if (!isAdmin && !isAssigned) {
    return { breakdown: null, error: tErr('craftTaskNotClaimedByYou') }
  }
  const r = Array.isArray(data.regear_requests)
    ? data.regear_requests[0]
    : data.regear_requests
  const buildSnapshot = (r?.build_snapshot as BuildSnapshot | null) ?? null
  if (!buildSnapshot) return { breakdown: null, error: tErr('craftTaskNoBuild') }

  const cfg = await getCraftConfig()
  const breakdown = await computeBuildCraftCost({
    buildSnapshot,
    guildId,
    locationReturnPct: input.locationReturnPct,
    focusUsed: input.focusUsed,
    focusBonusPct: cfg.focusBonusPct,
  })
  return { breakdown }
}

export interface DeliverCraftQueueInput {
  taskId: string
  boxNumber: number
  craftCity: string
  craftFocusUsed: boolean
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
  if (!isCrafter) return { error: tErr('crafterOnly') }

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
  if (typeof input.craftCity !== 'string' || input.craftCity.length === 0) {
    return { error: tErr('invalidInput') }
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
      craftCity: input.craftCity,
      craftFocusUsed: input.craftFocusUsed,
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

  // DM the requester — best-effort. The reverse-join lookup gives us the
  // requester id and item info.
  const db = getAdminClient()
  const { data: dmRow } = await db
    .from('craft_tasks')
    .select(
      'box_number, regear_requests!inner(discord_id, event_title_snapshot)',
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

  revalidatePath('/craft/queue')
  revalidatePath('/me')
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
  if (!isCrafter) return { error: tErr('crafterOnly') }

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
      .select('discord_id, username, is_crafter, craft_compensation_mode, craft_premium_pct')
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
        'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, craft_focus_used, material_silver_cost, premium_silver, reimbursement_silver, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_title_snapshot, claimed_silver, build_snapshot)',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (scope === 'active') query = query.in('status', activeStatuses as string[])
    const { data, error } = await query
    if (error) return { tasks: [], error: error.message }

    const fallback = tCommon('deletedEvent')
    const rows = (data ?? []) as unknown as CraftTaskJoinedRow[]
    const tasks = rows.map((r) => toQueueItem(r, fallback))
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
