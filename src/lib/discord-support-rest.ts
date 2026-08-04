import 'server-only'

import type { DiscordChannelPayload } from '@/lib/discord'
import { isDiscordId } from '@/lib/discord-id'

const DISCORD_API = 'https://discord.com/api/v10'
const MAX_ATTEMPTS = 3
const REQUEST_TIMEOUT_MS = 10_000

export class DiscordSupportRestError extends Error {
  constructor(
    readonly status: number,
    readonly route: string,
    readonly responseBody: string,
  ) {
    super(`Discord support REST request failed (${status} ${route})`)
    this.name = 'DiscordSupportRestError'
  }
}
function assertDiscordId(value: string, label: string): void {
  if (!isDiscordId(value)) throw new Error(`Invalid ${label}`)
}

function retryAfterMs(response: Response, body: string): number {
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown }
    if (typeof parsed.retry_after === 'number' && Number.isFinite(parsed.retry_after)) {
      return Math.max(250, Math.min(parsed.retry_after * 1000, 10_000))
    }
  } catch {
    // Discord normally returns JSON for 429, but the header fallback is safe.
  }
  const header = Number(response.headers.get('retry-after'))
  return Number.isFinite(header) ? Math.max(250, Math.min(header * 1000, 10_000)) : 1000
}

async function discordRequest<T>(
  route: string,
  init: RequestInit,
): Promise<T> {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) throw new Error('DISCORD_BOT_TOKEN not configured')

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${DISCORD_API}${route}`, {
      ...init,
      headers: {
        Authorization: `Bot ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = await response.text()
    if (response.ok) {
      return (body ? JSON.parse(body) : undefined) as T
    }
    if (attempt < MAX_ATTEMPTS && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, body)))
      continue
    }
    throw new DiscordSupportRestError(response.status, route, body.slice(0, 1000))
  }
  throw new Error('Discord support REST retry exhausted')
}

export interface DiscordSupportPermissionOverwrite {
  id: string
  type: 0 | 1
  allow: string
  deny: string
}

export interface DiscordSupportChannelSnapshot {
  id: string
  name: string
  type: number
  parent_id: string | null
  topic?: string | null
  position?: number
  permission_overwrites: DiscordSupportPermissionOverwrite[]
}

export interface DiscordSupportRoleSnapshot {
  id: string
  name: string
  permissions: string
}

export interface DiscordSupportGuildSnapshot {
  id: string
  name: string
  roles: DiscordSupportRoleSnapshot[]
  features?: string[]
}

export interface DiscordSupportMemberSnapshot {
  user?: { id?: string }
  roles: string[]
}

export async function getDiscordSupportChannelSnapshot(
  channelId: string,
): Promise<DiscordSupportChannelSnapshot | null> {
  assertDiscordId(channelId, 'channel id')
  try {
    return await discordRequest<DiscordSupportChannelSnapshot>(`/channels/${channelId}`, {
      method: 'GET',
    })
  } catch (error) {
    if (error instanceof DiscordSupportRestError && error.status === 404) return null
    throw error
  }
}

export async function getDiscordSupportGuildSnapshot(
  guildId: string,
): Promise<DiscordSupportGuildSnapshot | null> {
  assertDiscordId(guildId, 'guild id')
  try {
    return await discordRequest<DiscordSupportGuildSnapshot>(`/guilds/${guildId}`, {
      method: 'GET',
    })
  } catch (error) {
    if (error instanceof DiscordSupportRestError && error.status === 404) return null
    throw error
  }
}

export async function listDiscordSupportChannels(
  guildId: string,
): Promise<DiscordSupportChannelSnapshot[]> {
  assertDiscordId(guildId, 'guild id')
  return discordRequest<DiscordSupportChannelSnapshot[]>(`/guilds/${guildId}/channels`, {
    method: 'GET',
  })
}

export async function createDiscordSupportChannel(input: {
  guildId: string
  name: string
  type: 0 | 4 | 15
  parentId?: string | null
  topic?: string | null
  position?: number
  permissionOverwrites?: DiscordSupportPermissionOverwrite[]
  auditReason: string
}): Promise<DiscordSupportChannelSnapshot> {
  assertDiscordId(input.guildId, 'guild id')
  if (input.parentId) assertDiscordId(input.parentId, 'parent id')
  return discordRequest<DiscordSupportChannelSnapshot>(`/guilds/${input.guildId}/channels`, {
    method: 'POST',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent(input.auditReason.slice(0, 256)) },
    body: JSON.stringify({
      name: input.name.trim().slice(0, 100),
      type: input.type,
      ...(input.parentId ? { parent_id: input.parentId } : {}),
      ...(input.topic ? { topic: input.topic.slice(0, 1024) } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.permissionOverwrites ? { permission_overwrites: input.permissionOverwrites } : {}),
    }),
  })
}

export async function updateDiscordSupportChannel(input: {
  channelId: string
  name?: string
  parentId?: string | null
  topic?: string | null
  position?: number
  permissionOverwrites?: DiscordSupportPermissionOverwrite[]
  auditReason: string
}): Promise<void> {
  assertDiscordId(input.channelId, 'channel id')
  if (input.parentId) assertDiscordId(input.parentId, 'parent id')
  await discordRequest(`/channels/${input.channelId}`, {
    method: 'PATCH',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent(input.auditReason.slice(0, 256)) },
    body: JSON.stringify({
      ...(input.name !== undefined ? { name: input.name.slice(0, 100) } : {}),
      ...(input.parentId !== undefined ? { parent_id: input.parentId } : {}),
      ...(input.topic !== undefined ? { topic: input.topic?.slice(0, 1024) ?? null } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.permissionOverwrites ? { permission_overwrites: input.permissionOverwrites } : {}),
    }),
  })
}

export async function createDiscordSupportRole(input: {
  guildId: string
  name: string
  color: number
  auditReason: string
}): Promise<DiscordSupportRoleSnapshot> {
  assertDiscordId(input.guildId, 'guild id')
  return discordRequest<DiscordSupportRoleSnapshot>(`/guilds/${input.guildId}/roles`, {
    method: 'POST',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent(input.auditReason.slice(0, 256)) },
    body: JSON.stringify({
      name: input.name.slice(0, 100),
      color: input.color,
      permissions: '0',
      mentionable: false,
      hoist: true,
    }),
  })
}

export async function updateDiscordSupportGuildSecurity(input: {
  guildId: string
  safetyAlertsChannelId?: string
}): Promise<void> {
  assertDiscordId(input.guildId, 'guild id')
  if (input.safetyAlertsChannelId) assertDiscordId(input.safetyAlertsChannelId, 'safety alerts channel id')
  await discordRequest(`/guilds/${input.guildId}`, {
    method: 'PATCH',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent('Official support security baseline') },
    body: JSON.stringify({
      verification_level: 2,
      default_message_notifications: 1,
      explicit_content_filter: 2,
      preferred_locale: 'en-US',
      ...(input.safetyAlertsChannelId ? { safety_alerts_channel_id: input.safetyAlertsChannelId } : {}),
    }),
  })
}

interface DiscordAutoModerationRuleSnapshot {
  id: string
  name: string
  trigger_type: number
}

export async function ensureDiscordMentionSpamRule(input: {
  guildId: string
  alertChannelId: string
  exemptRoleIds: string[]
}): Promise<void> {
  assertDiscordId(input.guildId, 'guild id')
  assertDiscordId(input.alertChannelId, 'alert channel id')
  const rules = await discordRequest<DiscordAutoModerationRuleSnapshot[]>(
    `/guilds/${input.guildId}/auto-moderation/rules`,
    { method: 'GET' },
  )
  if (rules.some((rule) => rule.name === 'Official support mention spam')) return
  await discordRequest(`/guilds/${input.guildId}/auto-moderation/rules`, {
    method: 'POST',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent('Official support anti-spam baseline') },
    body: JSON.stringify({
      name: 'Official support mention spam',
      event_type: 1,
      trigger_type: 5,
      trigger_metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true },
      actions: [
        { type: 1, metadata: { custom_message: 'Too many mentions. Please use the support ticket panel.' } },
        { type: 2, metadata: { channel_id: input.alertChannelId } },
      ],
      enabled: true,
      exempt_roles: input.exemptRoleIds.slice(0, 20),
      exempt_channels: [],
    }),
  })
}

export async function upsertDiscordSupportApplicationCommand(input: {
  applicationId: string
  guildId: string
  command: Record<string, unknown>
}): Promise<void> {
  assertDiscordId(input.applicationId, 'application id')
  assertDiscordId(input.guildId, 'guild id')
  const registered = await discordRequest<{ name?: unknown }>(
    `/applications/${input.applicationId}/guilds/${input.guildId}/commands`,
    { method: 'POST', body: JSON.stringify(input.command) },
  )
  if (registered.name !== input.command.name) {
    throw new Error('Discord returned an unexpected support command')
  }
}

export async function getDiscordSupportMemberSnapshot(
  guildId: string,
  discordId: string,
): Promise<DiscordSupportMemberSnapshot | null> {
  assertDiscordId(guildId, 'guild id')
  assertDiscordId(discordId, 'Discord user id')
  try {
    return await discordRequest<DiscordSupportMemberSnapshot>(
      `/guilds/${guildId}/members/${discordId}`,
      { method: 'GET' },
    )
  } catch (error) {
    if (error instanceof DiscordSupportRestError && error.status === 404) return null
    throw error
  }
}

export async function discordSupportMessageExists(
  channelId: string,
  messageId: string,
): Promise<boolean> {
  assertDiscordId(channelId, 'channel id')
  assertDiscordId(messageId, 'message id')
  try {
    await discordRequest<unknown>(`/channels/${channelId}/messages/${messageId}`, {
      method: 'GET',
    })
    return true
  } catch (error) {
    if (error instanceof DiscordSupportRestError && error.status === 404) return false
    throw error
  }
}

export async function createDiscordPrivateThread(input: {
  parentChannelId: string
  name: string
  auditReason: string
}): Promise<string> {
  assertDiscordId(input.parentChannelId, 'parent channel id')
  const channel = await discordRequest<{ id?: unknown }>(
    `/channels/${input.parentChannelId}/threads`,
    {
      method: 'POST',
      headers: { 'X-Audit-Log-Reason': encodeURIComponent(input.auditReason.slice(0, 256)) },
      body: JSON.stringify({
        name: input.name.trim().slice(0, 100),
        type: 12,
        auto_archive_duration: 10080,
        invitable: false,
      }),
    },
  )
  if (typeof channel.id !== 'string' || !isDiscordId(channel.id)) {
    throw new Error('Discord private thread response had no id')
  }
  return channel.id
}

export async function createDiscordForumPost(input: {
  forumChannelId: string
  name: string
  content: string
  auditReason: string
}): Promise<string> {
  assertDiscordId(input.forumChannelId, 'forum channel id')
  const thread = await discordRequest<{ id?: unknown }>(
    `/channels/${input.forumChannelId}/threads`,
    {
      method: 'POST',
      headers: { 'X-Audit-Log-Reason': encodeURIComponent(input.auditReason.slice(0, 256)) },
      body: JSON.stringify({
        name: input.name.trim().slice(0, 100),
        auto_archive_duration: 10080,
        message: {
          content: input.content.slice(0, 2000),
          allowed_mentions: { parse: [] },
        },
      }),
    },
  )
  if (typeof thread.id !== 'string' || !isDiscordId(thread.id)) {
    throw new Error('Discord forum post response had no id')
  }
  return thread.id
}

export async function addDiscordThreadMember(threadId: string, discordId: string): Promise<void> {
  assertDiscordId(threadId, 'thread id')
  assertDiscordId(discordId, 'Discord user id')
  await discordRequest<void>(`/channels/${threadId}/thread-members/${discordId}`, { method: 'PUT' })
}

export async function createDiscordSupportMessage(
  channelId: string,
  payload: DiscordChannelPayload,
): Promise<string> {
  assertDiscordId(channelId, 'channel id')
  const message = await discordRequest<{ id?: unknown }>(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, allowed_mentions: payload.allowed_mentions ?? { parse: [] } }),
  })
  if (typeof message.id !== 'string' || !isDiscordId(message.id)) {
    throw new Error('Discord message response had no id')
  }
  return message.id
}

export async function updateDiscordSupportMessage(
  channelId: string,
  messageId: string,
  payload: DiscordChannelPayload,
): Promise<void> {
  assertDiscordId(channelId, 'channel id')
  assertDiscordId(messageId, 'message id')
  await discordRequest<void>(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...payload, allowed_mentions: payload.allowed_mentions ?? { parse: [] } }),
  })
}

export async function deleteDiscordSupportMessage(
  channelId: string,
  messageId: string,
): Promise<void> {
  assertDiscordId(channelId, 'channel id')
  assertDiscordId(messageId, 'message id')
  await discordRequest<void>(`/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
  })
}

export async function setDiscordThreadClosed(input: {
  threadId: string
  closed: boolean
  auditReason: string
}): Promise<void> {
  assertDiscordId(input.threadId, 'thread id')
  await discordRequest<void>(`/channels/${input.threadId}`, {
    method: 'PATCH',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent(input.auditReason.slice(0, 256)) },
    body: JSON.stringify(
      input.closed
        ? { archived: true, locked: true }
        : { archived: false, locked: false },
    ),
  })
}

export async function deleteDiscordSupportThread(
  threadId: string,
  auditReason: string,
): Promise<void> {
  assertDiscordId(threadId, 'thread id')
  await discordRequest<void>(`/channels/${threadId}`, {
    method: 'DELETE',
    headers: { 'X-Audit-Log-Reason': encodeURIComponent(auditReason.slice(0, 256)) },
  })
}
