'use server'


import { publicActionError } from '@/lib/public-action-error'
// 크래프터(is_crafter=true) 큐 플로우 — queued task 잡기, release, bulk 잡기,
// 납품, 상세 페이지 조회. craft.ts 에서 분리. 멤버 픽업 / 어드민 운영과 별개로
// 떨어져 있어 한 파일에 묶이는 것은 자연스럽다.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  claimCraftTask,
  releaseCraftTask,
  deliverCraftTask,
} from '@/lib/craft-tasks'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import {
  decrementBuildForDelivery,
  extractGearItemIdsFromBuild,
} from '@/lib/inventory'
import { log } from '@/lib/log'
import {
  loadIsCrafter,
  pickRegearJoin,
  toQueueItem,
  type CraftTaskJoinedRow,
  type RegearRequestJoin,
} from '@/lib/craft-task-mapping'
import {
  getCraftConfig,
  type CraftCompensationMode,
  type CraftQueueItem,
} from '@/app/actions/craft'
import type { BuildSnapshot } from '@/types'
import { normalizeCraftRegearSlots } from '@/lib/regear-craft-slots'

// 큐 listing: queued (잡을 수 있는 것) + mine (현재 로그인 크래프터가 잡고 있는
// 것) 두 리스트를 한 번에 반환. 둘 다 tenant-scoped.
export async function listCraftQueueForCrafter(eventId?: string): Promise<{
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
  let queueQuery = db
    .from('craft_tasks')
    .select(
      'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, material_silver_cost, premium_silver, reimbursement_silver, reimbursement_status, reimbursement_approved_at, reimbursement_approved_by, reimbursement_approved_by_username, reimbursement_rejected_at, reimbursement_rejected_by, reimbursement_rejected_by_username, reimbursement_reject_reason, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, guild_id, discord_id, username, role_name, event_id, event_title_snapshot, claimed_silver, build_snapshot, craft_included_slots)',
    )
    .eq('guild_id', guildId)
    .eq('regear_requests.guild_id', guildId)
    .in('status', ['queued', 'claimed', 'delivered'])
  if (eventId) {
    queueQuery = queueQuery.eq('regear_requests.event_id', eventId)
  }
  const { data, error } = await queueQuery.order('created_at', { ascending: true })
  if (error) {
    return { queued: [], mine: [], isCrafter, stockByItemId: {}, error: await publicActionError(error, 'actions/craft-queue') }
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
      .eq('guild_id', guildId)
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
    for (const id of extractGearItemIdsFromBuild(item.buildSnapshot, {
      includedSlots: item.craftIncludedSlots,
    })) {
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
      'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, material_silver_cost, premium_silver, reimbursement_silver, reimbursement_status, reimbursement_approved_at, reimbursement_approved_by, reimbursement_approved_by_username, reimbursement_rejected_at, reimbursement_rejected_by, reimbursement_rejected_by_username, reimbursement_reject_reason, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_title_snapshot, claimed_silver, build_snapshot, craft_included_slots, event_id)',
    )
    .eq('guild_id', guildId)
    .eq('id', taskId)
    .maybeSingle()
  if (error) return { detail: null, error: await publicActionError(error, 'actions/craft-queue') }
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
      .eq('guild_id', guildId)
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
    return { error: await publicActionError(e, 'actions/craft-queue') }
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
    return { error: await publicActionError(e, 'actions/craft-queue') }
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
    return { error: await publicActionError(e, 'actions/craft-queue') }
  }

  // DM the requester — best-effort. The reverse-join lookup also pulls
  // build_snapshot so we can update gear inventory in the same query.
  const db = getAdminClient()
  const { data: dmRow } = await db
    .from('craft_tasks')
    .select(
      'box_number, regear_requests!inner(discord_id, event_title_snapshot, build_snapshot, craft_included_slots)',
    )
    .eq('guild_id', guildId)
    .eq('id', input.taskId)
    .maybeSingle()
  const r = Array.isArray(dmRow?.regear_requests)
    ? dmRow?.regear_requests[0]
    : dmRow?.regear_requests
  if (r?.discord_id) {
    void sendLocalizedDiscordDmToUser(r.discord_id, guildId, (tDm) => ({
      title: tDm('craftDeliveredTitle'),
      body: tDm('craftDeliveredBody', {
        event: r.event_title_snapshot ?? '',
        box: input.boxNumber,
        crafter: session.username,
      }),
      url: '/me',
    }))
  }

  // 자동 재고 -1: 박스에 들어가는 장비는 길드 재고에서 빠져나간 상태로 본다.
  // 베스트 에포트 — RPC floor=0 라 음수가 되지 않고, 사전 재고가 부족했던
  // itemId 가 한 개라도 있으면 craft_tasks.inventory_warned=true 로 마킹해
  // "경고 납품" (시장 구매로 즉시 리기어) 으로 통계에서 분리한다.
  const buildSnapshot = (r?.build_snapshot as BuildSnapshot | null) ?? null
  if (buildSnapshot) {
    const includedSlots = normalizeCraftRegearSlots(
      (r as { craft_included_slots?: unknown } | null)?.craft_included_slots,
      false,
    )
    try {
      const result = await decrementBuildForDelivery(
        guildId,
        buildSnapshot,
        session.discordId,
        { includedSlots },
      )
      if (!result.empty && result.warnedItemIds.length > 0) {
        await db
          .from('craft_tasks')
          .update({ inventory_warned: true })
          .eq('guild_id', guildId)
          .eq('id', input.taskId)
      }
    } catch (e) {
      log.error('[craft.deliver] inventory hook failed', e, {
        tenant_id: guildId,
        task_id: input.taskId,
      })
    }
  }

  revalidatePath('/craft/queue')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/inventory')
  revalidatePath('/craft/inventory')
  return {}
}
