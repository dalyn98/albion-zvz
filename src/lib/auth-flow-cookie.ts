import { getLocaleCookieDomain } from '@/lib/locale-cookie'
import {
  BOT_INSTALL_INTENT_MAX_AGE_SECONDS,
  HOP_TOKEN_BINDING_MAX_AGE_SECONDS,
  OAUTH_STATE_BINDING_MAX_AGE_SECONDS,
} from '@/lib/oauth-state'

export const OAUTH_STATE_BINDING_COOKIE_PREFIX = 'agm_oauth_state_'
export const BOT_INSTALL_INTENT_COOKIE_PREFIX = 'agm_bot_install_'
export const HOP_TOKEN_BINDING_COOKIE_PREFIX = 'agm_auth_hop_'
export const AUTH_FLOW_BINDING_COOKIE_VALUE = '1'

const AUTH_FLOW_COOKIE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

interface AuthFlowCookieReader {
  get(name: string): { value: string } | undefined
  getAll(): Array<{ name: string; value: string }>
}

function flowCookieName(prefix: string, flowId: string): string {
  if (!AUTH_FLOW_COOKIE_ID_PATTERN.test(flowId)) {
    throw new Error('Invalid auth flow cookie id')
  }
  return `${prefix}${flowId}`
}

export function oauthStateBindingCookieName(flowId: string): string {
  return flowCookieName(OAUTH_STATE_BINDING_COOKIE_PREFIX, flowId)
}

export function botInstallIntentCookieName(flowId: string): string {
  return flowCookieName(BOT_INSTALL_INTENT_COOKIE_PREFIX, flowId)
}

export function hopTokenBindingCookieName(flowId: string): string {
  return flowCookieName(HOP_TOKEN_BINDING_COOKIE_PREFIX, flowId)
}

export function hasOAuthStateBindingCookie(
  cookies: AuthFlowCookieReader,
  flowId: string,
): boolean {
  return (
    cookies.get(oauthStateBindingCookieName(flowId))?.value ===
    AUTH_FLOW_BINDING_COOKIE_VALUE
  )
}

export function hasHopTokenBindingCookie(
  cookies: AuthFlowCookieReader,
  flowId: string,
): boolean {
  return (
    cookies.get(hopTokenBindingCookieName(flowId))?.value ===
    AUTH_FLOW_BINDING_COOKIE_VALUE
  )
}

export function getBotInstallIntentCookieValues(
  cookies: AuthFlowCookieReader,
): string[] {
  return cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith(BOT_INSTALL_INTENT_COOKIE_PREFIX))
    .map((cookie) => cookie.value)
}

function normalizedHostname(host: string | null | undefined): string | null {
  if (!host) return null
  try {
    return new URL(`http://${host}`).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function canShareAuthBindingCookie(
  sourceHost: string | null | undefined,
  targetUrl: string | URL,
): boolean {
  try {
    const target = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl
    const sourceHostname = normalizedHostname(sourceHost)
    if (!sourceHostname) return false
    if (sourceHostname === target.hostname.toLowerCase()) return true

    const sourceDomain = getLocaleCookieDomain(sourceHost)
    const targetDomain = getLocaleCookieDomain(target.host)
    return Boolean(sourceDomain && targetDomain && sourceDomain === targetDomain)
  } catch {
    return false
  }
}

export function buildCanonicalAuthBindingBridgeUrl(
  requestUrl: string,
  input: {
    kind: 'user' | 'bot'
    state: string
    prompt?: 'none' | 'consent'
  },
): string | null {
  const appUrl = process.env.APP_URL
  if (!appUrl) return null

  try {
    const request = new URL(requestUrl)
    const canonical = new URL(appUrl)
    if (request.origin === canonical.origin) return null
    if (canShareAuthBindingCookie(request.host, canonical)) return null

    const bridge = new URL('/api/auth/discord/bind', canonical.origin)
    bridge.searchParams.set('kind', input.kind)
    bridge.searchParams.set('state', input.state)
    if (input.prompt) bridge.searchParams.set('prompt', input.prompt)
    return bridge.toString()
  } catch {
    return null
  }
}

function bindingCookieOptions(
  host: string | null | undefined,
  maxAge: number,
) {
  const domain = getLocaleCookieDomain(host)
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    // Per-flow cookies are disposable recovery bindings. Keep them lower
    // priority than the durable session cookie if a browser reaches its
    // per-domain cookie limit.
    priority: 'low' as const,
    ...(domain ? { domain } : {}),
  }
}

export function oauthStateBindingCookieOptions(host: string | null | undefined) {
  return bindingCookieOptions(host, OAUTH_STATE_BINDING_MAX_AGE_SECONDS)
}

export function botInstallIntentCookieOptions(host: string | null | undefined) {
  return bindingCookieOptions(host, BOT_INSTALL_INTENT_MAX_AGE_SECONDS)
}

export function hopTokenBindingCookieOptions(host: string | null | undefined) {
  return bindingCookieOptions(host, HOP_TOKEN_BINDING_MAX_AGE_SECONDS)
}

export function expiredOAuthStateBindingCookieOptions(host: string | null | undefined) {
  return { ...oauthStateBindingCookieOptions(host), maxAge: 0 }
}

export function expiredBotInstallIntentCookieOptions(host: string | null | undefined) {
  return { ...botInstallIntentCookieOptions(host), maxAge: 0 }
}

export function expiredHopTokenBindingCookieOptions(host: string | null | undefined) {
  return { ...hopTokenBindingCookieOptions(host), maxAge: 0 }
}
