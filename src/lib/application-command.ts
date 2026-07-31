import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import {
  isApplicationCommandIdempotencyKey,
  stableApplicationCommandJson,
} from '@/lib/application-command-idempotency'

export const APPLICATION_COMMAND_NAMES = [
  'point.transfer',
  'shop.order',
  'craft.deliver',
  'event.start',
] as const

export type ApplicationCommandName = (typeof APPLICATION_COMMAND_NAMES)[number]
export type ApplicationCommandSource = 'web' | 'discord'

export interface ApplicationCommandContext {
  guildId: string
  actorDiscordId: string
  actorUsername: string
  source: ApplicationCommandSource
  correlationId: string
  idempotencyKey: string
  confirmationToken?: string
}

export interface ApplicationCommandReceipt {
  replayed: boolean
  [key: string]: unknown
}

export class ApplicationCommandError extends Error {
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(code: string, details: Record<string, unknown> = {}) {
    super(code)
    this.name = 'ApplicationCommandError'
    this.code = code
    this.details = details
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertContext(context: ApplicationCommandContext): void {
  if (
    !isApplicationCommandIdempotencyKey(context.guildId) ||
    !isApplicationCommandIdempotencyKey(context.idempotencyKey) ||
    (context.confirmationToken !== undefined &&
      !isApplicationCommandIdempotencyKey(context.confirmationToken)) ||
    (context.source === 'discord') !== (context.confirmationToken !== undefined) ||
    !context.actorDiscordId.trim() ||
    context.actorDiscordId.length > 128 ||
    !context.actorUsername.trim() ||
    context.actorUsername.length > 128 ||
    !context.correlationId.trim() ||
    context.correlationId.length > 128
  ) {
    throw new ApplicationCommandError('application_command_invalid')
  }
}

function matchesExistingRun(input: {
  commandName: ApplicationCommandName
  context: ApplicationCommandContext
  requestPayload: Record<string, unknown>
  row: {
    command_name: unknown
    actor_discord_id: unknown
    source: unknown
    request_payload: unknown
  }
}): boolean {
  return (
    input.row.command_name === input.commandName &&
    input.row.actor_discord_id === input.context.actorDiscordId &&
    input.row.source === input.context.source &&
    stableApplicationCommandJson(input.row.request_payload) ===
      stableApplicationCommandJson(input.requestPayload)
  )
}

export async function loadApplicationCommandReceipt(
  commandName: ApplicationCommandName,
  context: ApplicationCommandContext,
  requestPayload: Record<string, unknown>,
): Promise<ApplicationCommandReceipt | null> {
  assertContext(context)
  const { data, error } = await getAdminClient()
    .from('application_command_runs')
    .select('command_name, actor_discord_id, source, request_payload, result')
    .eq('guild_id', context.guildId)
    .eq('idempotency_key', context.idempotencyKey)
    .maybeSingle()
  if (error) throw new ApplicationCommandError('application_command_db_error', { cause: error.message })
  if (!data) return null
  if (!matchesExistingRun({ commandName, context, requestPayload, row: data })) {
    throw new ApplicationCommandError('application_command_idempotency_conflict')
  }
  if (!isObject(data.result)) {
    throw new ApplicationCommandError('application_command_result_invalid')
  }
  return { ...data.result, replayed: true }
}

export async function executeApplicationCommand(input: {
  commandName: ApplicationCommandName
  context: ApplicationCommandContext
  requestPayload: Record<string, unknown>
  executionPayload?: Record<string, unknown>
}): Promise<ApplicationCommandReceipt> {
  assertContext(input.context)
  const { data, error } = await getAdminClient().rpc('execute_application_command', {
    p_guild_id: input.context.guildId,
    p_command_name: input.commandName,
    p_idempotency_key: input.context.idempotencyKey,
    p_correlation_id: input.context.correlationId,
    p_actor_discord_id: input.context.actorDiscordId,
    p_actor_username: input.context.actorUsername,
    p_source: input.context.source,
    p_request_payload: input.requestPayload,
    p_execution_payload: input.executionPayload ?? {},
    p_confirmation_token: input.context.confirmationToken ?? null,
  })
  if (error) {
    throw new ApplicationCommandError(error.message, { cause: error.message })
  }
  if (!isObject(data)) {
    throw new ApplicationCommandError('application_command_result_invalid')
  }
  return data as ApplicationCommandReceipt
}

export async function executeSupplyCraftDeliveryCommand(input: {
  context: ApplicationCommandContext
  requestPayload: Record<string, unknown>
  followupDays: number
}): Promise<ApplicationCommandReceipt> {
  assertContext(input.context)
  const { data, error } = await getAdminClient().rpc('execute_supply_craft_delivery', {
    p_guild_id: input.context.guildId,
    p_idempotency_key: input.context.idempotencyKey,
    p_correlation_id: input.context.correlationId,
    p_actor_discord_id: input.context.actorDiscordId,
    p_actor_username: input.context.actorUsername,
    p_source: input.context.source,
    p_request_payload: input.requestPayload,
    p_execution_payload: { followupDays: input.followupDays },
    p_confirmation_token: input.context.confirmationToken ?? null,
  })
  if (error) {
    throw new ApplicationCommandError(error.message, { cause: error.message })
  }
  if (!isObject(data)) {
    throw new ApplicationCommandError('application_command_result_invalid')
  }
  return data as ApplicationCommandReceipt
}
