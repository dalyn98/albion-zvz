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
    super(`Discord support REST request failed (${status})`)
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
