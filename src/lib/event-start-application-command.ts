import 'server-only'

import {
  ApplicationCommandError,
  executeApplicationCommand,
  loadApplicationCommandReceipt,
  type ApplicationCommandContext,
  type ApplicationCommandReceipt,
} from '@/lib/application-command'
import { EVENT_CREATE_CAP_BY_CATEGORY } from '@/lib/event-permissions'
import { CAP, hasCapability } from '@/lib/permissions'
import { prepareEventEffectiveRegearPolicyStart } from '@/lib/regear-effective-policy-server'
import { getAdminClient } from '@/lib/supabase-admin'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface EventStartCommandContext extends ApplicationCommandContext {
  isAdmin: boolean
  capabilities: bigint
  eventCreatorCategories: readonly EventCategory[]
}

export interface EventStartCommandInput {
  eventId: string
}

export interface PreparedEventStartApplicationCommand {
  requestPayload: { eventId: string }
  title: string
  category: EventCategory
}

export interface EventStartApplicationCommandResult
  extends PreparedEventStartApplicationCommand {
  status: string
  battleStartedAt: string
  policyVersionId: string
  participantSnapshotCount: number
  replayed: boolean
}

function normalizeEventStartInput(input: EventStartCommandInput): { eventId: string } {
  const eventId = typeof input.eventId === 'string' ? input.eventId.trim() : ''
  if (!UUID_RE.test(eventId)) throw new ApplicationCommandError('event_start_invalid')
  return { eventId }
}

function canStartEvent(input: {
  context: EventStartCommandContext
  category: EventCategory
  createdBy: string | null
}): boolean {
  if (
    input.context.isAdmin ||
    hasCapability(input.context.capabilities, CAP.EVENT_MANAGE)
  ) return true
  if (input.createdBy !== input.context.actorDiscordId) return false
  return (
    input.context.eventCreatorCategories.includes(input.category) ||
    hasCapability(
      input.context.capabilities,
      EVENT_CREATE_CAP_BY_CATEGORY[input.category],
    )
  )
}

export async function prepareEventStartApplicationCommand(
  context: EventStartCommandContext,
  input: EventStartCommandInput,
): Promise<PreparedEventStartApplicationCommand> {
  const requestPayload = normalizeEventStartInput(input)
  const { data, error } = await getAdminClient()
    .from('events')
    .select('id, title, status, category, created_by, battle_started_at')
    .eq('guild_id', context.guildId)
    .eq('id', requestPayload.eventId)
    .maybeSingle()
  if (error) {
    throw new ApplicationCommandError('application_command_db_error', { cause: error.message })
  }
  if (!data) throw new ApplicationCommandError('event_not_found')
  if (data.status !== 'published') {
    throw new ApplicationCommandError('event_not_published')
  }
  if (data.battle_started_at) {
    throw new ApplicationCommandError('event_already_started')
  }
  const category = EVENT_CATEGORIES.includes(data.category as EventCategory)
    ? data.category as EventCategory
    : '전투'
  if (!canStartEvent({
    context,
    category,
    createdBy: (data.created_by as string | null) ?? null,
  })) {
    throw new ApplicationCommandError('event_start_not_authorized')
  }
  return {
    requestPayload,
    title: data.title as string,
    category,
  }
}

function resultFromReceipt(
  requestPayload: { eventId: string },
  receipt: ApplicationCommandReceipt,
): EventStartApplicationCommandResult {
  const title = typeof receipt.title === 'string' ? receipt.title : ''
  const battleStartedAt =
    typeof receipt.battleStartedAt === 'string'
      ? receipt.battleStartedAt
      : typeof receipt.started_at === 'string'
        ? receipt.started_at
        : ''
  const policyVersionId =
    typeof receipt.policy_version_id === 'string'
      ? receipt.policy_version_id
      : ''
  if (!title || !battleStartedAt || !policyVersionId) {
    throw new ApplicationCommandError('application_command_result_invalid')
  }
  return {
    requestPayload,
    title,
    category:
      typeof receipt.category === 'string' &&
      EVENT_CATEGORIES.includes(receipt.category as EventCategory)
        ? receipt.category as EventCategory
        : '전투',
    status: typeof receipt.status === 'string' ? receipt.status : 'published',
    battleStartedAt,
    policyVersionId,
    participantSnapshotCount: Number(receipt.participant_snapshot_count ?? 0),
    replayed: receipt.replayed === true,
  }
}

export async function executeEventStartApplicationCommand(
  context: EventStartCommandContext,
  input: EventStartCommandInput,
): Promise<EventStartApplicationCommandResult> {
  const requestPayload = normalizeEventStartInput(input)
  const existing = await loadApplicationCommandReceipt(
    'event.start',
    context,
    requestPayload,
  )
  if (existing) return resultFromReceipt(requestPayload, existing)

  const prepared = await prepareEventStartApplicationCommand(context, input)
  const startedAt = new Date().toISOString()
  const policy = await prepareEventEffectiveRegearPolicyStart({
    db: getAdminClient(),
    guildId: context.guildId,
    eventId: prepared.requestPayload.eventId,
    startedAt,
  })
  const receipt = await executeApplicationCommand({
    commandName: 'event.start',
    context,
    requestPayload: prepared.requestPayload,
    executionPayload: {
      startedAt,
      policyVersionId: policy.policyVersionId,
      policyConfigSnapshot: policy.policyConfigSnapshot,
      participantSnapshots: policy.participantSnapshots,
    },
  })
  const result = resultFromReceipt(prepared.requestPayload, receipt)
  result.category = prepared.category
  return result
}
