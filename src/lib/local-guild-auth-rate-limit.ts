import 'server-only'

import { createHash } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase-admin'

const LOGIN_WINDOW_SECONDS = 15 * 60
const LOGIN_MAX_ATTEMPTS = 8
const LOGIN_LOCK_SECONDS = 15 * 60
const REGISTRATION_WINDOW_SECONDS = 15 * 60
const REGISTRATION_MAX_ATTEMPTS = 4
const REGISTRATION_LOCK_SECONDS = 30 * 60

type LocalGuildAuthAttemptKind = 'login' | 'registration'

interface HeaderReader {
  get(name: string): string | null
}

interface LocalGuildAuthRateLimitInput {
  guildId: string
  kind: LocalGuildAuthAttemptKind
  accountKey: string
  requestHeaders: HeaderReader
}

interface LocalGuildAuthRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
  fingerprint: string
  subjects: string[]
}

interface RateLimitPolicy {
  maxAttempts: number
  windowSeconds: number
  lockSeconds: number
}

function policyFor(kind: LocalGuildAuthAttemptKind): RateLimitPolicy {
  return kind === 'login'
    ? {
        maxAttempts: LOGIN_MAX_ATTEMPTS,
        windowSeconds: LOGIN_WINDOW_SECONDS,
        lockSeconds: LOGIN_LOCK_SECONDS,
      }
    : {
        maxAttempts: REGISTRATION_MAX_ATTEMPTS,
        windowSeconds: REGISTRATION_WINDOW_SECONDS,
        lockSeconds: REGISTRATION_LOCK_SECONDS,
      }
}

function requestIp(headers: HeaderReader): string {
  const forwarded = headers.get('x-vercel-forwarded-for') ?? headers.get('x-forwarded-for') ?? ''
  const first = forwarded.split(',')[0]?.trim()
  return first || 'unknown'
}

export function localGuildAuthFingerprint(headers: HeaderReader): string {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET is not set')
  return createHash('sha256').update(`${secret}:${requestIp(headers)}`).digest('hex')
}

export function localGuildAuthAccountKey(server: string, nickname: string): string {
  return `${server}:${nickname.normalize('NFKC').toLocaleLowerCase()}`
}

function subjectsFor(kind: LocalGuildAuthAttemptKind, accountKey: string): string[] {
  return kind === 'login' ? ['login', `login:${accountKey}`] : ['registration']
}

export async function consumeLocalGuildAuthAttempt(
  input: LocalGuildAuthRateLimitInput,
): Promise<LocalGuildAuthRateLimitResult> {
  const policy = policyFor(input.kind)
  const fingerprint = localGuildAuthFingerprint(input.requestHeaders)
  const subjects = subjectsFor(input.kind, input.accountKey)
  const db = getAdminClient()
  const results = await Promise.all(
    subjects.map(async (subject) => {
      const { data, error } = await db.rpc('consume_local_guild_auth_attempt', {
        p_guild_id: input.guildId,
        p_scope: input.kind,
        p_subject: subject,
        p_ip_hash: fingerprint,
        p_max_attempts: policy.maxAttempts,
        p_window_seconds: policy.windowSeconds,
        p_lock_seconds: policy.lockSeconds,
      })
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        return { allowed: false, retryAfterSeconds: policy.lockSeconds }
      }
      const result = data as { allowed?: unknown; retry_after_seconds?: unknown }
      return {
        allowed: result.allowed === true,
        retryAfterSeconds:
          typeof result.retry_after_seconds === 'number' && result.retry_after_seconds > 0
            ? Math.ceil(result.retry_after_seconds)
            : 0,
      }
    }),
  )
  const blocked = results.filter((result) => !result.allowed)
  return {
    allowed: blocked.length === 0,
    retryAfterSeconds: Math.max(0, ...blocked.map((result) => result.retryAfterSeconds)),
    fingerprint,
    subjects,
  }
}

export async function clearLocalGuildAuthAttempts(input: {
  guildId: string
  fingerprint: string
  scope: LocalGuildAuthAttemptKind
  subjects: string[]
}): Promise<void> {
  if (input.subjects.length === 0) return
  await getAdminClient()
    .from('local_guild_auth_attempts')
    .delete()
    .eq('guild_id', input.guildId)
    .eq('scope', input.scope)
    .eq('ip_hash', input.fingerprint)
    .in('subject', input.subjects)
}
