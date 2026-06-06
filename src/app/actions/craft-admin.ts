'use server'

// 어드민 제작 운영 액션 — 크래프터 권한 부여/해제, 박스 범위 지정, 진행 중 task
// 모니터링 / 강제 취소 / 실버 변환, 설정 (range / expiry / enabled) 변경. 모두
// capability 게이트 통과 후 동작.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAnyCapability } from '@/lib/auth'
import {
  approveCraftReimbursement,
  approveCraftReimbursementAdjusted,
  cancelCraftTask,
  convertCraftTaskToSilver,
  rejectCraftReimbursement,
  type CraftTaskStatus,
} from '@/lib/craft-tasks'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { formatSilver } from '@/lib/silver'
import {
  pickRegearJoin,
  toQueueItem,
  parseRangeBoundary,
  type CraftTaskJoinedRow,
} from '@/lib/craft-task-mapping'
import {
  getCraftConfig,
  type CraftCompensationMode,
  type CraftQueueItem,
} from '@/app/actions/craft'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { selectPagedRows, type SupabasePagedQuery } from '@/lib/supabase-pagination'

export interface AdminCrafterRow {
  discordId: string
  username: string
  isCrafter: boolean
  compensationMode: CraftCompensationMode
  premiumPct: number
  boxRangeStart: number | null
  boxRangeEnd: number | null
}

const CRAFT_ADMIN_CAPS = [CAP.CRAFT_TASK_CREATE, CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER] as const
const CRAFT_MASTER_CAPS = [CAP.CRAFT_MASTER] as const

export async function listGuildCrafters(): Promise<{
  crafters: AdminCrafterRow[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(CRAFT_ADMIN_CAPS)
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
    const db = await requireAnyCapability(CRAFT_MASTER_CAPS)
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
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetDiscordId: discordId,
      targetKind: 'setting',
      details: { kind: 'crafter_flag', isCrafter },
    })
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
    const db = await requireAnyCapability(CRAFT_MASTER_CAPS)
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
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetDiscordId: discordId,
      targetKind: 'setting',
      details: { kind: 'crafter_box_range', start, end },
    })
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
    const db = await requireAnyCapability(CRAFT_ADMIN_CAPS)
    const session = await getSession()
    if (!session) return { tasks: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const activeStatuses: CraftTaskStatus[] = ['queued', 'claimed', 'delivered']
    const page = await selectPagedRows<CraftTaskJoinedRow>({
      label: 'admin craft tasks',
      buildQuery: () => {
        let query = db
          .from('craft_tasks')
          .select(
            'id, regear_request_id, status, crafter_discord_id, crafter_username, box_number, craft_city, material_silver_cost, premium_silver, reimbursement_silver, reimbursement_status, reimbursement_approved_at, reimbursement_approved_by, reimbursement_approved_by_username, reimbursement_rejected_at, reimbursement_rejected_by, reimbursement_rejected_by_username, reimbursement_reject_reason, compensation_mode, claimed_at, delivered_at, collected_at, expired_at, cancelled_at, expires_at, created_at, guild_id, regear_requests!inner(id, discord_id, username, role_name, event_id, event_title_snapshot, claimed_silver, build_snapshot, craft_included_slots)',
          )
          .eq('guild_id', guildId)
        if (scope === 'active') {
          query = query.or(
            `status.in.(${activeStatuses.join(',')}),reimbursement_status.eq.pending`,
          )
        }
        return query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }) as unknown as SupabasePagedQuery<CraftTaskJoinedRow>
      },
    })
    if (page.error) return { tasks: [], error: page.error }

    const fallback = tCommon('deletedEvent')
    const rows = page.rows

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
        .eq('guild_id', guildId)
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
    await requireAnyCapability(CRAFT_ADMIN_CAPS)
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
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'craft.task.cancel',
      targetId: taskId,
      targetKind: 'craft_task',
      details: { kind: 'admin_force_cancel' },
    })
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
    const db = await requireAnyCapability(CRAFT_ADMIN_CAPS)
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
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'craft.task.cancel',
      targetId: taskId,
      targetKind: 'craft_task',
      targetDiscordId: (r?.discord_id as string | undefined) ?? null,
      details: {
        kind: 'convert_to_silver',
        creditSilver: credit,
        eventTitle: (r?.event_title_snapshot as string | undefined) ?? null,
      },
    })
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
    const db = await requireAnyCapability(CRAFT_ADMIN_CAPS)
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
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'craft.task.cancel',
      targetId: taskId,
      targetKind: 'craft_task',
      details: { kind: 'revert_to_pending' },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function approveCraftReimbursementAdmin(
  taskId: string,
): Promise<{ error?: string; amount?: number }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAnyCapability(CRAFT_ADMIN_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    let amount = 0
    try {
      amount = await approveCraftReimbursement(
        taskId,
        guildId,
        session.discordId,
        session.username,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr('serverError')
      if (msg.includes('CRAFT_REIMBURSEMENT_NOT_PENDING')) {
        return { error: tErr('craftReimbursementNotPending') }
      }
      if (msg.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      return { error: msg }
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/queue')
    revalidatePath('/craft/my-tasks')
    revalidatePath('/me')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'craft.reimbursement.approve',
      targetId: taskId,
      targetKind: 'craft_task',
      details: { amount },
    })
    return { amount }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function approveCraftReimbursementAdjustedAdmin(
  taskId: string,
  reimbursementSilver: number,
): Promise<{ error?: string; amount?: number }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAnyCapability(CRAFT_ADMIN_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    if (!Number.isInteger(reimbursementSilver) || reimbursementSilver < 0) {
      return { error: tErr('nonNegativeInteger') }
    }

    let amount = 0
    try {
      amount = await approveCraftReimbursementAdjusted(
        taskId,
        guildId,
        session.discordId,
        session.username,
        reimbursementSilver,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr('serverError')
      if (msg.includes('CRAFT_REIMBURSEMENT_NOT_PENDING')) {
        return { error: tErr('craftReimbursementNotPending') }
      }
      if (msg.includes('CRAFT_REIMBURSEMENT_INVALID_AMOUNT')) {
        return { error: tErr('nonNegativeInteger') }
      }
      if (msg.includes('CRAFT_REIMBURSEMENT_AMOUNT_EXCEEDS_REQUESTED')) {
        return { error: tErr('craftReimbursementAmountExceeds') }
      }
      if (msg.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      return { error: msg }
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/queue')
    revalidatePath('/craft/my-tasks')
    revalidatePath('/me')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'craft.reimbursement.approve',
      targetId: taskId,
      targetKind: 'craft_task',
      details: { amount, adjusted: true },
    })
    return { amount }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function rejectCraftReimbursementAdmin(
  taskId: string,
  reason: string,
): Promise<{ error?: string; amount?: number }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAnyCapability(CRAFT_ADMIN_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const normalizedReason = reason.trim()
    if (normalizedReason.length > 500) return { error: tErr('adminNoteTooLong', { max: 500 }) }

    let amount = 0
    try {
      amount = await rejectCraftReimbursement(
        taskId,
        guildId,
        session.discordId,
        session.username,
        normalizedReason,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : tErr('serverError')
      if (msg.includes('CRAFT_REIMBURSEMENT_NOT_PENDING')) {
        return { error: tErr('craftReimbursementNotPending') }
      }
      if (msg.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      return { error: msg }
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/queue')
    revalidatePath('/craft/my-tasks')
    revalidatePath('/me')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'craft.reimbursement.reject',
      targetId: taskId,
      targetKind: 'craft_task',
      details: { amount, reason: normalizedReason || null },
    })
    return { amount }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

const BULK_REIMBURSEMENT_LIMIT = 50

export async function bulkApproveCraftReimbursementsAdmin(
  taskIds: string[],
): Promise<{ ok: number; failed: number; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireAnyCapability(CRAFT_ADMIN_CAPS)
    const session = await getSession()
    if (!session) return { ok: 0, failed: 0, error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const uniqueIds = Array.from(new Set(taskIds.filter((id) => typeof id === 'string' && id)))
    if (uniqueIds.length === 0 || uniqueIds.length > BULK_REIMBURSEMENT_LIMIT) {
      return { ok: 0, failed: 0, error: tErr('invalidInput') }
    }

    let ok = 0
    let failed = 0
    for (const taskId of uniqueIds) {
      try {
        await approveCraftReimbursement(taskId, guildId, session.discordId, session.username)
        ok += 1
      } catch {
        failed += 1
      }
    }

    if (ok > 0) {
      revalidatePath('/admin/dashboard/craft')
      revalidatePath('/craft/queue')
      revalidatePath('/craft/my-tasks')
      revalidatePath('/me')
      await logAdminAction({
        guildId,
        adminDiscordId: session.discordId,
        action: 'craft.reimbursement.approve',
        targetKind: 'craft_task',
        details: { bulk: true, ok, failed },
      })
    }
    return { ok, failed }
  } catch (e) {
    return {
      ok: 0,
      failed: 0,
      error: e instanceof Error ? e.message : tErr('serverError'),
    }
  }
}

// Tenant-wide settings setter (admin only). Validation here mirrors the SQL
// constraints; UI passes already-coerced numbers.
export interface UpdateCraftSettingsInput {
  enabled: boolean
  includeCape: boolean
  rangeMin: number
  rangeMax: number
  expiryDays: number
}

export async function updateCraftSettingsAdmin(
  input: UpdateCraftSettingsInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(CRAFT_MASTER_CAPS)
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

    const rows = [
      { key: 'craft_regear_enabled', value: input.enabled ? 'true' : 'false' },
      { key: 'craft_regear_include_cape', value: input.includeCape ? 'true' : 'false' },
      { key: 'craft_box_range_min', value: String(input.rangeMin) },
      { key: 'craft_box_range_max', value: String(input.rangeMax) },
      { key: 'craft_box_expiry_days', value: String(input.expiryDays) },
    ].map((r) => ({ ...r, guild_id: guildId, updated_at: new Date().toISOString() }))

    const { error } = await db
      .from('app_settings')
      .upsert(rows, { onConflict: 'guild_id,key' })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/craft')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'settings.update',
      targetKind: 'setting',
      details: {
        kind: 'craft_global',
        enabled: input.enabled,
        includeCape: input.includeCape,
        rangeMin: input.rangeMin,
        rangeMax: input.rangeMax,
        expiryDays: input.expiryDays,
      },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
