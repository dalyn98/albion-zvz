import 'server-only'

import { getAppSetting } from '@/lib/app-settings'
import {
  addDiscordGuildMemberRole,
  removeDiscordGuildMemberRole,
  type DiscordChannelPayload,
} from '@/lib/discord'
import {
  ephemeralReply,
  INTERACTION_TYPE_MESSAGE_COMPONENT,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'
import { type Locale } from '@/i18n/locales'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'

const CUSTOM_ID_PREFIX = 'agm_role:v1'
const DISCORD_SNOWFLAKE_PATTERN = /^[0-9]{17,20}$/
const MAX_PANEL_ROLES = 20
const MAX_BUTTONS_PER_ROW = 5
const PANEL_COLOR = 0x5865f2

type DiscordSelfRoleButtonStyle = 1 | 2 | 3 | 4

export interface DiscordSelfRolePanelRole {
  id: string
  label: string
  style: DiscordSelfRoleButtonStyle
}

export interface DiscordSelfRolePanelConfig {
  channelId: string
  title: string
  description: string
  resetLabel: string
  roles: DiscordSelfRolePanelRole[]
}

export type DiscordSelfRolePanelAction =
  | { kind: 'add'; roleId: string }
  | { kind: 'reset' }

interface DiscordSelfRolePanelMessages {
  unsupported: string
  notAvailable: string
  granted: string
  reset: string
  operationFailed: string
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isDiscordSelfRoleButtonStyle(value: unknown): value is DiscordSelfRoleButtonStyle {
  return value === 1 || value === 2 || value === 3 || value === 4
}

function parseRole(value: unknown): DiscordSelfRolePanelRole | null {
  if (!isPlainObject(value)) return null
  if (typeof value.id !== 'string' || !DISCORD_SNOWFLAKE_PATTERN.test(value.id)) return null
  if (!isBoundedString(value.label, 80)) return null
  if (value.style !== undefined && !isDiscordSelfRoleButtonStyle(value.style)) return null
  return { id: value.id, label: value.label.trim(), style: value.style ?? 1 }
}

export function parseDiscordSelfRolePanelConfig(raw: string): DiscordSelfRolePanelConfig | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPlainObject(value)) return null
  if (typeof value.channelId !== 'string' || !DISCORD_SNOWFLAKE_PATTERN.test(value.channelId)) {
    return null
  }
  if (!isBoundedString(value.title, 256)) return null
  if (!isBoundedString(value.description, 4_096)) return null
  if (!isBoundedString(value.resetLabel, 80)) return null
  if (!Array.isArray(value.roles) || value.roles.length < 1 || value.roles.length > MAX_PANEL_ROLES) {
    return null
  }

  const roles = value.roles.map(parseRole)
  if (roles.some((role) => role === null)) return null
  const validRoles = roles.filter((role): role is DiscordSelfRolePanelRole => role !== null)
  if (new Set(validRoles.map((role) => role.id)).size !== validRoles.length) return null

  return {
    channelId: value.channelId,
    title: value.title.trim(),
    description: value.description.trim(),
    resetLabel: value.resetLabel.trim(),
    roles: validRoles,
  }
}

export function buildDiscordSelfRolePanelCustomId(action: DiscordSelfRolePanelAction): string {
  if (action.kind === 'reset') return `${CUSTOM_ID_PREFIX}:reset`
  if (!DISCORD_SNOWFLAKE_PATTERN.test(action.roleId)) {
    throw new Error('Invalid Discord role ID')
  }
  return `${CUSTOM_ID_PREFIX}:add:${action.roleId}`
}

export function parseDiscordSelfRolePanelCustomId(
  customId: string | null | undefined,
): DiscordSelfRolePanelAction | null {
  if (!customId) return null
  if (customId === `${CUSTOM_ID_PREFIX}:reset`) return { kind: 'reset' }
  const prefix = `${CUSTOM_ID_PREFIX}:add:`
  if (!customId.startsWith(prefix)) return null
  const roleId = customId.slice(prefix.length)
  if (!DISCORD_SNOWFLAKE_PATTERN.test(roleId)) return null
  return { kind: 'add', roleId }
}

export function isDiscordSelfRolePanelCustomId(customId: string | null | undefined): boolean {
  return parseDiscordSelfRolePanelCustomId(customId) !== null
}

export function buildDiscordSelfRolePanelPayload(
  config: DiscordSelfRolePanelConfig,
): DiscordChannelPayload {
  const roleButtons = config.roles.map((role) => ({
    type: 2 as const,
    style: role.style,
    label: role.label,
    custom_id: buildDiscordSelfRolePanelCustomId({ kind: 'add', roleId: role.id }),
  }))
  const rows = Array.from(
    { length: Math.ceil(roleButtons.length / MAX_BUTTONS_PER_ROW) },
    (_, index) => ({
      type: 1 as const,
      components: roleButtons.slice(
        index * MAX_BUTTONS_PER_ROW,
        (index + 1) * MAX_BUTTONS_PER_ROW,
      ),
    }),
  )
  const resetButton = {
    type: 2 as const,
    style: 4 as const,
    label: config.resetLabel,
    custom_id: buildDiscordSelfRolePanelCustomId({ kind: 'reset' }),
  }
  const lastRow = rows.at(-1)
  const components = lastRow && lastRow.components.length < MAX_BUTTONS_PER_ROW
    ? [
        ...rows.slice(0, -1),
        { ...lastRow, components: [...lastRow.components, resetButton] },
      ]
    : [...rows, { type: 1 as const, components: [resetButton] }]

  return {
    embeds: [{
      title: config.title,
      description: config.description,
      color: PANEL_COLOR,
    }],
    components,
    allowed_mentions: { parse: [] },
  }
}

function resolveLocale(locale: string | null | undefined): Locale {
  const language = locale?.toLowerCase().split('-')[0]
  if (language === 'ko' || language === 'ja' || language === 'en' || language === 'zh') {
    return language
  }
  return 'en'
}

async function loadMessages(locale: Locale): Promise<DiscordSelfRolePanelMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const ns = (dict.discordSelfRolePanel ?? {}) as Record<string, string>
  return {
    unsupported: ns.unsupported ?? 'This role button is not supported.',
    notAvailable: ns.notAvailable ?? 'This role panel is not available in this channel.',
    granted: ns.granted ?? 'Granted the **{role}** role.',
    reset: ns.reset ?? 'Removed all roles selected from this panel.',
    operationFailed: ns.operationFailed ?? 'Could not update your roles. Check the bot permissions.',
  }
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

async function findActiveTenantId(discordGuildId: string): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('tenants')
    .select('id')
    .eq('discord_guild_id', discordGuildId)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    log.error('[discord-self-role-panel] tenant lookup failed', error, {
      discord_guild_id: discordGuildId,
    })
    return null
  }
  return typeof data?.id === 'string' ? data.id : null
}

export async function handleDiscordSelfRolePanelInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const messages = await loadMessages(resolveLocale(payload.locale))
  if (
    payload.type !== INTERACTION_TYPE_MESSAGE_COMPONENT ||
    payload.data?.component_type !== 2
  ) {
    return ephemeralReply(messages.unsupported)
  }
  const action = parseDiscordSelfRolePanelCustomId(payload.data?.custom_id)
  if (!action) return ephemeralReply(messages.unsupported)

  const discordGuildId = payload.guild_id
  const discordUserId = payload.member?.user?.id
  if (!discordGuildId || !payload.channel_id || !discordUserId) {
    return ephemeralReply(messages.notAvailable)
  }

  const tenantId = await findActiveTenantId(discordGuildId)
  if (!tenantId) return ephemeralReply(messages.notAvailable)
  const rawConfig = await getAppSetting('discord_self_role_panel_config', '', tenantId)
  const config = parseDiscordSelfRolePanelConfig(rawConfig)
  if (!config || config.channelId !== payload.channel_id) {
    return ephemeralReply(messages.notAvailable)
  }

  try {
    if (action.kind === 'add') {
      const role = config.roles.find((candidate) => candidate.id === action.roleId)
      if (!role) return ephemeralReply(messages.notAvailable)
      await addDiscordGuildMemberRole({
        discordGuildId,
        discordUserId,
        discordRoleId: role.id,
        auditLogReason: `Self-role panel grant requested by ${discordUserId}`,
      })
      return ephemeralReply(format(messages.granted, { role: role.label }))
    }

    await Promise.all(config.roles.map((role) => removeDiscordGuildMemberRole({
      discordGuildId,
      discordUserId,
      discordRoleId: role.id,
      auditLogReason: `Self-role panel reset requested by ${discordUserId}`,
    })))
    return ephemeralReply(messages.reset)
  } catch (error) {
    log.error('[discord-self-role-panel] role update failed', error, {
      tenant_id: tenantId,
      discord_guild_id: discordGuildId,
      discord_user_id: discordUserId,
      action: action.kind,
      role_id: action.kind === 'add' ? action.roleId : null,
    })
    return ephemeralReply(messages.operationFailed)
  }
}
