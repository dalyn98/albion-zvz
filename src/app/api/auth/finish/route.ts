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
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function errorRedirect(origin: string, reason: string): NextResponse {
  const target = new URL('/', origin)
  target.searchParams.set('auth_error', reason)
  return NextResponse.redirect(target)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')
  if (!token) return errorRedirect(url.origin, 'hop_missing')

  const hop = await verifyHopToken(token)
  if (!hop) return errorRedirect(url.origin, 'hop_invalid')

  const session = hop.session
  if (!session.guildId) return errorRedirect(url.origin, 'hop_no_tenant')

  // Anti-misdirection: the session's tenant must match the tenant whose
  // subdomain this request arrived on. Without this check, a leaked hop
  // token (60s window) could be redeemed on any tenant subdomain and set a
  // cookie with a mismatched guildId there.
  const hostClassification = classifyHost(request.headers.get('host'))
  if (hostClassification.kind !== 'tenant') return errorRedirect(url.origin, 'hop_wrong_host')

  const tenant = await getTenantDiscordConfig(session.guildId)
  if (!tenant) return errorRedirect(url.origin, 'hop_no_tenant')
  if (tenant.slug !== hostClassification.slug) return errorRedirect(url.origin, 'hop_wrong_host')

  const returnTo =
    hop.returnTo.startsWith('/') && !hop.returnTo.startsWith('//') ? hop.returnTo : '/'

  // Re-sign the session with issuedAt=now so cookie age matches delivery,
  // not the callback's earlier sign. Keeps expiry bookkeeping clean.
  const cookieValue = await signSession({ ...session, issuedAt: Date.now() })
  const response = NextResponse.redirect(new URL(returnTo, url.origin))
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, cookieOptions())

  if (hop.preferredLocale && isLocale(hop.preferredLocale)) {
    response.cookies.set(LOCALE_COOKIE, hop.preferredLocale, {
      path: '/',
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: 'lax',
    })
  }

  return response
}
