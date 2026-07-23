import { NextRequest, NextResponse } from 'next/server'
import {
  buildAuthorizeUrl,
  buildBotInstallUrl,
  buildOpenBotInstallUrl,
} from '@/lib/discord'
import {
  signBotInstallState,
  signOAuthState,
  verifyBotInstallState,
  verifyOAuthState,
} from '@/lib/oauth-state'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  botInstallIntentCookieName,
  botInstallIntentCookieOptions,
  oauthStateBindingCookieName,
  oauthStateBindingCookieOptions,
} from '@/lib/auth-flow-cookie'
import { buildLoginEntryHref } from '@/lib/login-entry'
import { withNoStore } from '@/lib/no-store-response'

export const dynamic = 'force-dynamic'

function protectedRedirect(response: NextResponse): NextResponse {
  response.headers.set('referrer-policy', 'no-referrer')
  return withNoStore(response)
}

function invalidUserState(origin: string): NextResponse {
  return protectedRedirect(NextResponse.redirect(new URL(buildLoginEntryHref({
    returnTo: '/',
    authError: 'state_mismatch',
  }), origin)))
}

function invalidBotState(origin: string): NextResponse {
  return protectedRedirect(
    NextResponse.redirect(new URL('/invite/open?install_error=state_mismatch', origin)),
  )
}

function canonicalizeBridgeRequest(url: URL): NextResponse | null {
  const appUrl = process.env.APP_URL
  if (!appUrl) return null
  try {
    const canonical = new URL(appUrl)
    if (canonical.origin === url.origin) return null
    const target = new URL(url.pathname + url.search, canonical.origin)
    return protectedRedirect(NextResponse.redirect(target))
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const canonicalRedirect = canonicalizeBridgeRequest(url)
  if (canonicalRedirect) return canonicalRedirect

  const kind = url.searchParams.get('kind')
  const state = url.searchParams.get('state')
  if (!state) {
    return kind === 'bot'
      ? invalidBotState(url.origin)
      : invalidUserState(url.origin)
  }

  const finalFlowId = crypto.randomUUID()
  let discordUrl: string
  let finalState: string
  if (kind === 'user') {
    const payload = await verifyOAuthState(state)
    if (!payload) return invalidUserState(url.origin)
    finalState = await signOAuthState({
      originHost: payload.originHost,
      returnTo: payload.returnTo,
      invite: payload.invite,
      preferredLocale: payload.preferredLocale,
      nonce: finalFlowId,
    })
    const prompt = url.searchParams.get('prompt') === 'consent' ? 'consent' : 'none'
    discordUrl = buildAuthorizeUrl(finalState, { prompt })
  } else if (kind === 'bot') {
    const payload = await verifyBotInstallState(state)
    if (!payload) return invalidBotState(url.origin)
    finalState = await signBotInstallState({
      expectedGuildId: payload.expectedGuildId,
      mode: payload.mode,
      originHost: payload.originHost,
      nonce: finalFlowId,
    })
    discordUrl = payload.mode === 'guided' && payload.expectedGuildId
      ? buildBotInstallUrl({ guildId: payload.expectedGuildId, state: finalState })
      : buildOpenBotInstallUrl({ state: finalState })
  } else {
    return invalidUserState(url.origin)
  }

  const response = NextResponse.redirect(discordUrl)
  response.headers.set('referrer-policy', 'no-referrer')
  if (kind === 'bot') {
    response.cookies.set(
      botInstallIntentCookieName(finalFlowId),
      finalState,
      botInstallIntentCookieOptions(request.headers.get('host')),
    )
  } else {
    response.cookies.set(
      oauthStateBindingCookieName(finalFlowId),
      AUTH_FLOW_BINDING_COOKIE_VALUE,
      oauthStateBindingCookieOptions(request.headers.get('host')),
    )
  }
  return protectedRedirect(response)
}
