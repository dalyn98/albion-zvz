import { after, NextRequest, NextResponse } from 'next/server'
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
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { recordSeoAttributionEventFromRequest } from '@/lib/seo-attribution'
import { withNoStore } from '@/lib/no-store-response'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  buildCanonicalAuthBindingBridgeUrl,
  oauthStateBindingCookieName,
  oauthStateBindingCookieOptions,
} from '@/lib/auth-flow-cookie'

function inviteFromReturnTo(returnTo: string): string {
  try {
    return new URL(returnTo, 'https://albion-guildmanager.local').searchParams.get('invite')?.trim() ?? ''
  } catch {
    return ''
  }
}

function normalizeInvite(value: string | null | undefined): string {
  const invite = value?.trim() ?? ''
  if (invite.length === 0 || invite.length > 512) return ''
  if (/[\u0000-\u001F\u007F]/.test(invite)) return ''
  return invite
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('returnTo') ?? '/'
  // Only accept in-app page paths so an attacker can't turn this into an open
  // redirect or bounce users into internal API endpoints after login.
  const returnTo = sanitizeInternalReturnTo(requested)

  // Guest-invite token carried through the OAuth round-trip so the callback can
  // validate it. Encoded inside the signed state (cookies can't cross the
  // canonical-hop subdomains).
  const invite = normalizeInvite(
    url.searchParams.get('invite') || inviteFromReturnTo(returnTo),
  )

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
    returnTo,
    userAgent: request.headers.get('user-agent'),
  })
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value
  const preferredLocale = isLocale(cookieLocale)
    ? cookieLocale
    : detectLocaleFromAcceptLanguage(request.headers.get('accept-language'))

  const flowId = crypto.randomUUID()
  const state = await signOAuthState({
    originHost,
    returnTo,
    invite: invite || null,
    preferredLocale,
    nonce: flowId,
  })
  const prompt = useConsentPrompt ? 'consent' : 'none'
  const bindingBridge = buildCanonicalAuthBindingBridgeUrl(request.url, {
    kind: 'user',
    state,
    prompt,
  })
  const response = NextResponse.redirect(
    bindingBridge ?? buildAuthorizeUrl(state, { prompt }),
  )
  response.headers.set('referrer-policy', 'no-referrer')
  if (!bindingBridge) {
    response.cookies.set(
      oauthStateBindingCookieName(flowId),
      AUTH_FLOW_BINDING_COOKIE_VALUE,
      oauthStateBindingCookieOptions(request.headers.get('host')),
    )
  }
  recordAuthStart(request, 'discord_oauth', {
    flow_id: flowId,
    has_invite: invite.length > 0,
    prompt: useConsentPrompt ? 'consent' : 'none',
    return_to: returnTo,
  })
  after(async () => {
    await recordSeoAttributionEventFromRequest(request, {
      eventType: 'discord_oauth_start',
      target: '/api/auth/discord/start',
    })
  })
  // Legacy logout cookies used to force prompt=consent on the next login.
  // Clear them opportunistically, but keep regular desktop relogin on the
  // fast prompt=none path unless the caller explicitly passed retry=1.
  if (reauthCookieValue) {
    response.cookies.set(DISCORD_REAUTH_COOKIE_NAME, '', clearDiscordReauthCookieOptions())
  }
  return withNoStore(response)
}
