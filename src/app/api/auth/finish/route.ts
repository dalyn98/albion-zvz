// Canonical-hop handoff endpoint.
//
// The Discord OAuth callback runs on the canonical domain
// (`albion-guildmanager.com/api/auth/discord/callback`) so we register a
// single redirect_uri with Discord. It can't set the session cookie there —
// we need the cookie scoped to the tenant's subdomain — so it hands off a
// one-time signed token via 302 to `{slug}.albion-guildmanager.com/api/auth/finish`.
// This route verifies the token, enforces that the host matches the session's
// tenant (anti-replay on a foreign subdomain), and sets the cookie here.

import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, cookieOptions, signSession } from '@/lib/session'
import { verifyHopToken } from '@/lib/oauth-state'
import { classifyHost } from '@/lib/tenant-resolver'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { LAST_GUILD_COOKIE, lastGuildCookieOptions } from '@/lib/last-guild-cookie'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import { createAuthTimer, recordAuthFailure, recordAuthSuccess } from '@/lib/auth-telemetry'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { withNoStore } from '@/lib/no-store-response'

function errorRedirect(
  request: NextRequest,
  origin: string,
  reason: string,
  extra?: Record<string, unknown>,
): NextResponse {
  recordAuthFailure(request, 'finish', reason, extra)
  const target = new URL('/', origin)
  target.searchParams.set('auth_error', reason)
  return withNoStore(NextResponse.redirect(target))
}

export async function GET(request: NextRequest) {
  const elapsedMs = createAuthTimer()
  const url = new URL(request.url)
  const fail = (reason: string, extra?: Record<string, unknown>): NextResponse =>
    errorRedirect(request, url.origin, reason, {
      ...(extra ?? {}),
      duration_ms: elapsedMs(),
    })
  const token = url.searchParams.get('token')
  if (!token) return fail('hop_missing')

  const hop = await verifyHopToken(token)
  if (!hop) return fail('hop_invalid')

  const session = hop.session
  if (!session.guildId) return fail('hop_no_tenant')

  // Anti-misdirection: the session's tenant must match the tenant whose
  // subdomain this request arrived on. Without this check, a leaked hop
  // token (60s window) could be redeemed on any tenant subdomain and set a
  // cookie with a mismatched guildId there.
  const hostClassification = classifyHost(request.headers.get('host'))
  if (hostClassification.kind !== 'tenant') {
    return fail('hop_wrong_host', { classification: hostClassification.kind })
  }

  const tenant = await getTenantDiscordConfig(session.guildId)
  if (!tenant) return fail('hop_no_tenant', { guild_id: session.guildId })
  if (tenant.slug !== hostClassification.slug) {
    return fail('hop_wrong_host', {
      session_slug: tenant.slug,
      host_slug: hostClassification.slug,
    })
  }

  const returnTo = sanitizeInternalReturnTo(hop.returnTo)

  // Re-sign the session with issuedAt=now so cookie age matches delivery,
  // not the callback's earlier sign. Keeps expiry bookkeeping clean.
  const cookieValue = await signSession({ ...session, issuedAt: Date.now() })
  const response = NextResponse.redirect(new URL(returnTo, url.origin))
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, cookieOptions())
  response.cookies.set(
    LAST_GUILD_COOKIE,
    tenant.slug,
    lastGuildCookieOptions(request.headers.get('host')),
  )

  if (hop.preferredLocale && isLocale(hop.preferredLocale)) {
    response.cookies.set(
      LOCALE_COOKIE,
      hop.preferredLocale,
      localeCookieOptions(request.headers.get('host')),
    )
  }

  recordAuthSuccess(request, 'finish', {
    tenant_id: session.guildId,
    return_to: returnTo,
    duration_ms: elapsedMs(),
  })
  return withNoStore(response)
}
