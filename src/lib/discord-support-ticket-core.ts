import type {
  DiscordMessageComponent,
  DiscordModalActionRowComponent,
} from '@/lib/discord-interactions'
import type { DiscordChannelPayload } from '@/lib/discord'
import { isDiscordId } from '@/lib/discord-id'

export const SUPPORT_TICKET_CATEGORIES = [
  'account',
  'bot',
  'battle',
  'regear_shop',
  'billing',
  'bug',
  'other',
] as const

export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number]
export type SupportTicketAction =
  | 'assign'
  | 'unassign'
  | 'wait'
  | 'resolve'
  | 'continue'
  | 'close_requester'
  | 'close_staff'
  | 'reopen'

export type SupportTicketStatus =
  | 'provisioning'
  | 'open'
  | 'in_progress'
  | 'waiting_requester'
  | 'resolved'
  | 'closed'
  | 'provision_failed'

export interface SupportTicketRow {
  id: string
  ticket_number: number | string
  support_guild_id: string
  opener_discord_id: string
  opener_name_snapshot: string
  opener_locale: string
  related_tenant_id: string | null
  related_guild_hint: string | null
  category: SupportTicketCategory
  subject: string
  description: string
  status: SupportTicketStatus
  priority: 'normal' | 'high' | 'urgent'
  assignee_discord_id: string | null
  thread_id: string | null
  header_message_id: string | null
  create_interaction_id: string
  discord_sync_status: 'pending' | 'synced' | 'failed'
  discord_sync_attempts: number
  discord_sync_error: string | null
  assigned_at: string | null
  resolved_at: string | null
  closed_at: string | null
  last_reminded_at: string | null
  thread_deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface SupportTicketSettingsRow {
  support_guild_id: string
  parent_channel_id: string
  log_channel_id: string | null
  panel_message_id: string | null
  staff_role_ids: string[]
  enabled: boolean
  waiting_reminder_hours: number
  auto_close_hours: number
  retention_days: number
  updated_by_discord_id: string
}

export interface DiscordSupportMessages {
  unavailable: string
  adminOnly: string
  staffOnly: string
  setupSaved: string
  setupMissing: string
  panelTitle: string
  panelBody: string
  panelButton: string
  categoryPrompt: string
  modalTitle: string
  subjectLabel: string
  subjectPlaceholder: string
  descriptionLabel: string
  descriptionPlaceholder: string
  guildHintLabel: string
  guildHintPlaceholder: string
  invalidInput: string
  createFailed: string
  created: string
  existing: string
  ticketTitle: string
  requester: string
  category: string
  relatedGuild: string
  status: string
  assignee: string
  unassigned: string
  initialRequest: string
  actionDone: string
  invalidAction: string
  ticketNotFound: string
  ticketDeleted: string
  assignButton: string
  unassignButton: string
  waitButton: string
  resolveButton: string
  closeButton: string
  solvedButton: string
  continueButton: string
  reminder: string
  autoClosed: string
  reopened: string
  categoryAccount: string
  categoryBot: string
  categoryBattle: string
  categoryRegearShop: string
  categoryBilling: string
  categoryBug: string
  categoryOther: string
  statusProvisioning: string
  statusOpen: string
  statusInProgress: string
  statusWaitingRequester: string
  statusResolved: string
  statusClosed: string
  statusProvisionFailed: string
}

const PREFIX = 'support-ticket:v1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g

export type ParsedSupportCustomId =
  | { kind: 'create' }
  | { kind: 'category_picker' }
  | { kind: 'category'; category: SupportTicketCategory }
  | { kind: 'modal'; category: SupportTicketCategory }
  | { kind: 'action'; action: SupportTicketAction; ticketId: string }

export function supportGuildId(): string | null {
  const value = process.env.DISCORD_SUPPORT_GUILD_ID?.trim() ?? ''
  return isDiscordId(value) ? value : null
}

export function isSupportGuild(discordGuildId: string | null | undefined): boolean {
  const configured = supportGuildId()
  return !!configured && discordGuildId === configured
}

export function supportCreateCustomId(): string {
  return `${PREFIX}:create`
}

export function supportCategoryCustomId(category: SupportTicketCategory): string {
  return `${PREFIX}:category:${category}`
}

export function supportModalCustomId(category: SupportTicketCategory): string {
  return `${PREFIX}:modal:${category}`
}

export function supportActionCustomId(action: SupportTicketAction, ticketId: string): string {
  return `${PREFIX}:action:${action}:${ticketId}`
}

export function parseSupportCustomId(value: unknown): ParsedSupportCustomId | null {
  if (typeof value !== 'string' || !value.startsWith(`${PREFIX}:`)) return null
  const parts = value.split(':')
  const kind = parts[2]
  if (kind === 'create' && parts.length === 3) return { kind: 'create' }
  if (kind === 'category-picker' && parts.length === 3) return { kind: 'category_picker' }
  if ((kind === 'category' || kind === 'modal') && parts.length === 4) {
    const category = parts[3]
    if (SUPPORT_TICKET_CATEGORIES.includes(category as SupportTicketCategory)) {
      return { kind, category: category as SupportTicketCategory }
    }
  }
  if (kind === 'action' && parts.length === 5 && UUID_PATTERN.test(parts[4] ?? '')) {
    const action = parts[3] as SupportTicketAction
    if ([
      'assign', 'unassign', 'wait', 'resolve', 'continue',
      'close_requester', 'close_staff', 'reopen',
    ].includes(action)) {
      return { kind: 'action', action, ticketId: parts[4] }
    }
  }
  return null
}

export function isDiscordSupportTicketCustomId(value: unknown): boolean {
  return parseSupportCustomId(value) !== null
}

function clean(value: string, maxLength: number, multiline = false): string {
  const withoutControls = value.replace(CONTROL_CHARACTERS, '')
  const normalized = multiline
    ? withoutControls.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
    : withoutControls.replace(/\s+/g, ' ').trim()
  return normalized.slice(0, maxLength)
}

export function normalizeSupportTicketInput(input: {
  subject: string
  description: string
  guildHint: string
}): { subject: string; description: string; guildHint: string | null } | null {
  const subject = clean(input.subject, 100)
  const description = clean(input.description, 1500, true)
  const guildHint = clean(input.guildHint, 100)
  if (!subject || !description) return null
  return { subject, description, guildHint: guildHint || null }
}

export function formatSupportTicketNumber(value: number | string): string {
  const numeric = Number(value)
  return `T-${Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric).padStart(6, '0') : '??????'}`
}

export function parseSupportTicketNumber(value: string): number | null {
  const match = value.trim().toUpperCase().match(/^(?:T-)?(\d{1,12})$/)
  if (!match) return null
  const number = Number(match[1])
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

export function categoryLabel(category: SupportTicketCategory, messages: DiscordSupportMessages): string {
  return {
    account: messages.categoryAccount,
    bot: messages.categoryBot,
    battle: messages.categoryBattle,
    regear_shop: messages.categoryRegearShop,
    billing: messages.categoryBilling,
    bug: messages.categoryBug,
    other: messages.categoryOther,
  }[category]
}

export function statusLabel(status: SupportTicketStatus, messages: DiscordSupportMessages): string {
  return {
    provisioning: messages.statusProvisioning,
    open: messages.statusOpen,
    in_progress: messages.statusInProgress,
    waiting_requester: messages.statusWaitingRequester,
    resolved: messages.statusResolved,
    closed: messages.statusClosed,
    provision_failed: messages.statusProvisionFailed,
  }[status]
}

export function buildSupportPanelPayload(messages: DiscordSupportMessages): DiscordChannelPayload {
  return {
    embeds: [{ title: messages.panelTitle, description: messages.panelBody, color: 0x5865f2 }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        style: 1,
        label: messages.panelButton,
        custom_id: supportCreateCustomId(),
      }],
    }],
    allowed_mentions: { parse: [] },
  }
}

export function buildCategoryPicker(messages: DiscordSupportMessages): DiscordMessageComponent[] {
  return [{
    type: 1,
    components: [{
      type: 3,
      custom_id: `${PREFIX}:category-picker`,
      placeholder: messages.categoryPrompt,
      min_values: 1,
      max_values: 1,
      options: SUPPORT_TICKET_CATEGORIES.map((category) => ({
        label: categoryLabel(category, messages),
        value: supportCategoryCustomId(category),
      })),
    }],
  }]
}

export function parseSelectedCategory(values: unknown): SupportTicketCategory | null {
  if (!Array.isArray(values) || values.length !== 1) return null
  const parsed = parseSupportCustomId(values[0])
  return parsed?.kind === 'category' ? parsed.category : null
}

export function buildTicketModal(
  category: SupportTicketCategory,
  messages: DiscordSupportMessages,
): DiscordModalActionRowComponent[] {
  return [
    { type: 1, components: [{ type: 4, custom_id: 'subject', style: 1, label: messages.subjectLabel, placeholder: messages.subjectPlaceholder, min_length: 1, max_length: 100, required: true }] },
    { type: 1, components: [{ type: 4, custom_id: 'description', style: 2, label: messages.descriptionLabel, placeholder: messages.descriptionPlaceholder, min_length: 1, max_length: 1500, required: true }] },
    { type: 1, components: [{ type: 4, custom_id: 'guild_hint', style: 1, label: messages.guildHintLabel, placeholder: messages.guildHintPlaceholder, max_length: 100, required: false }] },
  ]
}

export function buildTicketActionComponents(
  ticket: SupportTicketRow,
  messages: DiscordSupportMessages,
): DiscordMessageComponent[] {
  if (ticket.status === 'closed' || ticket.status === 'provision_failed') return []
  if (ticket.status === 'resolved') {
    return [{ type: 1, components: [
      { type: 2, style: 3, label: messages.solvedButton, custom_id: supportActionCustomId('close_requester', ticket.id) },
      { type: 2, style: 1, label: messages.continueButton, custom_id: supportActionCustomId('continue', ticket.id) },
      { type: 2, style: 4, label: messages.closeButton, custom_id: supportActionCustomId('close_staff', ticket.id) },
    ] }]
  }
  return [{ type: 1, components: [
    ticket.assignee_discord_id
      ? { type: 2, style: 2, label: messages.unassignButton, custom_id: supportActionCustomId('unassign', ticket.id) }
      : { type: 2, style: 1, label: messages.assignButton, custom_id: supportActionCustomId('assign', ticket.id) },
    { type: 2, style: 2, label: messages.waitButton, custom_id: supportActionCustomId('wait', ticket.id) },
    { type: 2, style: 3, label: messages.resolveButton, custom_id: supportActionCustomId('resolve', ticket.id) },
    { type: 2, style: 4, label: messages.closeButton, custom_id: supportActionCustomId('close_staff', ticket.id) },
  ] }]
}

export function buildTicketHeaderPayload(
  ticket: SupportTicketRow,
  messages: DiscordSupportMessages,
): DiscordChannelPayload {
  const number = formatSupportTicketNumber(ticket.ticket_number)
  const lines = [
    `**${messages.requester}** <@${ticket.opener_discord_id}>`,
    `**${messages.category}** ${categoryLabel(ticket.category, messages)}`,
    `**${messages.relatedGuild}** ${ticket.related_guild_hint ?? '-'}`,
    `**${messages.status}** ${statusLabel(ticket.status, messages)}`,
    `**${messages.assignee}** ${ticket.assignee_discord_id ? `<@${ticket.assignee_discord_id}>` : messages.unassigned}`,
    '',
    `**${messages.initialRequest}**`,
    ticket.description,
  ]
  return {
    embeds: [{
      title: messages.ticketTitle.replace('{ticket}', number).replace('{subject}', ticket.subject),
      description: lines.join('\n').slice(0, 4096),
      color: ticket.status === 'closed' ? 0x747f8d : ticket.status === 'resolved' ? 0x57f287 : 0x5865f2,
    }],
    components: buildTicketActionComponents(ticket, messages),
    allowed_mentions: { parse: [] },
  }
}
