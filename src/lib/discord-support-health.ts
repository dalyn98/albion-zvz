import 'server-only'

import { isDiscordId } from '@/lib/discord-id'
import {
  discordSupportMessageExists,
  getDiscordSupportChannelSnapshot,
  getDiscordSupportGuildSnapshot,
  getDiscordSupportMemberSnapshot,
  listDiscordSupportChannels,
  type DiscordSupportChannelSnapshot,
  type DiscordSupportGuildSnapshot,
  type DiscordSupportMemberSnapshot,
} from '@/lib/discord-support-rest'
import {
  OFFICIAL_SUPPORT_RESOURCE_KEYS,
  OFFICIAL_SUPPORT_RESOURCES_VERSION,
} from '@/lib/official-support-resources'
import { loadSupportTicketSettings } from '@/lib/discord-support-ticket-service'
import { getAdminClient } from '@/lib/supabase-admin'

export interface SupportHealthCheck {
  name: string
  ok: boolean
  message: string
}

export interface SupportHealthReport {
  ok: boolean
  checkedAt: string
  checks: SupportHealthCheck[]
}

const REQUIRED_PARENT_PERMISSIONS = [
  ['View Channel', 10n],
  ['Send Messages', 11n],
  ['Embed Links', 14n],
  ['Read Message History', 16n],
  ['Manage Threads', 34n],
  ['Create Private Threads', 36n],
  ['Send Messages in Threads', 38n],
] as const

function applyOverwrite(base: bigint, deny: string, allow: string): bigint {
  return (base & ~BigInt(deny)) | BigInt(allow)
}

function configuredResourceIds(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] =>
    OFFICIAL_SUPPORT_RESOURCE_KEYS.includes(entry[0] as (typeof OFFICIAL_SUPPORT_RESOURCE_KEYS)[number]) &&
    typeof entry[1] === 'string' && isDiscordId(entry[1]),
  ))
}

function missingParentPermissions(input: {
  guild: DiscordSupportGuildSnapshot
  member: DiscordSupportMemberSnapshot
  channel: DiscordSupportChannelSnapshot
  botId: string
}): string[] {
  const everyone = input.guild.roles.find((role) => role.id === input.guild.id)
  let permissions = BigInt(everyone?.permissions ?? '0')
  for (const role of input.guild.roles) {
    if (input.member.roles.includes(role.id)) permissions |= BigInt(role.permissions)
  }
  if ((permissions & (1n << 3n)) !== 0n) return []

  const overwrites = input.channel.permission_overwrites ?? []
  const everyoneOverwrite = overwrites.find((entry) => entry.type === 0 && entry.id === input.guild.id)
  if (everyoneOverwrite) {
    permissions = applyOverwrite(permissions, everyoneOverwrite.deny, everyoneOverwrite.allow)
  }
  let roleDeny = 0n
  let roleAllow = 0n
  for (const overwrite of overwrites) {
    if (overwrite.type !== 0 || !input.member.roles.includes(overwrite.id)) continue
    roleDeny |= BigInt(overwrite.deny)
    roleAllow |= BigInt(overwrite.allow)
  }
  permissions = (permissions & ~roleDeny) | roleAllow
  const memberOverwrite = overwrites.find(
    (entry) => entry.type === 1 && entry.id === input.botId,
  )
  if (memberOverwrite) {
    permissions = applyOverwrite(permissions, memberOverwrite.deny, memberOverwrite.allow)
  }
  return REQUIRED_PARENT_PERMISSIONS
    .filter(([, bit]) => (permissions & (1n << bit)) === 0n)
    .map(([name]) => name)
}

export async function inspectSupportHealth(supportGuildId: string): Promise<SupportHealthReport> {
  const checks: SupportHealthCheck[] = []
  const configuredGuildId = process.env.DISCORD_SUPPORT_GUILD_ID?.trim() ?? ''
  checks.push({
    name: 'environment',
    ok: isDiscordId(configuredGuildId) && configuredGuildId === supportGuildId,
    message: configuredGuildId === supportGuildId
      ? 'Production support guild is allow-listed.'
      : 'DISCORD_SUPPORT_GUILD_ID does not match this server.',
  })

  const settings = await loadSupportTicketSettings(supportGuildId)
  checks.push({
    name: 'database-settings',
    ok: Boolean(settings?.enabled),
    message: settings?.enabled
      ? 'Support ticket settings are enabled.'
      : 'Support ticket settings are missing or disabled.',
  })
  if (!settings) {
    return { ok: false, checkedAt: new Date().toISOString(), checks }
  }

  const guild = await getDiscordSupportGuildSnapshot(supportGuildId)
  checks.push({
    name: 'discord-guild',
    ok: Boolean(guild),
    message: guild ? `Connected to ${guild.name}.` : 'The bot cannot read this server.',
  })
  if (!guild) return { ok: false, checkedAt: new Date().toISOString(), checks }

  const resourceIds = configuredResourceIds(settings.resource_channel_ids)
  const allChannels = await listDiscordSupportChannels(supportGuildId)
  const missingResources = OFFICIAL_SUPPORT_RESOURCE_KEYS.filter((key) => {
    const id = resourceIds[key]
    return !id || !allChannels.some((channel) => channel.id === id)
  })
  checks.push({
    name: 'information-resources',
    ok: settings.resources_version === OFFICIAL_SUPPORT_RESOURCES_VERSION && missingResources.length === 0,
    message: missingResources.length > 0
      ? `${missingResources.length} information resource channel(s) are missing.`
      : settings.resources_version !== OFFICIAL_SUPPORT_RESOURCES_VERSION
        ? 'Information content must be synchronized to the current version.'
        : `${OFFICIAL_SUPPORT_RESOURCE_KEYS.length} versioned English information resources are reachable.`,
  })
  checks.push({
    name: 'server-guide',
    ok: true,
    message: guild.features?.includes('COMMUNITY')
      ? 'Welcome Screen is automated; Server Guide resource-page assignment remains a Discord UI setting.'
      : 'Information channels are ready; Discord Community is required for Welcome Screen and Server Guide.',
  })

  const channelEntries = [
    ['ticket-hub', settings.parent_channel_id],
    ['ticket-logs', settings.log_channel_id],
    ['support-queue', settings.queue_channel_id],
    ['ai-review', settings.ai_review_channel_id],
    ['security-alerts', settings.security_alert_channel_id],
    ['service-status', settings.status_channel_id],
    ['known-issues', settings.known_issues_channel_id],
  ] as const
  const channelResults = await Promise.all(channelEntries.map(async ([name, id]) => ({
    name,
    id,
    channel: id ? await getDiscordSupportChannelSnapshot(id) : null,
  })))
  for (const result of channelResults) {
    checks.push({
      name: result.name,
      ok: Boolean(result.id && result.channel),
      message: result.id && result.channel
        ? `Channel #${result.channel.name} is reachable.`
        : 'Channel is missing or not configured.',
    })
  }

  const missingStaffRoles = settings.staff_role_ids.filter(
    (roleId) => !guild.roles.some((role) => role.id === roleId),
  )
  checks.push({
    name: 'staff-roles',
    ok: missingStaffRoles.length === 0 && settings.staff_role_ids.length > 0,
    message: missingStaffRoles.length === 0
      ? `${settings.staff_role_ids.length} support role(s) are configured.`
      : `${missingStaffRoles.length} configured support role(s) are missing.`,
  })

  const botId = process.env.DISCORD_CLIENT_ID?.trim() ?? ''
  const member = isDiscordId(botId)
    ? await getDiscordSupportMemberSnapshot(supportGuildId, botId)
    : null
  const parent = channelResults.find((entry) => entry.name === 'ticket-hub')?.channel ?? null
  const missingPermissions = member && parent
    ? missingParentPermissions({ guild, member, channel: parent, botId })
    : REQUIRED_PARENT_PERMISSIONS.map(([name]) => name)
  checks.push({
    name: 'bot-permissions',
    ok: missingPermissions.length === 0,
    message: missingPermissions.length === 0
      ? 'The bot has all required ticket-thread permissions.'
      : `Missing: ${missingPermissions.join(', ')}`,
  })

  const panelExists = settings.panel_message_id
    ? await discordSupportMessageExists(settings.parent_channel_id, settings.panel_message_id)
    : false
  checks.push({
    name: 'ticket-panel',
    ok: panelExists,
    message: panelExists ? 'The ticket panel message is reachable.' : 'The ticket panel must be synchronized.',
  })

  const db = getAdminClient()
  const [ticketResult, cronResult, aiResult] = await Promise.all([
    db.from('support_tickets').select('created_at').eq('support_guild_id', supportGuildId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('cron_runs').select('job_name, status, started_at')
      .in('job_name', ['support-tickets', 'support-ai'])
      .order('started_at', { ascending: false }).limit(2),
    db.from('support_ticket_ai_analyses').select('created_at')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  checks.push({
    name: 'ticket-intake',
    ok: !ticketResult.error,
    message: ticketResult.error
      ? 'Ticket intake state could not be read.'
      : ticketResult.data
        ? `Last ticket created ${ticketResult.data.created_at}.`
        : 'Ticket intake is ready; no ticket has been created yet.',
  })
  const cronFailed = Boolean(cronResult.error) || (cronResult.data ?? []).some((run) => run.status === 'failed')
  checks.push({
    name: 'maintenance-jobs',
    ok: !cronFailed,
    message: cronResult.error
      ? 'Support cron state could not be read.'
      : cronFailed
        ? 'A recent support cron run failed.'
        : 'Recent support cron state is healthy.',
  })
  const gatewayAuthPresent = Boolean(
    process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY || process.env.VERCEL,
  )
  checks.push({
    name: 'advisory-ai',
    ok: !settings.ai_enabled || (gatewayAuthPresent && !aiResult.error),
    message: !settings.ai_enabled
      ? 'Advisory AI is disabled.'
      : gatewayAuthPresent && !aiResult.error
        ? aiResult.data
          ? `Advisory AI is configured; last analysis ${aiResult.data.created_at}.`
          : 'Advisory AI is configured; no analysis has completed yet.'
        : 'Advisory AI authentication or storage is unavailable.',
  })

  return {
    ok: checks.every((check) => check.ok),
    checkedAt: new Date().toISOString(),
    checks,
  }
}

export function formatSupportHealthReport(report: SupportHealthReport): string {
  const lines = report.checks.map((check) => `${check.ok ? '✅' : '❌'} **${check.name}** — ${check.message}`)
  return [`**Official support health — ${report.ok ? 'HEALTHY' : 'NEEDS ATTENTION'}**`, ...lines]
    .join('\n')
    .slice(0, 1900)
}
