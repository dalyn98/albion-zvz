import 'server-only'

import {
  ephemeralReply,
  findDiscordModalValue,
  INTERACTION_TYPE_MODAL_SUBMIT,
  modalReply,
  type DiscordInteractionOption,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import {
  buildCategoryPicker,
  buildTicketModal,
  formatSupportTicketNumber,
  isDiscordSupportTicketCustomId,
  isSupportGuild,
  normalizeSupportTicketInput,
  parseSelectedCategory,
  parseSupportCustomId,
  parseSupportTicketNumber,
  supportModalCustomId,
  type SupportTicketPriority,
} from '@/lib/discord-support-ticket-core'
import {
  loadDiscordSupportMessages,
  resolveDiscordSupportLocale,
} from '@/lib/discord-support-ticket-messages'
import {
  configureSupportTickets,
  createSupportTicket,
  isSupportStaff,
  loadSupportTicket,
  loadSupportTicketByNumber,
  publishSupportTicketPanel,
  setSupportTicketPriority,
  linkSupportTicketKnownIssue,
  transitionSupportTicket,
} from '@/lib/discord-support-ticket-service'
import { formatSupportHealthReport, inspectSupportHealth } from '@/lib/discord-support-health'
import { isDiscordId } from '@/lib/discord-id'
import { isSuperAdmin } from '@/lib/super-admin-identity'

export function isDiscordSupportCommand(payload: DiscordInteractionPayload): boolean {
  return payload.data?.name === 'support'
}

export function isDiscordSupportInteraction(payload: DiscordInteractionPayload): boolean {
  return isDiscordSupportTicketCustomId(payload.data?.custom_id)
}

export function shouldDeferDiscordSupportInteraction(payload: DiscordInteractionPayload): boolean {
  const parsed = parseSupportCustomId(payload.data?.custom_id)
  return payload.type === INTERACTION_TYPE_MODAL_SUBMIT || parsed?.kind === 'action'
}

function invoker(payload: DiscordInteractionPayload): { id: string; name: string } | null {
  const user = payload.member?.user ?? payload.user
  if (!user || !isDiscordId(user.id)) return null
  return {
    id: user.id,
    name:
      payload.member?.nick?.trim() ||
      user.global_name?.trim() ||
      user.username.trim() ||
      user.id,
  }
}

function commandOptions(payload: DiscordInteractionPayload): {
  name: string | null
  options: DiscordInteractionOption[]
} {
  const command = payload.data?.options?.[0]
  return {
    name: command?.name ?? null,
    options: command?.options ?? [],
  }
}

function optionValue(options: DiscordInteractionOption[], name: string): string | null {
  const value = options.find((option) => option.name === name)?.value
  return typeof value === 'string' ? value : null
}

function format(template: string, variables: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => variables[key] ?? `{${key}}`)
}

function ticketUrl(ticket: { support_guild_id: string; thread_id: string | null }): string | null {
  if (!ticket.thread_id) return null
  return `https://discord.com/channels/${ticket.support_guild_id}/${ticket.thread_id}`
}

export async function handleDiscordSupportApplicationCommand(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const locale = resolveDiscordSupportLocale(payload)
  const messages = await loadDiscordSupportMessages(locale)
  if (!payload.guild_id || !isSupportGuild(payload.guild_id)) return ephemeralReply(messages.unavailable)
  const actor = invoker(payload)
  if (!actor) return ephemeralReply(messages.unavailable)
  const command = commandOptions(payload)

  if (command.name === 'setup') {
    if (!isSuperAdmin(actor.id)) return ephemeralReply(messages.adminOnly)
    const parentChannelId = optionValue(command.options, 'parent')
    const logChannelId = optionValue(command.options, 'log')
    const staffRoleId = optionValue(command.options, 'staff-role')
    if (!parentChannelId || !logChannelId || !staffRoleId) return ephemeralReply(messages.invalidInput)
    await configureSupportTickets({
      supportGuildId: payload.guild_id,
      parentChannelId,
      logChannelId,
      staffRoleId,
      queueChannelId: optionValue(command.options, 'queue') ?? undefined,
      aiReviewChannelId: optionValue(command.options, 'ai-review') ?? undefined,
      securityAlertChannelId: optionValue(command.options, 'security-alert') ?? undefined,
      statusChannelId: optionValue(command.options, 'status') ?? undefined,
      knownIssuesChannelId: optionValue(command.options, 'known-issues') ?? undefined,
      actorDiscordId: actor.id,
    })
    return ephemeralReply(messages.setupSaved)
  }

  if (command.name === 'panel' || command.name === 'sync') {
    if (!isSuperAdmin(actor.id)) return ephemeralReply(messages.adminOnly)
    try {
      await publishSupportTicketPanel({
        supportGuildId: payload.guild_id,
        actorDiscordId: actor.id,
        messages,
      })
      return ephemeralReply(command.name === 'sync' ? messages.syncDone : messages.actionDone)
    } catch (error) {
      if (error instanceof Error && error.message === 'support_setup_missing') {
        return ephemeralReply(messages.setupMissing)
      }
      throw error
    }
  }

  if (command.name === 'health') {
    if (!isSuperAdmin(actor.id)) return ephemeralReply(messages.adminOnly)
    const report = await inspectSupportHealth(payload.guild_id)
    return ephemeralReply(formatSupportHealthReport(report))
  }

  if (command.name === 'priority') {
    if (!(await isSupportStaff(payload.guild_id, actor.id))) return ephemeralReply(messages.staffOnly)
    const number = parseSupportTicketNumber(optionValue(command.options, 'ticket') ?? '')
    const priority = optionValue(command.options, 'level') as SupportTicketPriority | null
    if (!number || !priority || !['normal', 'high', 'urgent'].includes(priority)) {
      return ephemeralReply(messages.invalidInput)
    }
    const ticket = await loadSupportTicketByNumber(payload.guild_id, number)
    if (!ticket) return ephemeralReply(messages.ticketNotFound)
    await setSupportTicketPriority({
      ticketId: ticket.id,
      priority,
      actorDiscordId: actor.id,
      interactionId: payload.id,
    })
    return ephemeralReply(messages.priorityUpdated)
  }

  if (command.name === 'known-issue') {
    if (!(await isSupportStaff(payload.guild_id, actor.id))) return ephemeralReply(messages.staffOnly)
    const number = parseSupportTicketNumber(optionValue(command.options, 'ticket') ?? '')
    const slug = optionValue(command.options, 'slug')
    if (!number || !slug) return ephemeralReply(messages.invalidInput)
    const ticket = await loadSupportTicketByNumber(payload.guild_id, number)
    if (!ticket) return ephemeralReply(messages.ticketNotFound)
    const linked = await linkSupportTicketKnownIssue({
      ticket,
      slug,
      actorDiscordId: actor.id,
      interactionId: payload.id,
    })
    return ephemeralReply(linked ? messages.knownIssueLinked : messages.knownIssueNotFound)
  }

  if (command.name === 'reopen') {
    if (!(await isSupportStaff(payload.guild_id, actor.id))) return ephemeralReply(messages.staffOnly)
    const number = parseSupportTicketNumber(optionValue(command.options, 'ticket') ?? '')
    if (!number) return ephemeralReply(messages.invalidInput)
    const ticket = await loadSupportTicketByNumber(payload.guild_id, number)
    if (!ticket) return ephemeralReply(messages.ticketNotFound)
    if (ticket.thread_deleted_at) return ephemeralReply(messages.ticketDeleted)
    const reopened = await transitionSupportTicket({
      ticketId: ticket.id,
      action: 'reopen',
      actorDiscordId: actor.id,
      actorKind: 'staff',
      interactionId: payload.id,
    })
    const url = ticketUrl(reopened)
    return ephemeralReply(url ? `${messages.reopened}\n${url}` : messages.reopened)
  }

  return ephemeralReply(messages.unavailable)
}

export async function handleDiscordSupportInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const locale = resolveDiscordSupportLocale(payload)
  const messages = await loadDiscordSupportMessages(locale)
  if (!payload.guild_id || !isSupportGuild(payload.guild_id)) return ephemeralReply(messages.unavailable)
  const actor = invoker(payload)
  if (!actor) return ephemeralReply(messages.unavailable)
  const parsed = parseSupportCustomId(payload.data?.custom_id)
  if (!parsed) return ephemeralReply(messages.unavailable)

  if (parsed.kind === 'create') {
    return ephemeralReply(messages.categoryPrompt, { components: buildCategoryPicker(messages) })
  }

  if (parsed.kind === 'category_picker') {
    const category = parseSelectedCategory(payload.data?.values)
    if (!category) return ephemeralReply(messages.invalidInput)
    return modalReply({
      customId: supportModalCustomId(category),
      title: messages.modalTitle,
      components: buildTicketModal(category, messages),
    })
  }

  if (parsed.kind === 'modal') {
    const normalized = normalizeSupportTicketInput({
      subject: findDiscordModalValue(payload.data?.components, 'subject'),
      description: findDiscordModalValue(payload.data?.components, 'description'),
      guildHint: findDiscordModalValue(payload.data?.components, 'guild_hint'),
    })
    if (!normalized) return ephemeralReply(messages.invalidInput)
    const result = await createSupportTicket({
      supportGuildId: payload.guild_id,
      openerDiscordId: actor.id,
      openerName: actor.name,
      openerLocale: locale,
      category: parsed.category,
      subject: normalized.subject,
      description: normalized.description,
      guildHint: normalized.guildHint,
      interactionId: payload.id,
    }, messages)
    if (!result.ok) {
      return ephemeralReply(
        result.reason === 'disabled'
          ? messages.unavailable
          : result.reason === 'rate_limited'
            ? messages.rateLimited
            : messages.createFailed,
      )
    }
    const url = ticketUrl(result.ticket)
    const template = result.existing ? messages.existing : messages.created
    return ephemeralReply(format(template, {
      ticket: formatSupportTicketNumber(result.ticket.ticket_number),
      url: url ?? '',
    }))
  }

  if (parsed.kind !== 'action') return ephemeralReply(messages.unavailable)

  const ticket = await loadSupportTicket(parsed.ticketId)
  if (!ticket || ticket.support_guild_id !== payload.guild_id) {
    return ephemeralReply(messages.ticketNotFound)
  }
  const requesterAction = parsed.action === 'continue' || parsed.action === 'close_requester'
  const actorKind = requesterAction ? 'requester' : 'staff'
  if (requesterAction) {
    if (ticket.opener_discord_id !== actor.id) return ephemeralReply(messages.invalidAction)
  } else if (!(await isSupportStaff(payload.guild_id, actor.id))) {
    return ephemeralReply(messages.staffOnly)
  }

  try {
    await transitionSupportTicket({
      ticketId: ticket.id,
      action: parsed.action,
      actorDiscordId: actor.id,
      actorKind,
      interactionId: payload.id,
    })
    return ephemeralReply(messages.actionDone)
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('invalid_support_ticket_transition') ||
      error.message.includes('support_ticket_requester_only')
    )) {
      return ephemeralReply(messages.invalidAction)
    }
    throw error
  }
}
