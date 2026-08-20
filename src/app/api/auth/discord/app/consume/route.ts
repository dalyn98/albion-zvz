import { NextRequest, NextResponse } from 'next/server'
import {
  hashDiscordAppLoginToken,
  isValidDiscordAppLoginAttemptId,
  isValidDiscordAppLoginToken,
} from '@/lib/discord-app-login'
import { getGuildMemberByBot } from '@/lib/discord'
import {
  buildDiscordMemberSession,
  resolveDiscordMemberPostLoginPath,
} from '@/lib/discord-member-session'
import { signHopToken } from '@/lib/oauth-state'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import { createAuthTimer, recordAuthFailure, recordAuthSuccess } from '@/lib/auth-telemetry'
import { withNoStore } from '@/lib/no-store-response'
import { buildLoginEntryHref } from '@/lib/login-entry'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  canShareAuthBindingCookie,
  hopTokenBindingCookieName,
  hopTokenBindingCookieOptions,
} from '@/lib/auth-flow-cookie'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Link previewers commonly send HEAD before a user follows a URL. A one-time
// bearer link must never be consumed by that probe.
export function HEAD(): NextResponse {
  const response = new NextResponse(null, { status: 204 })
  response.headers.set('referrer-policy', 'no-referrer')
  return withNoStore(response)
}

function failureRedirect(
  request: NextRequest,
  reason: string,
  extra?: Record<string, unknown>,
  status?: 303,
): NextResponse {
  recordAuthFailure(request, 'discord_app_login', reason, extra)
  const url = new URL(request.url)
  const response = NextResponse.redirect(
    new URL(buildLoginEntryHref({ returnTo: '/', authError: reason }), url.origin),
    status ? { status } : undefined,
  )
  response.headers.set('referrer-policy', 'no-referrer')
  return withNoStore(response)
}

interface DiscordAppLoginAttempt {
  guild_id: string
  discord_id: string
  return_to: string
  consumed_at: string | null
  expires_at: string
}

function isActiveAttempt(
  attempt: DiscordAppLoginAttempt,
  nowMs: number,
): boolean {
  const expiresAt = Date.parse(attempt.expires_at)
  return attempt.consumed_at === null
    && Number.isFinite(expiresAt)
    && expiresAt > nowMs
}

async function recoverAuthenticatedReplay(
  request: NextRequest,
  attemptId: string,
  attempt: DiscordAppLoginAttempt,
  durationMs: number,
  redirectStatus?: 303,
): Promise<NextResponse | null> {
  const session = await getSession()
  if (
    !session?.guildId
    || session.guildId !== attempt.guild_id
    || session.discordId !== attempt.discord_id
  ) {
    return null
  }

  const tenant = await getTenantDiscordConfig(attempt.guild_id)
  if (!tenant) return null

  const tenantOrigin = new URL(buildTenantHostUrl(tenant.slug, '/')).origin
  const requestOrigin = new URL(request.url).origin
  if (requestOrigin !== tenantOrigin) return null

  const returnTo = sanitizeInternalReturnTo(attempt.return_to)
  const response = NextResponse.redirect(
    new URL(returnTo, tenantOrigin),
    redirectStatus ? { status: redirectStatus } : undefined,
  )
  response.headers.set('referrer-policy', 'no-referrer')
  recordAuthSuccess(request, 'discord_app_login', {
    flow_id: attemptId,
    mode: 'existing_session_replay',
    tenant_id: attempt.guild_id,
    return_to: returnTo,
    duration_ms: durationMs,
  })
  return withNoStore(response)
}

async function consumeDiscordAppLogin(
  request: NextRequest,
  credentials: { attemptId: string | null; token: string | null },
  redirectStatus?: 303,
) {
  const elapsedMs = createAuthTimer()
  const attemptId = credentials.attemptId
  const token = credentials.token
  if (!isValidDiscordAppLoginAttemptId(attemptId) || !isValidDiscordAppLoginToken(token)) {
    return failureRedirect(
      request,
      'app_login_invalid',
      { duration_ms: elapsedMs() },
      redirectStatus,
    )
  }

  const tokenHash = hashDiscordAppLoginToken(token)
  const now = new Date().toISOString()
  const db = getAdminClient()
  const { data: attempt, error: attemptError } = await db
    .from('discord_app_login_attempts')
    .select('guild_id, discord_id, return_to, consumed_at, expires_at')
    .eq('id', attemptId)
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (attemptError || !attempt) {
    return failureRedirect(
      request,
      'app_login_invalid',
      { duration_ms: elapsedMs() },
      redirectStatus,
    )
  }
  if (!isActiveAttempt(attempt, Date.parse(now))) {
    const recovered = await recoverAuthenticatedReplay(
      request,
      attemptId,
      attempt,
      elapsedMs(),
      redirectStatus,
    )
    if (recovered) return recovered
    return failureRedirect(
      request,
      'app_login_invalid',
      {
        tenant_id: attempt.guild_id,
        duration_ms: elapsedMs(),
      },
      redirectStatus,
    )
  }

  const tenant = await getTenantDiscordConfig(attempt.guild_id)
  if (!tenant) {
    return failureRedirect(
      request,
      'app_login_invalid',
      {
        tenant_id: attempt.guild_id,
        duration_ms: elapsedMs(),
      },
      redirectStatus,
    )
  }

  const member = await getGuildMemberByBot(tenant.discordGuildId, attempt.discord_id)
  if (!member?.user || member.user.id !== attempt.discord_id) {
    return failureRedirect(
      request,
      'not_in_guild',
      {
        tenant_id: tenant.id,
        duration_ms: elapsedMs(),
      },
      redirectStatus,
    )
  }

  const memberSession = await buildDiscordMemberSession({
    tenant,
    discordId: attempt.discord_id,
    user: member.user,
    member,
    preferredLocale: null,
  })

  // Verification happens before this mutation so a transient Discord/API
  // failure does not burn a valid five-minute handoff. The conditional UPDATE
  // remains the sole, atomic authority that lets exactly one request continue.
  const { data: consumed, error: consumeError } = await db
    .from('discord_app_login_attempts')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', attemptId)
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle()
  if (consumeError || !consumed) {
    return failureRedirect(
      request,
      'app_login_invalid',
      { duration_ms: elapsedMs() },
      redirectStatus,
    )
  }

  const returnTo = resolveDiscordMemberPostLoginPath(
    attempt.return_to,
    memberSession.preferredLocale,
  )
  const tenantOrigin = buildTenantHostUrl(tenant.slug, '/')
  const requiresBrowserBinding = canShareAuthBindingCookie(
    request.headers.get('host'),
    tenantOrigin,
  )
  const hopToken = await signHopToken({
    session: memberSession.session,
    returnTo,
    preferredLocale: memberSession.preferredLocale,
    flowId: attemptId,
    requiresBrowserBinding,
  })
  const finishPath = `/api/auth/finish?token=${encodeURIComponent(hopToken)}`
  const response = NextResponse.redirect(
    buildTenantHostUrl(tenant.slug, finishPath),
    redirectStatus ? { status: redirectStatus } : undefined,
  )
  response.headers.set('referrer-policy', 'no-referrer')
  if (requiresBrowserBinding) {
    response.cookies.set(
      hopTokenBindingCookieName(attemptId),
      AUTH_FLOW_BINDING_COOKIE_VALUE,
      hopTokenBindingCookieOptions(request.headers.get('host')),
    )
  }
  recordAuthSuccess(request, 'discord_app_login', {
    flow_id: attemptId,
    mode: memberSession.mode,
    tenant_id: tenant.id,
    return_to: attempt.return_to,
    duration_ms: elapsedMs(),
  })
  return withNoStore(response)
}

// Backward compatibility for links issued before the explicit continuation
// page shipped. New links use POST so previews and mobile webview handoffs
// cannot consume the credential.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  return consumeDiscordAppLogin(request, {
    attemptId: url.searchParams.get('id'),
    token: url.searchParams.get('token'),
  })
}

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null)
  return consumeDiscordAppLogin(
    request,
    {
      attemptId: typeof formData?.get('id') === 'string' ? String(formData.get('id')) : null,
      token: typeof formData?.get('token') === 'string' ? String(formData.get('token')) : null,
    },
    303,
  )
}
