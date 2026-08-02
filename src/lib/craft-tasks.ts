// State-machine wrappers around the craft_tasks RPCs (see migration 106).
// Server actions and cron call these instead of running the RPCs ad-hoc so
// the call site can stay focused on input validation + i18n + DM dispatch.

import { getAdminClient } from '@/lib/supabase-admin'
import {
  isSameStableMemberOwner,
  resolveStableMemberOwnership,
} from '@/lib/stable-member-ownership'

export type CraftTaskStatus =
  | 'queued'
  | 'claimed'
  | 'delivered'
  | 'collected'
  | 'expired'
  | 'cancelled'

export type CraftReimbursementStatus =
  | 'not_required'
  | 'pending'
  | 'approved'
  | 'rejected'

export type CraftMaterialSource = 'guild_stock' | 'crafter_purchase'
export type CraftFeeMode = 'none' | 'configured'

export interface SupplySettlementTerms {
  fulfillmentId: string
  quotedMaterialValueSilver: number
  materialReimbursementSilver: number
  craftFeeSilver: number
  settlementTotalSilver: number
}

export interface CraftTaskRow {
  id: string
  guild_id: string
  regear_request_id: string
  status: CraftTaskStatus
  crafter_discord_id: string | null
  crafter_guild_member_id: string | null
  crafter_username: string | null
  box_number: number | null
  craft_city: string | null
  material_silver_cost: number | null
  premium_silver: number
  reimbursement_silver: number | null
  reimbursement_status: CraftReimbursementStatus
  reimbursement_approved_at: string | null
  reimbursement_approved_by: string | null
  reimbursement_approved_by_username: string | null
  reimbursement_rejected_at: string | null
  reimbursement_rejected_by: string | null
  reimbursement_rejected_by_username: string | null
  reimbursement_reject_reason: string | null
  compensation_mode: 'volunteer' | 'paid' | null
  claimed_at: string | null
  delivered_at: string | null
  collected_at: string | null
  expired_at: string | null
  cancelled_at: string | null
  expires_at: string | null
  created_at: string
}

export async function listCraftTasksForGuild(
  guildId: string,
  statuses: readonly CraftTaskStatus[],
): Promise<CraftTaskRow[]> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('craft_tasks')
    .select('*')
    .eq('guild_id', guildId)
    .in('status', statuses as string[])
    .order('created_at', { ascending: true })
  if (error) throw new Error(`craft_tasks list failed: ${error.message}`)
  return (data ?? []) as CraftTaskRow[]
}

export async function getCraftTaskById(
  taskId: string,
  guildId: string,
): Promise<CraftTaskRow | null> {
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('craft_tasks')
    .select('*')
    .eq('id', taskId)
    .eq('guild_id', guildId)
    .maybeSingle()
  if (error) throw new Error(`craft_tasks get failed: ${error.message}`)
  return (data ?? null) as CraftTaskRow | null
}

export async function listMyDeliveredCraftTasks(
  guildId: string,
  memberDiscordId: string,
): Promise<CraftTaskRow[]> {
  // 'delivered' tasks waiting for member to collect from box.
  const supabase = getAdminClient()
  const ownership = await resolveStableMemberOwnership(supabase, guildId, memberDiscordId)
  let query = supabase
    .from('craft_tasks')
    .select('*, regear_requests!inner(discord_id, guild_member_id)')
    .eq('guild_id', guildId)
    .eq('status', 'delivered')
  query = ownership.guildMemberId
    ? query.eq('regear_requests.guild_member_id', ownership.guildMemberId)
    : query.eq('regear_requests.discord_id', memberDiscordId)
  const { data, error } = await query
  if (error) throw new Error(`craft_tasks for member failed: ${error.message}`)
  return (data ?? []) as CraftTaskRow[]
}

export interface ClaimTaskInput {
  taskId: string
  guildId: string
  crafterDiscordId: string
  crafterUsername: string
  materialSource: CraftMaterialSource
  craftFeeMode: CraftFeeMode
  craftFeePct: number
  idempotencyKey?: string
  correlationId?: string
}

export async function claimCraftTask(input: ClaimTaskInput): Promise<SupplySettlementTerms> {
  const supabase = getAdminClient()
  const operationId = input.idempotencyKey ?? crypto.randomUUID()
  const { data, error } = await supabase.rpc('claim_supply_craft_task', {
    p_task_id: input.taskId,
    p_guild_id: input.guildId,
    p_crafter_discord_id: input.crafterDiscordId,
    p_crafter_username: input.crafterUsername,
    p_material_source: input.materialSource,
    p_craft_fee_mode: input.craftFeeMode,
    p_craft_fee_pct: input.craftFeePct,
    p_idempotency_key: operationId,
    p_correlation_id: input.correlationId ?? operationId,
  })
  if (error) throw new Error(error.message)
  const result = data as Record<string, unknown> | null
  return {
    fulfillmentId: String(result?.fulfillmentId ?? ''),
    quotedMaterialValueSilver: Number(result?.quotedMaterialValueSilver ?? 0),
    materialReimbursementSilver: Number(result?.materialReimbursementSilver ?? 0),
    craftFeeSilver: Number(result?.craftFeeSilver ?? 0),
    settlementTotalSilver: Number(result?.settlementTotalSilver ?? 0),
  }
}

export async function releaseCraftTask(
  taskId: string,
  guildId: string,
  crafterDiscordId: string,
  options: { idempotencyKey?: string; correlationId?: string } = {},
): Promise<void> {
  const supabase = getAdminClient()
  const operationId = options.idempotencyKey ?? crypto.randomUUID()
  const [{ data: task, error: taskError }, ownership] = await Promise.all([
    supabase
      .from('craft_tasks')
      .select('crafter_discord_id, crafter_guild_member_id')
      .eq('id', taskId)
      .eq('guild_id', guildId)
      .maybeSingle(),
    resolveStableMemberOwnership(supabase, guildId, crafterDiscordId),
  ])
  if (taskError) throw new Error(taskError.message)
  if (ownership.error) throw new Error(ownership.error)
  if (!task || !isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: crafterDiscordId,
    rowGuildMemberId: task.crafter_guild_member_id,
    rowSubjectId: task.crafter_discord_id,
  })) {
    throw new Error('CRAFT_TASK_NOT_CLAIMED_BY_YOU')
  }
  const { error } = await supabase.rpc('release_supply_craft_task', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_crafter_discord_id: task.crafter_discord_id,
    p_idempotency_key: operationId,
    p_correlation_id: options.correlationId ?? operationId,
  })
  if (error) throw new Error(error.message)
}

export async function collectCraftTask(
  taskId: string,
  guildId: string,
  memberDiscordId: string,
  options: { idempotencyKey?: string; correlationId?: string } = {},
): Promise<void> {
  const supabase = getAdminClient()
  const operationId = options.idempotencyKey ?? crypto.randomUUID()
  const [{ data: task, error: taskError }, ownership] = await Promise.all([
    supabase
      .from('craft_tasks')
      .select('regear_requests!inner(discord_id, guild_member_id)')
      .eq('id', taskId)
      .eq('guild_id', guildId)
      .maybeSingle(),
    resolveStableMemberOwnership(supabase, guildId, memberDiscordId),
  ])
  if (taskError) throw new Error(taskError.message)
  if (ownership.error) throw new Error(ownership.error)
  const regear = task?.regear_requests
    ? Array.isArray(task.regear_requests)
      ? task.regear_requests[0]
      : task.regear_requests
    : null
  if (!regear || !isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: memberDiscordId,
    rowGuildMemberId: regear.guild_member_id,
    rowSubjectId: regear.discord_id,
  })) {
    throw new Error('CRAFT_TASK_NOT_YOURS')
  }
  const { error } = await supabase.rpc('collect_supply_fulfillment', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_member_discord_id: regear.discord_id,
    p_idempotency_key: operationId,
    p_correlation_id: options.correlationId ?? operationId,
  })
  if (error) throw new Error(error.message)
}

export async function moveSupplyCraftBox(input: {
  taskId: string
  guildId: string
  boxNumber: number
  actorDiscordId: string
  idempotencyKey?: string
  correlationId?: string
}): Promise<void> {
  const operationId = input.idempotencyKey ?? crypto.randomUUID()
  const { error } = await getAdminClient().rpc('move_supply_craft_box', {
    p_task_id: input.taskId,
    p_guild_id: input.guildId,
    p_box_number: input.boxNumber,
    p_actor_discord_id: input.actorDiscordId,
    p_idempotency_key: operationId,
    p_correlation_id: input.correlationId ?? operationId,
  })
  if (error) throw new Error(error.message)
}

export async function returnUnclaimedSupplyCraft(input: {
  taskId: string
  guildId: string
  actorDiscordId: string
  reason?: string
  idempotencyKey?: string
  correlationId?: string
}): Promise<void> {
  const operationId = input.idempotencyKey ?? crypto.randomUUID()
  const { error } = await getAdminClient().rpc('return_unclaimed_supply_craft', {
    p_task_id: input.taskId,
    p_guild_id: input.guildId,
    p_actor_discord_id: input.actorDiscordId,
    p_idempotency_key: operationId,
    p_correlation_id: input.correlationId ?? operationId,
    p_reason: input.reason ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function paySupplySettlementBatch(input: {
  guildId: string
  crafterMemberId: string
  actorDiscordId: string
  actorUsername: string
  note?: string
  idempotencyKey?: string
  correlationId?: string
}): Promise<{ batchId: string; totalSilver: number; itemCount: number }> {
  const operationId = input.idempotencyKey ?? crypto.randomUUID()
  const { data, error } = await getAdminClient().rpc('pay_supply_settlement_batch', {
    p_guild_id: input.guildId,
    p_crafter_member_id: input.crafterMemberId,
    p_actor_discord_id: input.actorDiscordId,
    p_actor_username: input.actorUsername,
    p_idempotency_key: operationId,
    p_correlation_id: input.correlationId ?? operationId,
    p_note: input.note ?? null,
  })
  if (error) throw new Error(error.message)
  const result = data as Record<string, unknown> | null
  return {
    batchId: String(result?.batchId ?? ''),
    totalSilver: Number(result?.totalSilver ?? 0),
    itemCount: Number(result?.itemCount ?? 0),
  }
}

export async function expireOverdueCraftTasks(): Promise<number> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('expire_craft_tasks')
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

export async function approveCraftReimbursement(
  taskId: string,
  guildId: string,
  adminDiscordId: string,
  adminUsername: string,
): Promise<number> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('approve_craft_reimbursement', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_admin_id: adminDiscordId,
    p_admin_username: adminUsername,
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

export async function approveCraftReimbursementAdjusted(
  taskId: string,
  guildId: string,
  adminDiscordId: string,
  adminUsername: string,
  reimbursementSilver: number,
): Promise<number> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('approve_craft_reimbursement_adjusted', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_admin_id: adminDiscordId,
    p_admin_username: adminUsername,
    p_reimbursement_silver: reimbursementSilver,
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

export async function rejectCraftReimbursement(
  taskId: string,
  guildId: string,
  adminDiscordId: string,
  adminUsername: string,
  rejectReason: string,
): Promise<number> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('reject_craft_reimbursement', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_admin_id: adminDiscordId,
    p_admin_username: adminUsername,
    p_reject_reason: rejectReason,
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

export async function cancelCraftTask(
  taskId: string,
  guildId: string,
): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase.rpc('cancel_craft_task', {
    p_task_id: taskId,
    p_guild_id: guildId,
  })
  if (error) throw new Error(error.message)
}

// Admin tool: cancel the craft task + flip mode + credit point_ledger in one
// transaction. Returns the silver amount credited (0 if the original request
// had no claim).
export async function convertCraftTaskToSilver(
  taskId: string,
  guildId: string,
): Promise<number> {
  const supabase = getAdminClient()
  const { data, error } = await supabase.rpc('convert_craft_task_to_silver', {
    p_task_id: taskId,
    p_guild_id: guildId,
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}
