import { NextRequest, NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/discord'
import { signOAuthState } from '@/lib/oauth-state'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { detectLocaleFromAcceptLanguage } from '@/lib/accept-language'

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

  // 일반 로그인 첫 시도는 prompt=none — 이미 동의한 사용자는 Discord 동의 화면 skip.
  // 게스트 초대는 모바일/인앱 브라우저에서 prompt=none 이 빈 화면처럼 멈추는
  // 사례가 있어 처음부터 명시 consent 로 보낸다. 초대 링크는 신규/외부 유저
  // 비중이 높아 동의 화면을 한 번 보는 편이 실패율보다 낫다.
  const retry = url.searchParams.get('retry') === '1'
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const preferredLocale = isLocale(cookieLocale)
    ? cookieLocale
    : detectLocaleFromAcceptLanguage(request.headers.get('accept-language'))

  const state = await signOAuthState({
    originHost,
    returnTo,
    invite: invite || null,
    preferredLocale,
  })
  return NextResponse.redirect(
    buildAuthorizeUrl(state, { prompt: retry || invite ? 'consent' : 'none' }),
  )
}
