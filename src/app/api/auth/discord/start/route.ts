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

  // 첫 시도는 prompt=none — 이미 동의한 사용자는 Discord 동의 화면 skip.
  // callback 이 error=consent_required 를 받으면 retry=1 로 다시 와서
  // prompt=consent 로 명시 동의 화면을 띄운다 (신규 사용자 1회).
  const retry = url.searchParams.get('retry') === '1'

  const state = await signOAuthState({
    originHost,
    returnTo,
    invite: invite || null,
  })
  return NextResponse.redirect(
    buildAuthorizeUrl(state, { prompt: retry ? 'consent' : 'none' }),
  )
}
