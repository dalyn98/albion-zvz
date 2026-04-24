import { NextRequest, NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/discord'
import { signOAuthState } from '@/lib/oauth-state'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('returnTo') ?? '/'
  // Only accept relative paths so an attacker can't turn this into an open redirect.
  const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  // Guest-invite token carried through the OAuth round-trip so the callback can
  // validate it. Encoded inside the signed state (cookies can't cross the
  // canonical-hop subdomains).
  const invite = url.searchParams.get('invite')?.trim() ?? ''

  // `originHost` lets the callback (running on the canonical domain) decide
  // which tenant subdomain to hop back to, preserving the subdomain the user
  // started from.
  const originHost = request.headers.get('host') ?? ''

  const state = await signOAuthState({
    originHost,
    returnTo,
    invite: invite || null,
  })
  return NextResponse.redirect(buildAuthorizeUrl(state))
}
