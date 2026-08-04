import 'server-only'

import type { DiscordChannelPayload } from '@/lib/discord'
import { isDiscordId } from '@/lib/discord-id'
import supportCommands from '@/lib/discord-support-command-catalog.mjs'
import {
  createDiscordSupportChannel,
  createDiscordSupportMessage,
  createDiscordSupportRole,
  DiscordSupportRestError,
  ensureDiscordMentionSpamRule,
  getDiscordSupportGuildSnapshot,
  listDiscordSupportChannels,
  updateDiscordSupportChannel,
  updateDiscordSupportGuildSecurity,
  updateDiscordSupportMessage,
  updateDiscordSupportWelcomeScreen,
  upsertDiscordSupportApplicationCommand,
  type DiscordSupportChannelSnapshot,
  type DiscordSupportPermissionOverwrite,
  type DiscordSupportRoleSnapshot,
} from '@/lib/discord-support-rest'
import {
  buildOfficialSupportResourceContent,
  OFFICIAL_SUPPORT_RESOURCE_KEYS,
  OFFICIAL_SUPPORT_RESOURCE_SPECS,
  OFFICIAL_SUPPORT_RESOURCES_VERSION,
  type OfficialSupportResourceChannelIds,
  type OfficialSupportResourceKey,
} from '@/lib/official-support-resources'
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
  aliases?: string[]
  type: 0 | 4 | 15
  parentId?: string | null
  topic?: string | null
  permissions?: DiscordSupportPermissionOverwrite[]
  position?: number
}): Promise<{ channel: DiscordSupportChannelSnapshot; created: boolean; renamed: boolean }> {
  let channel = input.channels.find((candidate) =>
    candidate.name === input.name && candidate.type === input.type,
  )
  let renamed = false
  if (!channel && input.aliases?.length) {
    channel = input.channels.find((candidate) =>
      input.aliases?.includes(candidate.name) && candidate.type === input.type,
    )
    renamed = Boolean(channel)
  }
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
    return { channel, created: true, renamed: false }
  }
  const normalizedOverwrites = (values: DiscordSupportPermissionOverwrite[] | undefined) =>
    JSON.stringify((values ?? []).map((value) => ({
      id: value.id,
      type: value.type,
      allow: value.allow,
      deny: value.deny,
    })).sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)))
  const needsUpdate =
    channel.name !== input.name ||
    channel.parent_id !== (input.parentId ?? null) ||
    (input.position !== undefined && channel.position !== input.position) ||
    (input.type !== 4 && (channel.topic ?? null) !== (input.topic ?? null)) ||
    (input.permissions !== undefined &&
      normalizedOverwrites(channel.permission_overwrites) !== normalizedOverwrites(input.permissions))
  if (needsUpdate) {
    await updateDiscordSupportChannel({
      channelId: channel.id,
      name: channel.name !== input.name ? input.name : undefined,
      parentId: input.parentId,
      topic: input.type === 4 ? undefined : input.topic,
      position: input.position,
      permissionOverwrites: input.permissions,
      auditReason: `Synchronize official support channel ${input.name}`,
    })
    channel = {
      ...channel,
      name: input.name,
      parent_id: input.parentId ?? null,
      ...(input.type === 4 ? {} : { topic: input.topic ?? null }),
      ...(input.permissions ? { permission_overwrites: input.permissions } : {}),
    }
    const index = input.channels.findIndex((candidate) => candidate.id === channel?.id)
    if (index >= 0) input.channels[index] = channel
  }
  return { channel, created: false, renamed }
}

async function seedChannel(channelId: string, content: string): Promise<void> {
  await createDiscordSupportMessage(channelId, {
    content,
    allowed_mentions: { parse: [] },
  })
}

function discordIdMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[1] === 'string' && isDiscordId(entry[1]),
    ),
  )
}

async function synchronizeResourceMessages(input: {
  channelIds: OfficialSupportResourceChannelIds
  previousChannelIds: Record<string, string>
  previousMessageIds: Record<string, string>
  onProgress: (messageIds: Record<string, string>) => Promise<void>
}): Promise<Record<string, string>> {
  const content = buildOfficialSupportResourceContent(input.channelIds)
  const messageIds: Record<string, string> = { ...input.previousMessageIds }
  for (const spec of OFFICIAL_SUPPORT_RESOURCE_SPECS) {
    if (spec.type === 15) continue
    const channelId = input.channelIds[spec.key]
    let messageId = input.previousChannelIds[spec.key] === channelId
      ? input.previousMessageIds[spec.key]
      : undefined
    const payload: DiscordChannelPayload = {
      content: content[spec.key],
      allowed_mentions: { parse: [] },
    }
    if (messageId) {
      try {
        await updateDiscordSupportMessage(channelId, messageId, payload)
      } catch (error) {
        if (!(error instanceof DiscordSupportRestError && error.status === 404)) throw error
        messageId = undefined
      }
    }
    if (!messageId) messageId = await createDiscordSupportMessage(channelId, payload)
    messageIds[spec.key] = messageId
    await input.onProgress(messageIds)
  }
  return messageIds
}

export async function ensureOfficialSupportServer(): Promise<{
  createdChannels: string[]
  createdRoles: string[]
  resourcesVersion: string
  welcomeScreen: 'enabled' | 'community-required' | 'failed'
  serverGuide: 'manual-configuration-required'
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
    .select('updated_by_discord_id, staff_role_ids, resource_channel_ids, resource_message_ids, resources_version')
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

  const start = await ensureChannel({
    guildId, channels, name: 'START HERE', aliases: ['INFORMATION'], type: 4, position: 0,
  })
  const guides = await ensureChannel({ guildId, channels, name: 'BOT & GUIDES', type: 4, position: 1 })
  const updates = await ensureChannel({ guildId, channels, name: 'UPDATES', type: 4, position: 2 })
  const support = await ensureChannel({ guildId, channels, name: 'SUPPORT', type: 4, position: 3 })
  const staff = await ensureChannel({ guildId, channels, name: 'SUPPORT TEAM', type: 4, position: 4 })
  const publicPermissions = publicReadOnlyPermissions(guildId, botId, staffRoleIds)
  const staffPermissions = privateStaffPermissions(guildId, botId, staffRoleIds)
  const ticketPermissions = ticketHubPermissions(guildId, botId, staffRoleIds)
  const createdChannels: string[] = []
  for (const category of [start, guides, updates, support]) {
    if (category.created) createdChannels.push(category.channel.name)
  }
  const categoryIds = {
    start: start.channel.id,
    guides: guides.channel.id,
    updates: updates.channel.id,
    support: support.channel.id,
  }
  const resourceEntries = new Map<OfficialSupportResourceKey, Awaited<ReturnType<typeof ensureChannel>>>()
  const categoryPositions = { start: 0, guides: 0, updates: 0, support: 0 }
  for (const spec of OFFICIAL_SUPPORT_RESOURCE_SPECS) {
    const entry = await ensureChannel({
      guildId,
      channels,
      name: spec.name,
      aliases: spec.aliases,
      type: spec.type,
      parentId: categoryIds[spec.category],
      position: categoryPositions[spec.category]++,
      permissions: spec.key === 'create-a-ticket' ? ticketPermissions : publicPermissions,
      topic: spec.topic,
    })
    resourceEntries.set(spec.key, entry)
    if (entry.created) createdChannels.push(entry.channel.name)
  }
  const channelIdEntries = OFFICIAL_SUPPORT_RESOURCE_KEYS.map((key) => {
    const entry = resourceEntries.get(key)
    if (!entry) throw new Error(`Official support resource channel missing: ${key}`)
    return [key, entry.channel.id]
  })
  const resourceChannelIds = Object.fromEntries(channelIdEntries) as OfficialSupportResourceChannelIds
  const ticketHub = resourceEntries.get('create-a-ticket')!
  const serviceStatus = resourceEntries.get('service-status')!
  const knownIssues = resourceEntries.get('known-issues')!
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
  for (const entry of [queue, logs, aiReview, securityAlerts, staffChat]) {
    if (entry.created) createdChannels.push(entry.channel.name)
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
    resource_channel_ids: resourceChannelIds,
    staff_role_ids: staffRoleIds,
    support_hours: 'Monday-Friday, 01:00-10:00 UTC',
    ai_enabled: true,
    ai_shadow_mode: true,
    enabled: true,
    updated_by_discord_id: actorDiscordId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'support_guild_id' })
  if (upsert.error) throw new Error(upsert.error.message)

  const previousChannelIds = discordIdMap(settingsQuery.data?.resource_channel_ids)
  const previousMessageIds = discordIdMap(settingsQuery.data?.resource_message_ids)
  const channelPointersChanged = OFFICIAL_SUPPORT_RESOURCE_KEYS.some(
    (key) => previousChannelIds[key] !== resourceChannelIds[key],
  )
  let resourceMessageIds = previousMessageIds
  if (settingsQuery.data?.resources_version !== OFFICIAL_SUPPORT_RESOURCES_VERSION || channelPointersChanged) {
    resourceMessageIds = await synchronizeResourceMessages({
      channelIds: resourceChannelIds,
      previousChannelIds,
      previousMessageIds,
      onProgress: async (messageIds) => {
        const progressUpdate = await db.from('support_ticket_settings').update({
          resource_message_ids: messageIds,
          updated_at: new Date().toISOString(),
        }).eq('support_guild_id', guildId)
        if (progressUpdate.error) throw new Error(progressUpdate.error.message)
      },
    })
    const resourceUpdate = await db.from('support_ticket_settings').update({
      resource_channel_ids: resourceChannelIds,
      resource_message_ids: resourceMessageIds,
      resources_version: OFFICIAL_SUPPORT_RESOURCES_VERSION,
      updated_at: new Date().toISOString(),
    }).eq('support_guild_id', guildId)
    if (resourceUpdate.error) throw new Error(resourceUpdate.error.message)
  }

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

  let welcomeScreen: 'enabled' | 'community-required' | 'failed' = 'community-required'
  if (guild.features?.includes('COMMUNITY')) {
    try {
      await updateDiscordSupportWelcomeScreen({
        guildId,
        description: 'Official Albion Guild Manager product information, status, and human support.',
        channels: [
          { channelId: resourceChannelIds['start-here'], description: 'Start with official links and server rules', emojiName: '👋' },
          { channelId: resourceChannelIds['quick-start'], description: 'Set up your guild and bot', emojiName: '🚀' },
          { channelId: resourceChannelIds['product-features'], description: 'Explore features and documentation', emojiName: '🧭' },
          { channelId: resourceChannelIds['service-status'], description: 'Check current service status', emojiName: '🟢' },
          { channelId: resourceChannelIds['create-a-ticket'], description: 'Create a private support ticket', emojiName: '🎫' },
        ],
      })
      welcomeScreen = 'enabled'
    } catch (error) {
      welcomeScreen = 'failed'
      log.warn('[discord-support] welcome screen could not be applied', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

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
    resourcesVersion: OFFICIAL_SUPPORT_RESOURCES_VERSION,
    welcomeScreen,
    serverGuide: 'manual-configuration-required',
    securityBaseline,
    automod,
    commandRegistered: true,
    panelMessageId,
  }
}
