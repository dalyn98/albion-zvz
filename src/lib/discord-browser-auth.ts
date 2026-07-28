import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase-admin'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'

const APPROVAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
const APPROVAL_CODE_LENGTH = 8
const BROWSER_SECRET_BYTES = 32
const ATTEMPT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH_PATTERN = /^[a-f0-9]{64}$/
const DISCORD_ID_PATTERN = /^\d{5,30}$/

export const DISCORD_BROWSER_AUTH_TTL_SECONDS = 5 * 60
export const DISCORD_BROWSER_AUTH_COOKIE = 'agm_discord_browser_auth'

interface HeaderReader {
  get(name: string): string | null
}

interface CreateAttemptRpcResult {
  allowed?: unknown
  attempt_id?: unknown
  expires_in_seconds?: unknown
  retry_after_seconds?: unknown
}

export type CreateDiscordBrowserAuthAttemptResult =
  | {
      ok: true
      attemptId: string
      approvalCode: string
      browserSecret: string
      expiresInSeconds: number
    }
  | {
      ok: false
      error: 'rate_limited' | 'unavailable'
      retryAfterSeconds: number
    }

export function createDiscordBrowserApprovalCode(): string {
  const bytes = randomBytes(APPROVAL_CODE_LENGTH)
  let code = ''
  for (const byte of bytes) {
    code += APPROVAL_ALPHABET[byte % APPROVAL_ALPHABET.length]
  }
  return code
}

export function formatDiscordBrowserApprovalCode(code: string): string {
  const normalized = normalizeDiscordBrowserApprovalCode(code)
  return normalized ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : ''
}

export function normalizeDiscordBrowserApprovalCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.toUpperCase().replace(/[\s-]+/g, '')
  if (normalized.length !== APPROVAL_CODE_LENGTH) return null
  for (const character of normalized) {
    if (!APPROVAL_ALPHABET.includes(character)) return null
  }
  return normalized
}

export function hashDiscordBrowserAuthValue(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function discordBrowserAuthFingerprint(headers: HeaderReader): string {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET is not set')
  const forwarded =
    headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for') ?? ''
  const ip = forwarded.split(',')[0]?.trim() || 'unknown'
  return hashDiscordBrowserAuthValue(`${secret}:${ip}`)
}

export function isValidDiscordBrowserAuthAttemptId(value: unknown): value is string {
  return typeof value === 'string' && ATTEMPT_ID_PATTERN.test(value)
}

export function isValidDiscordBrowserAuthHash(value: unknown): value is string {
  return typeof value === 'string' && HASH_PATTERN.test(value)
}

export function discordBrowserAuthCookieValue(attemptId: string, browserSecret: string): string {
  if (!isValidDiscordBrowserAuthAttemptId(attemptId) || !browserSecret) {
    throw new Error('Invalid Discord browser auth binding')
  }
  return `${attemptId}.${browserSecret}`
}

export function parseDiscordBrowserAuthCookie(
  value: string | null | undefined,
): { attemptId: string; browserSecret: string } | null {
  if (!value) return null
  const separator = value.indexOf('.')
  if (separator < 0) return null
  const attemptId = value.slice(0, separator)
  const browserSecret = value.slice(separator + 1)
  if (!isValidDiscordBrowserAuthAttemptId(attemptId)) return null
  if (!/^[A-Za-z0-9_-]{43}$/.test(browserSecret)) return null
  return { attemptId, browserSecret }
}

export function discordBrowserAuthCookieOptions(maxAge = DISCORD_BROWSER_AUTH_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'strict' as const,
    path: '/api/auth/discord/device',
    maxAge,
    priority: 'high' as const,
  }
}

export async function createDiscordBrowserAuthAttempt(input: {
  guildId: string
  returnTo: string
  headers: HeaderReader
}): Promise<CreateDiscordBrowserAuthAttemptResult> {
  const approvalCode = createDiscordBrowserApprovalCode()
  const browserSecret = randomBytes(BROWSER_SECRET_BYTES).toString('base64url')
  const fingerprint = discordBrowserAuthFingerprint(input.headers)
  const { data, error } = await getAdminClient().rpc('create_discord_browser_auth_attempt', {
    p_guild_id: input.guildId,
    p_code_hash: hashDiscordBrowserAuthValue(approvalCode),
    p_browser_secret_hash: hashDiscordBrowserAuthValue(browserSecret),
    p_request_fingerprint: fingerprint,
    p_return_to: sanitizeInternalReturnTo(input.returnTo),
  })
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'unavailable', retryAfterSeconds: 0 }
  }

  const result = data as CreateAttemptRpcResult
  if (result.allowed !== true) {
    return {
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds:
        typeof result.retry_after_seconds === 'number'
          ? Math.max(1, Math.ceil(result.retry_after_seconds))
          : DISCORD_BROWSER_AUTH_TTL_SECONDS,
    }
  }
  if (
    !isValidDiscordBrowserAuthAttemptId(result.attempt_id) ||
    typeof result.expires_in_seconds !== 'number'
  ) {
    return { ok: false, error: 'unavailable', retryAfterSeconds: 0 }
  }

  return {
    ok: true,
    attemptId: result.attempt_id,
    approvalCode: formatDiscordBrowserApprovalCode(approvalCode),
    browserSecret,
    expiresInSeconds: Math.min(
      DISCORD_BROWSER_AUTH_TTL_SECONDS,
      Math.max(1, Math.floor(result.expires_in_seconds)),
    ),
  }
}

export async function approveDiscordBrowserAuthAttempt(input: {
  guildId: string
  approvalCode: unknown
  discordId: unknown
}): Promise<boolean> {
  const approvalCode = normalizeDiscordBrowserApprovalCode(input.approvalCode)
  if (
    !approvalCode ||
    typeof input.discordId !== 'string' ||
    !DISCORD_ID_PATTERN.test(input.discordId)
  ) {
    return false
  }
  const { data, error } = await getAdminClient().rpc(
    'approve_discord_browser_auth_attempt',
    {
      p_guild_id: input.guildId,
      p_code_hash: hashDiscordBrowserAuthValue(approvalCode),
      p_discord_id: input.discordId,
    },
  )
  return !error && data === true
}
