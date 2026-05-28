import { NextRequest, NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/discord'
import { signOAuthState } from '@/lib/oauth-state'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { detectLocaleFromAcceptLanguage } from '@/lib/accept-language'
import {
  DISCORD_REAUTH_COOKIE_NAME,
  clearDiscordReauthCookieOptions,
  shouldUseDiscordConsentPrompt,
} from '@/lib/discord-reauth'
import { recordAuthStart } from '@/lib/auth-telemetry'

function inviteFromReturnTo(returnTo: string): string {
  try {
    return new URL(returnTo, 'https://albion-guildmanager.local').searchParams.get('invite')?.trim() ?? ''
  } catch {
    return ''
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('returnTo') ?? '/'
  // Only accept relative paths so an attacker can't turn this into an open redirect.
  const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  // Guest-invite token carried through the OAuth round-trip so the callback can
  // validate it. Encoded inside the signed state (cookies can't cross the
  // canonical-hop subdomains).
  const invite = url.searchParams.get('invite')?.trim() || inviteFromReturnTo(returnTo)

  // `originHost` lets the callback (running on the canonical domain) decide
  // which tenant subdomain to hop back to, preserving the subdomain the user
  // started from.
  const originHost = request.headers.get('host') ?? ''

  // 데스크탑 일반 로그인 첫 시도는 prompt=none — 이미 동의한 사용자는 Discord
  // 동의 화면 skip. 모바일/인앱 브라우저는 prompt=none 이 빈 화면처럼 멈추는
  // 사례가 있어 모든 경로를 처음부터 명시 consent 로 보낸다.
  const retry = url.searchParams.get('retry') === '1'
  const reauthCookieValue = request.cookies.get(DISCORD_REAUTH_COOKIE_NAME)?.value
  const useConsentPrompt = shouldUseDiscordConsentPrompt({
    retry,
    invite,
    reauthCookieValue,
    returnTo,
    userAgent: request.headers.get('user-agent'),
  })
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
  const response = NextResponse.redirect(
    buildAuthorizeUrl(state, { prompt: useConsentPrompt ? 'consent' : 'none' }),
  )
  recordAuthStart(request, 'discord_oauth', {
    has_invite: invite.length > 0,
    prompt: useConsentPrompt ? 'consent' : 'none',
    return_to: returnTo,
  })
  if (reauthCookieValue) {
    response.cookies.set(DISCORD_REAUTH_COOKIE_NAME, '', clearDiscordReauthCookieOptions())
  }
  return response
}
