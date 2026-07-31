import 'server-only'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { ApplicationCommandError, type ApplicationCommandName } from '@/lib/application-command'
import {
  deriveDiscordConfirmationIdempotencyKey,
  stableApplicationCommandJson,
} from '@/lib/application-command-idempotency'
import {
  resolveDiscordCommandActor,
  type DiscordCommandActor,
  type DiscordCommandTenant,
} from '@/lib/discord-command-auth'
import {
  discordStatusLabel,
  formatDiscordCommandMessage,
  loadDiscordCommandSuiteMessages,
  type DiscordCommandSuiteMessages,
} from '@/lib/discord-command-suite-messages'
import {
  messageUpdateReply,
  ephemeralReply,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
  type DiscordMessageComponent,
} from '@/lib/discord-interactions'
import {
  formatDiscordTimestamp,
  formatNumber,
  webButton,
} from '@/lib/discord-command-suite-shared'
import { mapDiscordLocale } from '@/lib/discord'
import {
  executePointTransferApplicationCommand,
  type PointTransferCommandInput,
} from '@/lib/point-transfer-application-command'
import {
  executeShopOrderApplicationCommand,
  type ShopOrderCommandInput,
} from '@/lib/shop-order-application-command'
import {
  executeCraftDeliveryApplicationCommand,
  type CraftDeliveryCommandInput,
} from '@/lib/craft-delivery-application-command'
import {
  executeEventStartApplicationCommand,
  type EventStartCommandInput,
} from '@/lib/event-start-application-command'
import { getAdminClient } from '@/lib/supabase-admin'
import { markPublicShopCacheStale } from '@/lib/shop/cache'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { log } from '@/lib/log'

const CONFIRMATION_TTL_MS = 5 * 60 * 1000
const CUSTOM_ID_PREFIX = 'agmcmd:v1'
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ConfirmationAction = 'confirm' | 'cancel'

interface ConfirmationRow {
  token: string
  guild_id: string
  discord_guild_id: string
  source_interaction_id: string
  command_name: ApplicationCommandName
  idempotency_key: string
  correlation_id: string
  actor_discord_id: string
  request_payload: Record<string, unknown>
  expires_at: string
  confirmed_at: string | null
  cancelled_at: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function customId(action: ConfirmationAction, token: string): string {
  return `${CUSTOM_ID_PREFIX}:${action}:${token}`
}

export function parseDiscordApplicationCommandConfirmationCustomId(
  value: unknown,
): { action: ConfirmationAction; token: string } | null {
  if (typeof value !== 'string') return null
  const match = value.match(
    /^agmcmd:v1:(confirm|cancel):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  )
  return match
    ? { action: match[1] as ConfirmationAction, token: match[2].toLowerCase() }
    : null
}

export function isDiscordApplicationCommandConfirmationCustomId(value: unknown): boolean {
  return parseDiscordApplicationCommandConfirmationCustomId(value) !== null
}

function confirmationButtons(
  token: string,
  messages: DiscordCommandSuiteMessages,
): DiscordMessageComponent[] {
  return [{
    type: 1,
    components: [
      {
        type: 2,
        style: 3,
        label: messages.confirmButton,
        custom_id: customId('confirm', token),
      },
      {
        type: 2,
        style: 2,
        label: messages.cancelButton,
        custom_id: customId('cancel', token),
      },
    ],
  }]
}

function isSameConfirmation(input: {
  row: ConfirmationRow
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  payload: DiscordInteractionPayload
  commandName: ApplicationCommandName
  requestPayload: Record<string, unknown>
}): boolean {
  return (
    input.row.guild_id === input.tenant.id &&
    input.row.discord_guild_id === input.payload.guild_id &&
    input.row.source_interaction_id === input.payload.id &&
    input.row.command_name === input.commandName &&
    input.row.actor_discord_id === input.actor.discordId &&
    stableApplicationCommandJson(input.row.request_payload) ===
      stableApplicationCommandJson(input.requestPayload)
  )
}

export async function createDiscordApplicationCommandConfirmation(input: {
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  payload: DiscordInteractionPayload
  commandName: ApplicationCommandName
  requestPayload: Record<string, unknown>
  summary: string
  messages: DiscordCommandSuiteMessages
}): Promise<DiscordInteractionResponse> {
  if (
    !input.payload.guild_id ||
    input.payload.guild_id !== input.actor.discordGuildId ||
    input.actor.guildId !== input.tenant.id
  ) {
    return ephemeralReply(input.messages.confirmationUnavailable)
  }

  const candidateToken = randomUUID()
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS).toISOString()
  const candidate = {
    token: candidateToken,
    guild_id: input.tenant.id,
    discord_guild_id: input.payload.guild_id,
    source_interaction_id: input.payload.id,
    command_name: input.commandName,
    idempotency_key: deriveDiscordConfirmationIdempotencyKey({
      guildId: input.tenant.id,
      interactionId: input.payload.id,
      confirmationToken: candidateToken,
      commandName: input.commandName,
    }),
    correlation_id: input.payload.id,
    actor_discord_id: input.actor.discordId,
    request_payload: input.requestPayload,
    expires_at: expiresAt,
  }
  const db = getAdminClient()
  const { data, error } = await db
    .from('application_command_confirmations')
    .insert(candidate)
    .select(
      'token, guild_id, discord_guild_id, source_interaction_id, command_name, idempotency_key, correlation_id, actor_discord_id, request_payload, expires_at, confirmed_at, cancelled_at',
    )
    .single()

  let row = data as ConfirmationRow | null
  if (error || !row) {
    const { data: existing, error: lookupError } = await db
      .from('application_command_confirmations')
      .select(
        'token, guild_id, discord_guild_id, source_interaction_id, command_name, idempotency_key, correlation_id, actor_discord_id, request_payload, expires_at, confirmed_at, cancelled_at',
      )
      .eq('guild_id', input.tenant.id)
      .eq('source_interaction_id', input.payload.id)
      .eq('command_name', input.commandName)
      .maybeSingle()
    if (lookupError || !existing) {
      throw new ApplicationCommandError('application_command_confirmation_create_failed', {
        cause: error?.message ?? lookupError?.message,
      })
    }
    row = existing as ConfirmationRow
  }
  if (
    !isSameConfirmation({ ...input, row }) ||
    row.cancelled_at ||
    row.confirmed_at ||
    Date.parse(row.expires_at) <= Date.now()
  ) {
    return ephemeralReply(input.messages.confirmationUnavailable)
  }

  return ephemeralReply([
    input.messages.confirmationTitle,
    input.summary,
    formatDiscordCommandMessage(input.messages.confirmationExpires, {
      expires: `<t:${Math.floor(Date.parse(row.expires_at) / 1000)}:R>`,
    }),
  ].join('\n\n'), {
    components: confirmationButtons(row.token, input.messages),
  })
}

function localeFromPayload(payload: DiscordInteractionPayload) {
  return mapDiscordLocale(payload.locale) ?? mapDiscordLocale(payload.guild_locale) ?? 'en'
}

async function loadConfirmationContext(
  payload: DiscordInteractionPayload,
  token: string,
): Promise<{
  row: ConfirmationRow
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
} | null> {
  if (!payload.guild_id) return null
  const db = getAdminClient()
  const { data: confirmation, error } = await db
    .from('application_command_confirmations')
    .select(
      'token, guild_id, discord_guild_id, source_interaction_id, command_name, idempotency_key, correlation_id, actor_discord_id, request_payload, expires_at, confirmed_at, cancelled_at',
    )
    .eq('token', token)
    .eq('discord_guild_id', payload.guild_id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!confirmation) return null
  const row = confirmation as ConfirmationRow
  const { data: tenantRow, error: tenantError } = await db
    .from('tenants')
    .select('id, slug, name, created_by_discord_id, admin_role_ids')
    .eq('id', row.guild_id)
    .eq('discord_guild_id', payload.guild_id)
    .eq('status', 'active')
    .maybeSingle()
  if (tenantError) throw new Error(tenantError.message)
  if (!tenantRow) return null
  const tenant: DiscordCommandTenant = {
    id: tenantRow.id as string,
    slug: tenantRow.slug as string,
    name: tenantRow.name as string,
    createdByDiscordId:
      (tenantRow.created_by_discord_id as string | null) ?? null,
    adminRoleIds: (tenantRow.admin_role_ids as string[] | null) ?? [],
  }
  const actorResult = await resolveDiscordCommandActor({
    tenant,
    payload,
    requireMember: row.command_name !== 'event.start',
  })
  if (!actorResult.ok || actorResult.actor.discordId !== row.actor_discord_id) return null
  return { row, tenant, actor: actorResult.actor }
}

function pointInput(payload: Record<string, unknown>): PointTransferCommandInput | null {
  if (!Array.isArray(payload.transfers)) return null
  const transfers = payload.transfers.flatMap((entry) => {
    if (!isRecord(entry)) return []
    if (
      typeof entry.discordId !== 'string' ||
      typeof entry.amount !== 'number'
    ) {
      if (typeof entry.discord_id !== 'string' || typeof entry.amount !== 'number') {
        return []
      }
      return [{
        discordId: entry.discord_id,
        amount: entry.amount,
        memo: typeof entry.memo === 'string' ? entry.memo : null,
      }]
    }
    return [{
      discordId: entry.discordId,
      amount: entry.amount,
      memo: typeof entry.memo === 'string' ? entry.memo : null,
    }]
  })
  return transfers.length === payload.transfers.length ? { transfers } : null
}

function shopInput(payload: Record<string, unknown>): ShopOrderCommandInput | null {
  if (!Array.isArray(payload.lines) || typeof payload.memberNote !== 'string') return null
  const lines = payload.lines.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.inventoryId !== 'string' ||
      typeof entry.quantity !== 'number' ||
      typeof entry.expectedUnitPoints !== 'number'
    ) return []
    return [{
      inventoryId: entry.inventoryId,
      quantity: entry.quantity,
      expectedUnitPoints: entry.expectedUnitPoints,
      memberQuoteUnitSilver:
        typeof entry.memberQuoteUnitSilver === 'number'
          ? entry.memberQuoteUnitSilver
          : null,
      memberQuoteCity:
        typeof entry.memberQuoteCity === 'string' ? entry.memberQuoteCity : null,
      memberQuoteNote:
        typeof entry.memberQuoteNote === 'string' ? entry.memberQuoteNote : null,
    }]
  })
  return lines.length === payload.lines.length
    ? { lines, memberNote: payload.memberNote }
    : null
}

function craftInput(payload: Record<string, unknown>): CraftDeliveryCommandInput | null {
  return typeof payload.taskId === 'string' &&
    typeof payload.boxNumber === 'number'
    ? {
        taskId: payload.taskId,
        boxNumber: payload.boxNumber,
      }
    : null
}

function eventInput(payload: Record<string, unknown>): EventStartCommandInput | null {
  return typeof payload.eventId === 'string' ? { eventId: payload.eventId } : null
}

function shopItemSummary(
  lines: readonly { nameKo: string; enchant: number; quantity: number }[],
): string {
  const visible = lines.slice(0, 3).map((line) =>
    `${line.nameKo}${line.enchant > 0 ? ` .${line.enchant}` : ''} × ${formatNumber(line.quantity)}`
  )
  const hidden = lines.length - visible.length
  return `${visible.join(', ')}${hidden > 0 ? ` +${hidden}` : ''}`
}

async function executeConfirmedCommand(input: {
  row: ConfirmationRow
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  messages: DiscordCommandSuiteMessages
}): Promise<{ content: string; path: string }> {
  const context = {
    guildId: input.tenant.id,
    actorDiscordId: input.actor.discordId,
    actorUsername: input.actor.username,
    source: 'discord' as const,
    correlationId: input.row.correlation_id,
    idempotencyKey: input.row.idempotency_key,
    confirmationToken: input.row.token,
  }

  if (input.row.command_name === 'point.transfer') {
    const request = pointInput(input.row.request_payload)
    if (!request) throw new ApplicationCommandError('application_command_confirmation_invalid')
    const result = await executePointTransferApplicationCommand(context, request)
    revalidatePath('/me')
    revalidatePath(`/members/${input.actor.discordId}`)
    for (const recipient of result.recipients) {
      revalidatePath(`/members/${recipient.discordId}`)
    }
    return {
      content: formatDiscordCommandMessage(input.messages.transferCompleted, {
        member: result.recipients.map((recipient) => recipient.username).join(', '),
        amount: formatNumber(result.total),
        balance: formatNumber(result.spendableAfter),
      }),
      path: '/me/wallet',
    }
  }

  if (input.row.command_name === 'shop.order') {
    const request = shopInput(input.row.request_payload)
    if (!request) throw new ApplicationCommandError('application_command_confirmation_invalid')
    const result = await executeShopOrderApplicationCommand(context, request)
    const items = shopItemSummary(result.orderLines)
    const stock = result.orderLines
      .map((line) =>
        `${line.nameKo} ${formatNumber(result.stockAfterByInventoryId[line.inventoryId] ?? 0)}`
      )
      .join(', ')
    markPublicShopCacheStale(input.tenant.id)
    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    if (!result.replayed) {
      void sendAdminNotification({
        guildId: input.tenant.id,
        topic: 'shop',
        sourceTable: 'shop_orders',
        sourceId: result.orderId,
        title: input.messages.shopOrderAdminTitle,
        body: formatDiscordCommandMessage(input.messages.shopOrderAdminBody, {
          member: input.actor.username,
          item: items,
          quantity: result.orderLines.reduce((sum, line) => sum + line.quantity, 0),
          points: formatNumber(result.total),
        }),
        url: `/admin/dashboard/approvals?tab=shop&order=${encodeURIComponent(result.orderId)}#shop-order-${encodeURIComponent(result.orderId)}`,
      })
    }
    return {
      content: formatDiscordCommandMessage(input.messages.shopOrderCompleted, {
        status: discordStatusLabel(result.status, input.messages),
        items,
        points: formatNumber(result.total),
        balance: formatNumber(result.spendableAfter),
        stock: stock || '-',
      }),
      path: '/shop',
    }
  }

  if (input.row.command_name === 'craft.deliver') {
    const request = craftInput(input.row.request_payload)
    if (!request) throw new ApplicationCommandError('application_command_confirmation_invalid')
    const result = await executeCraftDeliveryApplicationCommand({
      ...context,
      isAdmin: input.actor.isAdmin,
      capabilities: input.actor.capabilities,
    }, request)
    revalidatePath('/craft/queue')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/inventory')
    revalidatePath('/craft/inventory')
    const warning = result.inventoryWarned
      ? formatDiscordCommandMessage(input.messages.inventoryWarning, {
          count: result.warnedItemIds.length,
        })
      : ''
    return {
      content: formatDiscordCommandMessage(input.messages.craftDeliveryCompleted, {
        status: discordStatusLabel(result.status, input.messages),
        event: result.eventTitle || '-',
        member: result.requesterUsername,
        box: result.requestPayload.boxNumber,
        silver: formatNumber(result.reimbursementSilver),
        warning,
      }),
      path: `/craft/queue/${result.requestPayload.taskId}`,
    }
  }

  const request = eventInput(input.row.request_payload)
  if (!request) throw new ApplicationCommandError('application_command_confirmation_invalid')
  const result = await executeEventStartApplicationCommand({
    ...context,
    isAdmin: input.actor.isAdmin,
    capabilities: input.actor.capabilities,
    eventCreatorCategories: [],
  }, request)
  revalidatePath(`/admin/dashboard/events/${request.eventId}`)
  revalidatePath(`/events/${request.eventId}`)
  return {
    content: formatDiscordCommandMessage(input.messages.eventStartCompleted, {
      title: result.title,
      started: formatDiscordTimestamp(result.battleStartedAt),
      count: result.participantSnapshotCount,
    }),
    path: `/admin/dashboard/events/${request.eventId}`,
  }
}

function confirmationErrorMessage(
  error: unknown,
  messages: DiscordCommandSuiteMessages,
): string {
  if (!(error instanceof ApplicationCommandError)) {
    return messages.confirmationUnavailable
  }
  if (error.code.includes('confirmation_expired')) return messages.confirmationExpired
  if (error.code.includes('confirmation_cancelled')) return messages.confirmationCancelled
  return messages.confirmationUnavailable
}

function confirmationWebPath(row: ConfirmationRow): string {
  if (row.command_name === 'point.transfer') return '/me/wallet'
  if (row.command_name === 'shop.order') return '/shop'
  if (row.command_name === 'craft.deliver') {
    const taskId = typeof row.request_payload.taskId === 'string'
      ? row.request_payload.taskId
      : ''
    return UUID_RE.test(taskId) ? `/craft/queue/${taskId}` : '/craft/queue'
  }
  const eventId = typeof row.request_payload.eventId === 'string'
    ? row.request_payload.eventId
    : ''
  return UUID_RE.test(eventId)
    ? `/admin/dashboard/events/${eventId}`
    : '/admin/dashboard/events'
}

async function completedConfirmationResponse(input: {
  row: ConfirmationRow
  tenant: DiscordCommandTenant
  actor: DiscordCommandActor
  messages: DiscordCommandSuiteMessages
}): Promise<DiscordInteractionResponse> {
  const result = await executeConfirmedCommand(input)
  let components: DiscordMessageComponent[] = []
  try {
    components = await webButton(
      input.tenant,
      input.actor.discordId,
      result.path,
      input.messages.openWeb,
    )
  } catch (error) {
    log.warn('[discord-application-command] detail link creation failed', {
      guild_id: input.tenant.id,
      actor_discord_id: input.actor.discordId,
      command: input.row.command_name,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return messageUpdateReply(result.content, { components })
}

export async function handleDiscordApplicationCommandConfirmation(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const parsed = parseDiscordApplicationCommandConfirmationCustomId(payload.data?.custom_id)
  const messages = await loadDiscordCommandSuiteMessages(localeFromPayload(payload))
  if (!parsed || !UUID_RE.test(parsed.token)) {
    return messageUpdateReply(messages.confirmationUnavailable, { components: [] })
  }
  const resolved = await loadConfirmationContext(payload, parsed.token)
  if (!resolved) {
    return messageUpdateReply(messages.confirmationUnavailable, { components: [] })
  }
  const { row, tenant, actor } = resolved
  if (row.cancelled_at) {
    return messageUpdateReply(messages.confirmationCancelled, { components: [] })
  }
  if (!row.confirmed_at && Date.parse(row.expires_at) <= Date.now()) {
    return messageUpdateReply(messages.confirmationExpired, { components: [] })
  }

  if (parsed.action === 'cancel') {
    const { data, error } = await getAdminClient()
      .from('application_command_confirmations')
      .update({ cancelled_at: new Date().toISOString() })
      .eq('token', row.token)
      .eq('guild_id', tenant.id)
      .eq('actor_discord_id', actor.discordId)
      .is('confirmed_at', null)
      .is('cancelled_at', null)
      .select('token')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (data) {
      return messageUpdateReply(messages.confirmationCancelled, { components: [] })
    }
    const { data: latest, error: latestError } = await getAdminClient()
      .from('application_command_confirmations')
      .select('confirmed_at, cancelled_at')
      .eq('token', row.token)
      .eq('guild_id', tenant.id)
      .maybeSingle()
    if (latestError) throw new Error(latestError.message)
    if (latest?.cancelled_at) {
      return messageUpdateReply(messages.confirmationCancelled, { components: [] })
    }
    if (latest?.confirmed_at) {
      try {
        return await completedConfirmationResponse({ row, tenant, actor, messages })
      } catch (error) {
        log.warn('[discord-application-command] completed result reload failed', {
          guild_id: tenant.id,
          actor_discord_id: actor.discordId,
          command: row.command_name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return messageUpdateReply(messages.confirmationUnavailable, { components: [] })
  }

  try {
    return await completedConfirmationResponse({ row, tenant, actor, messages })
  } catch (error) {
    log.warn('[discord-application-command] confirmation execution rejected', {
      guild_id: tenant.id,
      actor_discord_id: actor.discordId,
      command: row.command_name,
      error: error instanceof Error ? error.message : String(error),
    })
    let components: DiscordMessageComponent[] = []
    try {
      components = await webButton(
        tenant,
        actor.discordId,
        confirmationWebPath(row),
        messages.openWeb,
      )
    } catch {
      // The state-change explanation is still useful without a handoff link.
    }
    return messageUpdateReply(confirmationErrorMessage(error, messages), { components })
  }
}
