import 'server-only'

import { isDiscordId } from '@/lib/discord-id'
import supportCommands from '@/lib/discord-support-command-catalog.mjs'
import {
  createDiscordSupportChannel,
  createDiscordSupportMessage,
  createDiscordSupportRole,
  ensureDiscordMentionSpamRule,
  getDiscordSupportGuildSnapshot,
  listDiscordSupportChannels,
  updateDiscordSupportChannel,
  updateDiscordSupportGuildSecurity,
  upsertDiscordSupportApplicationCommand,
  type DiscordSupportChannelSnapshot,
  type DiscordSupportPermissionOverwrite,
  type DiscordSupportRoleSnapshot,
} from '@/lib/discord-support-rest'
import { loadDiscordSupportMessages } from '@/lib/discord-support-ticket-messages'
import { publishSupportTicketPanel } from '@/lib/discord-support-ticket-service'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'

const bit = (position: bigint) => 1n << position
const VIEW = bit(10n)
const MANAGE_CHANNELS = bit(4n)
const SEND = bit(11n)
const MANAGE_MESSAGES = bit(13n)
const EMBED = bit(14n)
const READ_HISTORY = bit(16n)
const USE_COMMANDS = bit(31n)
const MANAGE_THREADS = bit(34n)
const CREATE_PUBLIC_THREADS = bit(35n)
const CREATE_PRIVATE_THREADS = bit(36n)
const SEND_IN_THREADS = bit(38n)

const STAFF_ALLOW = VIEW | SEND | MANAGE_MESSAGES | EMBED | READ_HISTORY |
  USE_COMMANDS | MANAGE_THREADS | CREATE_PUBLIC_THREADS | CREATE_PRIVATE_THREADS | SEND_IN_THREADS
const BOT_ALLOW = STAFF_ALLOW | MANAGE_CHANNELS

function overwrite(id: string, type: 0 | 1, allow: bigint, deny = 0n): DiscordSupportPermissionOverwrite {
  return { id, type, allow: allow.toString(), deny: deny.toString() }
}

function publicReadOnlyPermissions(
  guildId: string,
  botId: string,
  staffRoleIds: string[],
): DiscordSupportPermissionOverwrite[] {
  const deny = SEND | CREATE_PUBLIC_THREADS | CREATE_PRIVATE_THREADS | SEND_IN_THREADS
  return [
    overwrite(guildId, 0, VIEW | READ_HISTORY | USE_COMMANDS, deny),
    ...staffRoleIds.map((id) => overwrite(id, 0, STAFF_ALLOW)),
    overwrite(botId, 1, BOT_ALLOW),
  ]
}

function ticketHubPermissions(
  guildId: string,
  botId: string,
  staffRoleIds: string[],
): DiscordSupportPermissionOverwrite[] {
  return [
    overwrite(
      guildId,
      0,
      VIEW | READ_HISTORY | USE_COMMANDS | SEND_IN_THREADS,
      SEND | CREATE_PUBLIC_THREADS | CREATE_PRIVATE_THREADS,
    ),
    ...staffRoleIds.map((id) => overwrite(id, 0, STAFF_ALLOW)),
    overwrite(botId, 1, BOT_ALLOW),
  ]
}

function privateStaffPermissions(
  guildId: string,
  botId: string,
  staffRoleIds: string[],
): DiscordSupportPermissionOverwrite[] {
  return [
    overwrite(guildId, 0, 0n, VIEW),
    ...staffRoleIds.map((id) => overwrite(id, 0, STAFF_ALLOW)),
    overwrite(botId, 1, BOT_ALLOW),
  ]
}

function firstSuperAdminId(existing: string | null): string {
  if (existing && isDiscordId(existing)) return existing
  const id = (process.env.SUPER_ADMIN_DISCORD_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .find(isDiscordId)
  if (!id) throw new Error('No valid super-admin Discord id is configured')
  return id
}

async function ensureRole(input: {
  guildId: string
  roles: DiscordSupportRoleSnapshot[]
  name: string
  color: number
}): Promise<DiscordSupportRoleSnapshot> {
  const existing = input.roles.find((role) => role.name === input.name)
  if (existing) return existing
  const created = await createDiscordSupportRole({
    guildId: input.guildId,
    name: input.name,
    color: input.color,
    auditReason: `Official support role ${input.name}`,
  })
  input.roles.push(created)
  return created
}

async function ensureChannel(input: {
  guildId: string
  channels: DiscordSupportChannelSnapshot[]
  name: string
  type: 0 | 4 | 15
  parentId?: string | null
  topic?: string | null
  permissions?: DiscordSupportPermissionOverwrite[]
  position?: number
}): Promise<{ channel: DiscordSupportChannelSnapshot; created: boolean }> {
  let channel = input.channels.find((candidate) =>
    candidate.name === input.name && candidate.type === input.type,
  )
  if (!channel) {
    channel = await createDiscordSupportChannel({
      guildId: input.guildId,
      name: input.name,
      type: input.type,
      parentId: input.parentId,
      topic: input.topic,
      position: input.position,
      permissionOverwrites: input.permissions,
      auditReason: `Official support channel ${input.name}`,
    })
    input.channels.push(channel)
    return { channel, created: true }
  }
  const normalizedOverwrites = (values: DiscordSupportPermissionOverwrite[] | undefined) =>
    JSON.stringify((values ?? []).map((value) => ({
      id: value.id,
      type: value.type,
      allow: value.allow,
      deny: value.deny,
    })).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)))
  const needsUpdate =
    channel.parent_id !== (input.parentId ?? null) ||
    (input.type !== 4 && (channel.topic ?? null) !== (input.topic ?? null)) ||
    (input.permissions !== undefined &&
      normalizedOverwrites(channel.permission_overwrites) !== normalizedOverwrites(input.permissions))
  if (needsUpdate) {
    await updateDiscordSupportChannel({
      channelId: channel.id,
      parentId: input.parentId,
      topic: input.type === 4 ? undefined : input.topic,
      position: input.position,
      permissionOverwrites: input.permissions,
      auditReason: `Synchronize official support channel ${input.name}`,
    })
  }
  return { channel, created: false }
}

async function seedChannel(channelId: string, content: string): Promise<void> {
  await createDiscordSupportMessage(channelId, {
    content,
    allowed_mentions: { parse: [] },
  })
}

export async function ensureOfficialSupportServer(): Promise<{
  createdChannels: string[]
  createdRoles: string[]
  securityBaseline: boolean
  automod: boolean
  commandRegistered: boolean
  panelMessageId: string
}> {
  const guildId = process.env.DISCORD_SUPPORT_GUILD_ID?.trim() ?? ''
  const botId = process.env.DISCORD_CLIENT_ID?.trim() ?? ''
  if (!isDiscordId(guildId) || !isDiscordId(botId)) {
    throw new Error('Official support Discord environment is incomplete')
  }
  const db = getAdminClient()
  const settingsQuery = await db.from('support_ticket_settings')
    .select('updated_by_discord_id, staff_role_ids')
    .eq('support_guild_id', guildId)
    .maybeSingle()
  if (settingsQuery.error) throw new Error(settingsQuery.error.message)
  const actorDiscordId = firstSuperAdminId(settingsQuery.data?.updated_by_discord_id ?? null)
  const [guild, channels] = await Promise.all([
    getDiscordSupportGuildSnapshot(guildId),
    listDiscordSupportChannels(guildId),
  ])
  if (!guild) throw new Error('Official support Discord server is unavailable')
  const originalRoleNames = new Set(guild.roles.map((role) => role.name))
  let staffRoles: DiscordSupportRoleSnapshot[]
  try {
    staffRoles = [
      await ensureRole({ guildId, roles: guild.roles, name: 'Support Team', color: 0x5865f2 }),
      await ensureRole({ guildId, roles: guild.roles, name: 'Support Lead', color: 0x57f287 }),
      await ensureRole({ guildId, roles: guild.roles, name: 'Incident Manager', color: 0xfee75c }),
    ]
  } catch (error) {
    const configuredRoleIds = Array.isArray(settingsQuery.data?.staff_role_ids)
      ? settingsQuery.data.staff_role_ids.filter((value): value is string =>
        typeof value === 'string' && isDiscordId(value),
      )
      : []
    staffRoles = guild.roles.filter((role) => configuredRoleIds.includes(role.id))
    if (staffRoles.length === 0) throw error
    log.warn('[discord-support] role creation unavailable; reusing configured staff roles', {
      role_count: staffRoles.length,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  const staffRoleIds = staffRoles.map((role) => role.id)
  const createdRoles = staffRoles
    .filter((role) => !originalRoleNames.has(role.name))
    .map((role) => role.name)

  const information = await ensureChannel({ guildId, channels, name: 'INFORMATION', type: 4, position: 0 })
  const support = await ensureChannel({ guildId, channels, name: 'SUPPORT', type: 4, position: 1 })
  const staff = await ensureChannel({ guildId, channels, name: 'SUPPORT TEAM', type: 4, position: 2 })
  const publicPermissions = publicReadOnlyPermissions(guildId, botId, staffRoleIds)
  const staffPermissions = privateStaffPermissions(guildId, botId, staffRoleIds)
  const ticketPermissions = ticketHubPermissions(guildId, botId, staffRoleIds)
  const createdChannels: string[] = []

  const welcome = await ensureChannel({
    guildId, channels, name: 'welcome-and-rules', type: 0, parentId: information.channel.id,
    position: 0, permissions: publicPermissions,
    topic: 'Official support scope, response targets, privacy notice, and server rules.',
  })
  const announcements = await ensureChannel({
    guildId, channels, name: 'announcements', type: 0, parentId: information.channel.id,
    position: 1, permissions: publicPermissions, topic: 'Official product and support announcements.',
  })
  const serviceStatus = await ensureChannel({
    guildId, channels, name: 'service-status', type: 0, parentId: information.channel.id,
    position: 2, permissions: publicPermissions, topic: 'Human-authored incident and recovery updates.',
  })
  const faq = await ensureChannel({
    guildId, channels, name: 'faq', type: 0, parentId: information.channel.id,
    position: 3, permissions: publicPermissions, topic: 'Canonical answers maintained by the support team.',
  })
  const knownIssues = await ensureChannel({
    guildId, channels, name: 'known-issues', type: 15, parentId: information.channel.id,
    position: 4, permissions: publicPermissions, topic: 'Staff-confirmed known issues and their status.',
  })
  const ticketHub = await ensureChannel({
    guildId, channels, name: 'create-a-ticket', type: 0, parentId: support.channel.id,
    position: 0, permissions: ticketPermissions,
    topic: 'Create one private support ticket. Never share passwords, recovery codes, payment details, API keys, or bot tokens.',
  })
  const queue = await ensureChannel({
    guildId, channels, name: 'support-queue', type: 0, parentId: staff.channel.id,
    position: 0, permissions: staffPermissions, topic: 'New, unassigned, and escalated ticket activity.',
  })
  const logs = await ensureChannel({
    guildId, channels, name: 'ticket-logs', type: 0, parentId: staff.channel.id,
    position: 1, permissions: staffPermissions, topic: 'Append-only support workflow audit notifications.',
  })
  const aiReview = await ensureChannel({
    guildId, channels, name: 'ai-review', type: 0, parentId: staff.channel.id,
    position: 2, permissions: staffPermissions,
    topic: 'Staff-only AI classifications and summaries. Advisory only; never requester-facing.',
  })
  const securityAlerts = await ensureChannel({
    guildId, channels, name: 'security-alerts', type: 0, parentId: staff.channel.id,
    position: 3, permissions: staffPermissions, topic: 'Credential exposure, security risk, and anti-spam alerts.',
  })
  const staffChat = await ensureChannel({
    guildId, channels, name: 'staff-chat', type: 0, parentId: staff.channel.id,
    position: 4, permissions: staffPermissions, topic: 'Private coordination for human support staff.',
  })
  for (const entry of [welcome, announcements, serviceStatus, faq, knownIssues, ticketHub, queue, logs, aiReview, securityAlerts, staffChat]) {
    if (entry.created) createdChannels.push(entry.channel.name)
  }

  if (welcome.created) {
    await seedChannel(welcome.channel.id, [
      '**Welcome to Albion Guild Manager Official Support**',
      'Support is provided by human staff in English. AI may classify and summarize a ticket for staff, but it never replies to you or makes account, billing, or enforcement decisions.',
      'Support hours: Monday-Friday, 01:00-10:00 UTC. Normal target: one business day. Urgent security or widespread outage reports are escalated during support hours.',
      'Never share passwords, recovery codes, payment details, API keys, or Discord bot tokens.',
      'Be respectful, do not spam, and use one active ticket at a time.',
    ].join('\n\n'))
  }
  if (serviceStatus.created) {
    await seedChannel(serviceStatus.channel.id, '**Service status**\nNo active staff-confirmed incident is posted at this time.')
  }
  if (faq.created) {
    await seedChannel(faq.channel.id, '**Frequently asked questions**\nUse the ticket panel for account, bot setup, battle data, regear and shop, billing, or bug support. Known product incidents are tracked in #known-issues.')
  }
  if (queue.created) await seedChannel(queue.channel.id, '**Support queue ready**\nTicket activity is posted here. Assign and prioritize tickets only after human review.')
  if (aiReview.created) await seedChannel(aiReview.channel.id, '**AI review boundary**\nThis channel is staff-only. AI output is advisory and must never be copied to a requester as an automated answer.')
  if (securityAlerts.created) await seedChannel(securityAlerts.channel.id, '**Security alerts ready**\nReview every alert manually. Do not paste exposed credentials into staff chat or logs.')

  const upsert = await db.from('support_ticket_settings').upsert({
    support_guild_id: guildId,
    parent_channel_id: ticketHub.channel.id,
    log_channel_id: logs.channel.id,
    queue_channel_id: queue.channel.id,
    ai_review_channel_id: aiReview.channel.id,
    security_alert_channel_id: securityAlerts.channel.id,
    status_channel_id: serviceStatus.channel.id,
    known_issues_channel_id: knownIssues.channel.id,
    staff_role_ids: staffRoleIds,
    support_hours: 'Monday-Friday, 01:00-10:00 UTC',
    ai_enabled: true,
    ai_shadow_mode: true,
    enabled: true,
    updated_by_discord_id: actorDiscordId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'support_guild_id' })
  if (upsert.error) throw new Error(upsert.error.message)

  const messages = await loadDiscordSupportMessages('en')
  const panelMessageId = await publishSupportTicketPanel({
    supportGuildId: guildId,
    actorDiscordId,
    messages,
  })
  await upsertDiscordSupportApplicationCommand({
    applicationId: botId,
    guildId,
    command: supportCommands[0] as Record<string, unknown>,
  })

  let securityBaseline = false
  try {
    await updateDiscordSupportGuildSecurity({
      guildId,
      safetyAlertsChannelId: guild.features?.includes('COMMUNITY') ? securityAlerts.channel.id : undefined,
    })
    securityBaseline = true
  } catch (error) {
    log.warn('[discord-support] guild security baseline could not be applied', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  let automod = false
  try {
    await ensureDiscordMentionSpamRule({
      guildId,
      alertChannelId: securityAlerts.channel.id,
      exemptRoleIds: staffRoleIds,
    })
    automod = true
  } catch (error) {
    log.warn('[discord-support] AutoMod baseline could not be applied', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return {
    createdChannels,
    createdRoles,
    securityBaseline,
    automod,
    commandRegistered: true,
    panelMessageId,
  }
}
