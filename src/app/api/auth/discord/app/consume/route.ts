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
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import { createAuthTimer, recordAuthFailure, recordAuthSuccess } from '@/lib/auth-telemetry'
import { withNoStore } from '@/lib/no-store-response'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function failureRedirect(request: NextRequest, reason: string, extra?: Record<string, unknown>): NextResponse {
  recordAuthFailure(request, 'discord_app_login', reason, extra)
  const url = new URL(request.url)
  url.pathname = '/'
  url.search = ''
  url.searchParams.set('auth_error', reason)
  const response = NextResponse.redirect(url)
  response.headers.set('referrer-policy', 'no-referrer')
  return withNoStore(response)
}

export async function GET(request: NextRequest) {
  const elapsedMs = createAuthTimer()
  const url = new URL(request.url)
  const attemptId = url.searchParams.get('id')
  const token = url.searchParams.get('token')
  if (!isValidDiscordAppLoginAttemptId(attemptId) || !isValidDiscordAppLoginToken(token)) {
    return failureRedirect(request, 'app_login_invalid', { duration_ms: elapsedMs() })
  }

  const tokenHash = hashDiscordAppLoginToken(token)
  const now = new Date().toISOString()
  const db = getAdminClient()
  const { data: attempt, error: attemptError } = await db
    .from('discord_app_login_attempts')
    .select('guild_id, discord_id, return_to')
    .eq('id', attemptId)
    .eq('token_hash', tokenHash)
    .is('consumed_at', null)
    .gt('expires_at', now)
    .maybeSingle()
  if (attemptError || !attempt) {
    return failureRedirect(request, 'app_login_invalid', { duration_ms: elapsedMs() })
  }

  const tenant = await getTenantDiscordConfig(attempt.guild_id)
  if (!tenant) {
    return failureRedirect(request, 'app_login_invalid', {
      tenant_id: attempt.guild_id,
      duration_ms: elapsedMs(),
    })
  }

  const member = await getGuildMemberByBot(tenant.discordGuildId, attempt.discord_id)
  if (!member?.user || member.user.id !== attempt.discord_id) {
    return failureRedirect(request, 'not_in_guild', {
      tenant_id: tenant.id,
      duration_ms: elapsedMs(),
    })
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
    return failureRedirect(request, 'app_login_invalid', { duration_ms: elapsedMs() })
  }

  const returnTo = resolveDiscordMemberPostLoginPath(
    attempt.return_to,
    memberSession.preferredLocale,
  )
  const hopToken = await signHopToken({
    session: memberSession.session,
    returnTo,
    preferredLocale: memberSession.preferredLocale,
  })
  const finishPath = `/api/auth/finish?token=${encodeURIComponent(hopToken)}`
  const response = NextResponse.redirect(buildTenantHostUrl(tenant.slug, finishPath))
  response.headers.set('referrer-policy', 'no-referrer')
  recordAuthSuccess(request, 'discord_app_login', {
    mode: memberSession.mode,
    tenant_id: tenant.id,
    return_to: attempt.return_to,
    duration_ms: elapsedMs(),
  })
  return withNoStore(response)
}
