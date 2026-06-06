// State-machine wrappers around the craft_tasks RPCs (see migration 106).
// Server actions and cron call these instead of running the RPCs ad-hoc so
// the call site can stay focused on input validation + i18n + DM dispatch.

import { getAdminClient } from '@/lib/supabase-admin'

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

export interface CraftTaskRow {
  id: string
  guild_id: string
  regear_request_id: string
  status: CraftTaskStatus
  crafter_discord_id: string | null
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
  const { data, error } = await supabase
    .from('craft_tasks')
    .select('*, regear_requests!inner(discord_id)')
    .eq('guild_id', guildId)
    .eq('status', 'delivered')
    .eq('regear_requests.discord_id', memberDiscordId)
  if (error) throw new Error(`craft_tasks for member failed: ${error.message}`)
  return (data ?? []) as CraftTaskRow[]
}

export interface ClaimTaskInput {
  taskId: string
  guildId: string
  crafterDiscordId: string
  crafterUsername: string
  compensationMode: 'volunteer' | 'paid'
  premiumPct: number
}

export async function claimCraftTask(input: ClaimTaskInput): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase.rpc('claim_craft_task', {
    p_task_id: input.taskId,
    p_guild_id: input.guildId,
    p_crafter_discord_id: input.crafterDiscordId,
    p_crafter_username: input.crafterUsername,
    p_compensation_mode: input.compensationMode,
    p_premium_pct: input.premiumPct,
  })
  if (error) throw new Error(error.message)
}

export async function releaseCraftTask(
  taskId: string,
  guildId: string,
  crafterDiscordId: string,
): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase.rpc('release_craft_task', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_crafter_discord_id: crafterDiscordId,
  })
  if (error) throw new Error(error.message)
}

export interface DeliverTaskInput {
  taskId: string
  guildId: string
  crafterDiscordId: string
  boxNumber: number
  materialSilverCost: number
  expiryDays: number
}

// craft_city / craft_focus_used 칼럼은 정련 재료 반환율 계산 폐기 (2026-05-02)
// 후 더 이상 입력받지 않지만 RPC 시그니처는 유지. 빈 문자열 + false 로 호출.
export async function deliverCraftTask(input: DeliverTaskInput): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase.rpc('deliver_craft_task', {
    p_task_id: input.taskId,
    p_guild_id: input.guildId,
    p_crafter_discord_id: input.crafterDiscordId,
    p_box_number: input.boxNumber,
    p_craft_city: '',
    p_craft_focus_used: false,
    p_material_silver_cost: input.materialSilverCost,
    p_expiry_days: input.expiryDays,
  })
  if (error) throw new Error(error.message)
}

export async function collectCraftTask(
  taskId: string,
  guildId: string,
  memberDiscordId: string,
): Promise<void> {
  const supabase = getAdminClient()
  const { error } = await supabase.rpc('collect_craft_task', {
    p_task_id: taskId,
    p_guild_id: guildId,
    p_member_discord_id: memberDiscordId,
  })
  if (error) throw new Error(error.message)
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
