import 'server-only'

import {
  ApplicationCommandError,
  executeApplicationCommand,
  loadApplicationCommandReceipt,
  type ApplicationCommandContext,
  type ApplicationCommandReceipt,
} from '@/lib/application-command'
import { getAppSetting } from '@/lib/app-settings'
import { loadIsCrafter } from '@/lib/craft-task-mapping'
import { sendLocalizedDiscordDmToUser } from '@/lib/discord-dm-localized'
import { CAP, hasAnyCapability } from '@/lib/permissions'
import { getAdminClient } from '@/lib/supabase-admin'
import { isCraftedRegearSupported } from '@/lib/regear-support-server'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const POSTGRES_INT_MAX = 2_147_483_647
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
  materialSilverCost: number
}

export interface PreparedCraftDeliveryApplicationCommand {
  requestPayload: {
    taskId: string
    boxNumber: number
    materialSilverCost: number
  }
  expiryDays: number
  eventTitle: string
  requesterDiscordId: string
  requesterUsername: string
  reimbursementMode: 'volunteer' | 'paid'
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
    input.boxNumber > 999 ||
    !Number.isInteger(input.materialSilverCost) ||
    input.materialSilverCost < 0 ||
    input.materialSilverCost > POSTGRES_INT_MAX
  ) {
    throw new ApplicationCommandError('craft_delivery_invalid')
  }
  return {
    taskId,
    boxNumber: input.boxNumber,
    materialSilverCost: input.materialSilverCost,
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
  const expiryDays = parseBoundedSetting(expiryRaw, 7, 1, 30)
  const { data, error } = await getAdminClient()
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
  return {
    requestPayload,
    expiryDays,
    eventTitle: (request.event_title_snapshot as string | null) ?? '',
    requesterDiscordId: request.discord_id as string,
    requesterUsername: (request.username as string | null) ?? request.discord_id,
    reimbursementMode: data.compensation_mode === 'paid' ? 'paid' : 'volunteer',
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
    expiryDays: Number(receipt.expiryDays ?? 0),
    eventTitle: typeof receipt.eventTitle === 'string' ? receipt.eventTitle : '',
    requesterDiscordId,
    requesterUsername:
      typeof receipt.requesterUsername === 'string'
        ? receipt.requesterUsername
        : requesterDiscordId,
    reimbursementMode:
      receipt.reimbursementMode === 'paid' ? 'paid' : 'volunteer',
    status: typeof receipt.status === 'string' ? receipt.status : 'delivered',
    reimbursementSilver: Number(receipt.reimbursementSilver ?? 0),
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
  const receipt = await executeApplicationCommand({
    commandName: 'craft.deliver',
    context,
    requestPayload: prepared.requestPayload,
    executionPayload: { expiryDays: prepared.expiryDays },
  })
  const result = resultFromReceipt(prepared.requestPayload, receipt)
  result.expiryDays = prepared.expiryDays
  result.reimbursementMode = prepared.reimbursementMode
  if (!result.eventTitle) result.eventTitle = prepared.eventTitle
  if (!result.requesterUsername) result.requesterUsername = prepared.requesterUsername

  // The domain mutation and inventory movement are already atomic. DM is a
  // best-effort projection and is emitted only by the winning execution.
  if (!result.replayed) {
    void sendLocalizedDiscordDmToUser(
      result.requesterDiscordId,
      context.guildId,
      (tDm) => ({
        title: tDm('craftDeliveredTitle'),
        body: tDm('craftDeliveredBody', {
          event: result.eventTitle,
          box: result.requestPayload.boxNumber,
          crafter: context.actorUsername,
        }),
        url: '/me',
      }),
    )
  }
  return result
}
