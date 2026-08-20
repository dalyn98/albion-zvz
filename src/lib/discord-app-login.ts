import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase-admin'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { tenantUrl } from '@/lib/tenant-resolver'
import {
  DISCORD_QUICK_STARTER_DESTINATIONS,
} from '@/lib/discord-quick-starter-config'
import type { DiscordQuickStarterDestination } from '@/lib/discord-quick-starter-types'

const DISCORD_APP_LOGIN_TOKEN_BYTES = 32
const DISCORD_APP_LOGIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const DISCORD_APP_LOGIN_ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DISCORD_APP_LOGIN_CUSTOM_ID_PREFIX = 'agm_login:v1'
const DESTINATION_SET = new Set<string>(DISCORD_QUICK_STARTER_DESTINATIONS)

export const DISCORD_APP_LOGIN_ATTEMPT_TTL_SECONDS = 5 * 60

export interface DiscordAppLoginDestination {
  destination: DiscordQuickStarterDestination
}

export type DiscordAppLoginLinkState =
  | { status: 'active'; expiresAt: string }
  | { status: 'used' | 'expired' | 'invalid' }

export function createDiscordAppLoginToken(): string {
  return randomBytes(DISCORD_APP_LOGIN_TOKEN_BYTES).toString('base64url')
}

export function hashDiscordAppLoginToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function isValidDiscordAppLoginToken(value: unknown): value is string {
  return typeof value === 'string' && DISCORD_APP_LOGIN_TOKEN_PATTERN.test(value)
}

export function isValidDiscordAppLoginAttemptId(value: unknown): value is string {
  return typeof value === 'string' && DISCORD_APP_LOGIN_ATTEMPT_ID_PATTERN.test(value)
}

export function buildDiscordAppLoginCustomId(
  destination: DiscordQuickStarterDestination,
): string {
  return `${DISCORD_APP_LOGIN_CUSTOM_ID_PREFIX}:${destination}`
}

export function parseDiscordAppLoginCustomId(
  raw: string | undefined,
): DiscordAppLoginDestination | null {
  if (!raw?.startsWith(`${DISCORD_APP_LOGIN_CUSTOM_ID_PREFIX}:`)) return null
  const destination = raw.slice(DISCORD_APP_LOGIN_CUSTOM_ID_PREFIX.length + 1)
  if (!DESTINATION_SET.has(destination)) return null
  return { destination: destination as DiscordQuickStarterDestination }
}

export function isDiscordAppLoginCustomId(raw: string | undefined): boolean {
  return parseDiscordAppLoginCustomId(raw) !== null
}

export function discordAppLoginReturnPath(destination: DiscordQuickStarterDestination): string {
  switch (destination) {
    case 'verify':
      return '/onboarding/albion'
    case 'events':
      return '/events'
    case 'me':
      return '/me'
    case 'guide':
      return '/member-quick-guide.html'
    case 'regear':
      return '/regear'
    case 'shop':
      return '/shop'
    case 'wallet':
      return '/me/wallet'
    case 'craft':
      return '/craft/queue'
  }
  return '/'
}

export async function createDiscordAppLoginLink(input: {
  guildId: string
  tenantSlug: string
  discordId: string
  returnTo: string
}): Promise<string> {
  const discordId = input.discordId.trim()
  if (!discordId || discordId.length > 128) {
    throw new Error('Invalid Discord app login subject')
  }

  const token = createDiscordAppLoginToken()
  const expiresAt = new Date(Date.now() + DISCORD_APP_LOGIN_ATTEMPT_TTL_SECONDS * 1000).toISOString()
  const { data, error } = await getAdminClient()
    .from('discord_app_login_attempts')
    .insert({
      guild_id: input.guildId,
      discord_id: discordId,
      token_hash: hashDiscordAppLoginToken(token),
      return_to: sanitizeInternalReturnTo(input.returnTo),
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (error || !isValidDiscordAppLoginAttemptId(data?.id)) {
    throw new Error('Failed to create Discord app login attempt')
  }

  // Do not point the Discord button at the consuming endpoint directly.
  // Mobile Discord can open a URL in its webview first and then hand it to the
  // system browser. A GET that consumes immediately strands the second
  // browser without a session. The continuation page keeps GET side-effect
  // free and consumes only after the member explicitly presses Continue.
  const url = new URL('/discord/continue', tenantUrl(input.tenantSlug, '/'))
  url.searchParams.set('id', data.id)
  url.searchParams.set('token', token)
  return url.toString()
}

export async function inspectDiscordAppLoginLink(input: {
  attemptId: unknown
  token: unknown
  nowMs?: number
}): Promise<DiscordAppLoginLinkState> {
  if (
    !isValidDiscordAppLoginAttemptId(input.attemptId) ||
    !isValidDiscordAppLoginToken(input.token)
  ) {
    return { status: 'invalid' }
  }

  const { data, error } = await getAdminClient()
    .from('discord_app_login_attempts')
    .select('consumed_at, expires_at')
    .eq('id', input.attemptId)
    .eq('token_hash', hashDiscordAppLoginToken(input.token))
    .maybeSingle()
  if (error || !data) return { status: 'invalid' }
  if (data.consumed_at) return { status: 'used' }

  const expiresAtMs = Date.parse(data.expires_at)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= (input.nowMs ?? Date.now())) {
    return { status: 'expired' }
  }
  return { status: 'active', expiresAt: data.expires_at }
}
