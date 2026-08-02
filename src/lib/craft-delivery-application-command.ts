import 'server-only'

import {
  ApplicationCommandError,
  executeSupplyCraftDeliveryCommand,
  loadApplicationCommandReceipt,
  type ApplicationCommandContext,
  type ApplicationCommandReceipt,
} from '@/lib/application-command'
import { getAppSetting } from '@/lib/app-settings'
import { loadIsCrafter } from '@/lib/craft-task-mapping'
import { CAP, hasAnyCapability } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase-admin'
import { isCraftedRegearSupported } from '@/lib/regear-support-server'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CRAFT_OPERATOR_CAPS = [
  CAP.CRAFT_TASK_CREATE,
  CAP.CRAFT_TASK_DELIVER,
  CAP.CRAFT_MASTER,
] as const

export interface CraftDeliveryCommandContext extends ApplicationCommandContext {
  isAdmin: boolean
  capabilities: bigint
}

export interface CraftDeliveryCommandInput {
  taskId: string
  boxNumber: number
}

export interface PreparedCraftDeliveryApplicationCommand {
  requestPayload: {
    taskId: string
    boxNumber: number
  }
  followupDays: number
  eventTitle: string
  requesterDiscordId: string
  requesterUsername: string
  reimbursementMode: 'volunteer' | 'paid'
  materialReimbursementSilver: number
  craftFeeSilver: number
  settlementTotalSilver: number
}

export interface CraftDeliveryApplicationCommandResult
  extends PreparedCraftDeliveryApplicationCommand {
  status: string
  reimbursementSilver: number
  reimbursementStatus: string
  inventoryWarned: boolean
  warnedItemIds: string[]
  replayed: boolean
}

function parseBoundedSetting(raw: string, fallback: number, min: number, max: number): number {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function normalizeCraftDeliveryInput(
  input: CraftDeliveryCommandInput,
): PreparedCraftDeliveryApplicationCommand['requestPayload'] {
  const taskId = typeof input.taskId === 'string' ? input.taskId.trim() : ''
  if (
    !UUID_RE.test(taskId) ||
    !Number.isInteger(input.boxNumber) ||
    input.boxNumber < 1 ||
    input.boxNumber > 999
  ) {
    throw new ApplicationCommandError('craft_delivery_invalid')
  }
  return {
    taskId,
    boxNumber: input.boxNumber,
  }
}

async function assertCraftOperator(context: CraftDeliveryCommandContext): Promise<void> {
  const isCrafter = await loadIsCrafter(context.guildId, context.actorDiscordId)
  if (
    !isCrafter &&
    !context.isAdmin &&
    !hasAnyCapability(context.capabilities, CRAFT_OPERATOR_CAPS)
  ) {
    throw new ApplicationCommandError('craft_delivery_not_authorized')
  }
}

export async function prepareCraftDeliveryApplicationCommand(
  context: CraftDeliveryCommandContext,
  input: CraftDeliveryCommandInput,
): Promise<PreparedCraftDeliveryApplicationCommand> {
  const requestPayload = normalizeCraftDeliveryInput(input)
  const [craftedRegearSupported, minRaw, maxRaw, expiryRaw] = await Promise.all([
    isCraftedRegearSupported(context.guildId),
    getAppSetting('craft_box_range_min', '1', context.guildId),
    getAppSetting('craft_box_range_max', '30', context.guildId),
    getAppSetting('craft_box_expiry_days', '7', context.guildId),
    assertCraftOperator(context),
  ])
  if (!craftedRegearSupported) throw new ApplicationCommandError('craft_disabled')
  const rangeMin = parseBoundedSetting(minRaw, 1, 1, 999)
  const rangeMax = parseBoundedSetting(maxRaw, 30, 1, 999)
  if (requestPayload.boxNumber < rangeMin || requestPayload.boxNumber > rangeMax) {
    throw new ApplicationCommandError('craft_box_out_of_range', {
      min: rangeMin,
      max: rangeMax,
    })
  }
  const followupDays = parseBoundedSetting(expiryRaw, 7, 1, 30)
  const db = getAdminClient()
  const { data, error } = await db
    .from('craft_tasks')
    .select(
      'status, crafter_discord_id, compensation_mode, regear_requests!inner(discord_id, username, event_title_snapshot)',
    )
    .eq('guild_id', context.guildId)
    .eq('id', requestPayload.taskId)
    .maybeSingle()
  if (error) {
    throw new ApplicationCommandError('application_command_db_error', { cause: error.message })
  }
  if (
    !data ||
    data.status !== 'claimed' ||
    data.crafter_discord_id !== context.actorDiscordId
  ) {
    throw new ApplicationCommandError('craft_task_not_claimed_by_actor')
  }
  const request = Array.isArray(data.regear_requests)
    ? data.regear_requests[0]
    : data.regear_requests
  if (!request?.discord_id) {
    throw new ApplicationCommandError('craft_task_not_claimed_by_actor')
  }
  const { data: fulfillment, error: fulfillmentError } = await db
    .from('supply_fulfillments')
    .select(
      'status, material_reimbursement_silver, craft_fee_silver, settlement_total_silver',
    )
    .eq('guild_id', context.guildId)
    .eq('craft_task_id', requestPayload.taskId)
    .maybeSingle()
  if (fulfillmentError) {
    throw new ApplicationCommandError('application_command_db_error', {
      cause: fulfillmentError.message,
    })
  }
  if (!fulfillment || fulfillment.status !== 'in_progress') {
    throw new ApplicationCommandError('craft_settlement_terms_missing')
  }
  return {
    requestPayload,
    followupDays,
    eventTitle: (request.event_title_snapshot as string | null) ?? '',
    requesterDiscordId: request.discord_id as string,
    requesterUsername: (request.username as string | null) ?? request.discord_id,
    reimbursementMode: data.compensation_mode === 'paid' ? 'paid' : 'volunteer',
    materialReimbursementSilver: Number(fulfillment.material_reimbursement_silver ?? 0),
    craftFeeSilver: Number(fulfillment.craft_fee_silver ?? 0),
    settlementTotalSilver: Number(fulfillment.settlement_total_silver ?? 0),
  }
}

function resultFromReceipt(
  requestPayload: PreparedCraftDeliveryApplicationCommand['requestPayload'],
  receipt: ApplicationCommandReceipt,
): CraftDeliveryApplicationCommandResult {
  const requesterDiscordId =
    typeof receipt.requesterDiscordId === 'string' ? receipt.requesterDiscordId : ''
  if (!requesterDiscordId) {
    throw new ApplicationCommandError('application_command_result_invalid')
  }
  return {
    requestPayload,
    followupDays: Number(receipt.followupDays ?? 0),
    eventTitle: typeof receipt.eventTitle === 'string' ? receipt.eventTitle : '',
    requesterDiscordId,
    requesterUsername:
      typeof receipt.requesterUsername === 'string'
        ? receipt.requesterUsername
        : requesterDiscordId,
    reimbursementMode:
      receipt.reimbursementMode === 'paid' ? 'paid' : 'volunteer',
    materialReimbursementSilver: Number(receipt.materialReimbursementSilver ?? 0),
    craftFeeSilver: Number(receipt.craftFeeSilver ?? 0),
    settlementTotalSilver: Number(receipt.settlementTotalSilver ?? 0),
    status: typeof receipt.status === 'string' ? receipt.status : 'ready_for_pickup',
    reimbursementSilver: Number(
      receipt.settlementTotalSilver ?? receipt.reimbursementSilver ?? 0,
    ),
    reimbursementStatus:
      typeof receipt.reimbursementStatus === 'string'
        ? receipt.reimbursementStatus
        : 'not_required',
    inventoryWarned: receipt.inventoryWarned === true,
    warnedItemIds: Array.isArray(receipt.warnedItemIds)
      ? receipt.warnedItemIds.filter((value): value is string => typeof value === 'string')
      : [],
    replayed: receipt.replayed === true,
  }
}

export async function executeCraftDeliveryApplicationCommand(
  context: CraftDeliveryCommandContext,
  input: CraftDeliveryCommandInput,
): Promise<CraftDeliveryApplicationCommandResult> {
  const requestPayload = normalizeCraftDeliveryInput(input)
  const existing = await loadApplicationCommandReceipt(
    'craft.deliver',
    context,
    requestPayload,
  )
  if (existing) return resultFromReceipt(requestPayload, existing)

  const prepared = await prepareCraftDeliveryApplicationCommand(context, input)
  const receipt = await executeSupplyCraftDeliveryCommand({
    context,
    requestPayload: prepared.requestPayload,
    followupDays: prepared.followupDays,
  })
  const result = resultFromReceipt(prepared.requestPayload, receipt)
  result.followupDays = prepared.followupDays
  result.reimbursementMode = prepared.reimbursementMode
  result.materialReimbursementSilver = prepared.materialReimbursementSilver
  result.craftFeeSilver = prepared.craftFeeSilver
  result.settlementTotalSilver = prepared.settlementTotalSilver
  result.reimbursementSilver = prepared.settlementTotalSilver
  if (!result.eventTitle) result.eventTitle = prepared.eventTitle
  if (!result.requesterUsername) result.requesterUsername = prepared.requesterUsername

  // Migration 335 committed the member notification to domain_outbox in the
  // same transaction. The shared worker owns delivery and retry; emitting a
  // second best-effort DM here would reintroduce duplicate notifications.
  return result
}
