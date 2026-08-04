// Signed short-lived tokens for the canonical OAuth hop.
//
// Three token types, all HMAC-SHA256 signed with COOKIE_SECRET in the same
// `base64url(payloadJson).base64url(signature)` shape as session.ts.
//
//   1. OAuthState — CSRF token passed as `state` to Discord. The signed token
//      carries the originating tenant, while a short-lived per-flow HttpOnly
//      cookie binds it to the browser that started the flow.
//
//   2. BotInstallState — the expected Discord guild (or open-install mode).
//      A separate per-flow HttpOnly intent cookie preserves it for Discord bot
//      callbacks that omit the state query parameter.
//
//   3. HopToken — short-lived token used to hand a freshly minted session
//      from the canonical callback to the tenant subdomain. The tenant
//      subdomain verifies the token, target tenant, and—when both hosts share
//      a cookie domain—the per-flow browser binding before setting a session.
//
// Primitives are duplicated from session.ts rather than extracted, to keep
// session.ts (critical live auth path) untouched.

import type { SessionPayload } from './session'

// 모바일 3G/지하철 같은 느린 연결에서 Discord 인증이 10분을 넘는 케이스가
// 보고됐다. 15분으로 늘려도 nonce + HMAC 으로 재사용 위험은 그대로 막힌다.
const STATE_MAX_AGE_SECONDS = 60 * 15
const AGM_BATTLES_CONNECT_MAX_AGE_SECONDS = 60 * 60 * 24
const HOP_TOKEN_MAX_AGE_SECONDS = 60
const MAX_BOT_INSTALL_INTENT_COOKIES = 16

export const OAUTH_STATE_BINDING_MAX_AGE_SECONDS = STATE_MAX_AGE_SECONDS
export const BOT_INSTALL_INTENT_MAX_AGE_SECONDS = STATE_MAX_AGE_SECONDS
export const HOP_TOKEN_BINDING_MAX_AGE_SECONDS = HOP_TOKEN_MAX_AGE_SECONDS

export interface OAuthStatePayload {
  nonce: string
  originHost: string
  returnTo: string
  // Invite token carried from a guest-invite link on the origin subdomain.
  // Previously held in a cookie; cookies can't cross subdomains during the
  // canonical-hop callback, so it travels inside the signed state.
  invite: string | null
  // Browser/site locale captured before the Discord OAuth redirect. Discord
  // user.locale can differ from the browser language used to open a guest link.
  preferredLocale: string | null
  issuedAt: number
}

export interface HopTokenPayload {
  session: SessionPayload
  returnTo: string
  // Preferred locale carried across the hop so the tenant subdomain's
  // `/api/auth/finish` can set the locale cookie on the correct host.
  preferredLocale: string | null
  // Correlates start → callback → finish without logging state or hop tokens.
  flowId: string
  // Cookie scoping only works when the callback and destination share a
  // registrable domain. This signed policy prevents callers from downgrading a
  // same-domain, browser-bound handoff by simply omitting the binding cookie.
  requiresBrowserBinding: boolean
  issuedAt: number
}

export interface BotInstallStatePayload {
  nonce: string
  expectedGuildId: string | null
  mode: 'guided' | 'open'
  // The site host where the install started. It is signed so a callback that
  // runs on a legacy/canonical host can return failures to the right surface.
  // Null keeps states issued before this field was added backward-compatible.
  originHost: string | null
  issuedAt: number
}

export interface BotInstallIntentMatch {
  token: string
  state: BotInstallStatePayload
}

export interface AgmBattlesConnectIntent {
  server: 'west' | 'east' | 'europe'
  guildAlbionId: string
  sourcePath: string
  issuedAt: number
  expiresAt: number
}

function base64UrlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array<ArrayBuffer> {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)
  const binary = atob(padded)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function getSigningKey(): Promise<CryptoKey> {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET is not set')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function signJson<T>(payload: T): Promise<string> {
  const key = await getSigningKey()
  const json = JSON.stringify(payload)
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(json))
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${base64UrlEncode(sig)}`
}

async function verifyJson<T>(value: string | undefined, maxAgeSeconds: number): Promise<T | null> {
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  try {
    const key = await getSigningKey()
    const sig = base64UrlDecode(sigB64)
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sig,
      new TextEncoder().encode(payloadB64),
    )
    if (!ok) return null
    const json = new TextDecoder().decode(base64UrlDecode(payloadB64))
    const parsed = JSON.parse(json) as T & { issuedAt?: number }
    if (typeof parsed.issuedAt !== 'number') return null
    const ageSeconds = (Date.now() - parsed.issuedAt) / 1000
    if (ageSeconds > maxAgeSeconds) return null
    if (ageSeconds < -30) return null
    return parsed
  } catch {
    return null
  }
}

export async function signOAuthState(input: {
  originHost: string
  returnTo: string
  invite?: string | null
  preferredLocale?: string | null
  nonce?: string
}): Promise<string> {
  const payload: OAuthStatePayload = {
    nonce: input.nonce ?? crypto.randomUUID(),
    originHost: input.originHost,
    returnTo: input.returnTo,
    invite: input.invite ?? null,
    preferredLocale: input.preferredLocale ?? null,
    issuedAt: Date.now(),
  }
  return signJson(payload)
}

export async function verifyOAuthState(value: string | undefined): Promise<OAuthStatePayload | null> {
  const parsed = await verifyJson<OAuthStatePayload>(value, STATE_MAX_AGE_SECONDS)
  if (!parsed) return null
  if (typeof parsed.nonce !== 'string' || typeof parsed.originHost !== 'string' || typeof parsed.returnTo !== 'string') {
    return null
  }
  if (parsed.invite !== null && typeof parsed.invite !== 'string') return null
  if (parsed.preferredLocale !== null && typeof parsed.preferredLocale !== 'string') return null
  return parsed
}

export async function signAgmBattlesConnectIntent(input: {
  server: 'west' | 'east' | 'europe'
  guildAlbionId: string
  sourcePath: string
}): Promise<string> {
  const issuedAt = Date.now()
  return signJson<AgmBattlesConnectIntent>({
    ...input,
    issuedAt,
    expiresAt: issuedAt + AGM_BATTLES_CONNECT_MAX_AGE_SECONDS * 1000,
  })
}

export async function verifyAgmBattlesConnectIntent(
  value: string | undefined,
): Promise<AgmBattlesConnectIntent | null> {
  const parsed = await verifyJson<AgmBattlesConnectIntent>(
    value,
    AGM_BATTLES_CONNECT_MAX_AGE_SECONDS,
  )
  if (!parsed) return null
  if (!['west', 'east', 'europe'].includes(parsed.server)) return null
  if (
    typeof parsed.guildAlbionId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(parsed.guildAlbionId)
  ) return null
  if (
    typeof parsed.sourcePath !== 'string' ||
    !parsed.sourcePath.startsWith('/zvz-battles/') ||
    parsed.sourcePath.length > 512 ||
    /[\u0000-\u001F\u007F]/.test(parsed.sourcePath)
  ) return null
  if (
    typeof parsed.expiresAt !== 'number' ||
    parsed.expiresAt <= Date.now() ||
    parsed.expiresAt - parsed.issuedAt > AGM_BATTLES_CONNECT_MAX_AGE_SECONDS * 1000
  ) return null
  return parsed
}

export async function signBotInstallState(input: {
  expectedGuildId: string | null
  mode: 'guided' | 'open'
  originHost?: string | null
  nonce?: string
}): Promise<string> {
  return signJson<BotInstallStatePayload>({
    nonce: input.nonce ?? crypto.randomUUID(),
    expectedGuildId: input.expectedGuildId,
    mode: input.mode,
    originHost: input.originHost ?? null,
    issuedAt: Date.now(),
  })
}

export async function verifyBotInstallState(
  value: string | undefined,
): Promise<BotInstallStatePayload | null> {
  const parsed = await verifyJson<BotInstallStatePayload>(value, STATE_MAX_AGE_SECONDS)
  if (!parsed) return null
  if (typeof parsed.nonce !== 'string' || parsed.nonce.length === 0) return null
  if (parsed.mode !== 'guided' && parsed.mode !== 'open') return null
  if (
    parsed.originHost !== undefined &&
    parsed.originHost !== null &&
    (
      typeof parsed.originHost !== 'string' ||
      parsed.originHost.length === 0 ||
      parsed.originHost.length > 255 ||
      /[\u0000-\u001F\u007F]/.test(parsed.originHost)
    )
  ) {
    return null
  }
  if (
    parsed.expectedGuildId !== null &&
    (typeof parsed.expectedGuildId !== 'string' || !/^\d{17,20}$/.test(parsed.expectedGuildId))
  ) {
    return null
  }
  if (parsed.mode === 'guided' && parsed.expectedGuildId === null) return null
  if (parsed.mode === 'open' && parsed.expectedGuildId !== null) return null
  return { ...parsed, originHost: parsed.originHost ?? null }
}

// Discord has historically omitted `state` from some advanced bot-install
// callbacks. Each start is stored in its own HttpOnly cookie, so parallel
// responses cannot overwrite one another. When state is absent, select the
// matching signed intent from the bounded cookie set using Discord's
// authoritative guild response.
export async function resolveBotInstallIntent(
  stateTokens: readonly string[],
  selector: {
    returnedState?: string | null
    guildId?: string | null
  },
): Promise<BotInstallIntentMatch | null> {
  const candidates = selector.returnedState
    ? stateTokens.filter((token) => token === selector.returnedState)
    : stateTokens.slice(-MAX_BOT_INSTALL_INTENT_COOKIES)
  const verified = await Promise.all(
    candidates.map(async (token) => ({
      token,
      state: await verifyBotInstallState(token),
    })),
  )
  const intents = verified
    .filter(
      (intent): intent is BotInstallIntentMatch => intent.state !== null,
    )
    .sort((a, b) => a.state.issuedAt - b.state.issuedAt)

  if (intents.length === 0) return null

  if (selector.returnedState) {
    return intents.at(-1) ?? null
  }

  if (selector.guildId) {
    for (let index = intents.length - 1; index >= 0; index -= 1) {
      if (intents[index].state.expectedGuildId === selector.guildId) {
        return intents[index]
      }
    }
    for (let index = intents.length - 1; index >= 0; index -= 1) {
      if (intents[index].state.mode === 'open') return intents[index]
    }
    return null
  }

  return intents.at(-1) ?? null
}

export async function signHopToken(input: {
  session: SessionPayload
  returnTo: string
  preferredLocale?: string | null
  flowId?: string
  requiresBrowserBinding: boolean
}): Promise<string> {
  const payload: HopTokenPayload = {
    session: input.session,
    returnTo: input.returnTo,
    preferredLocale: input.preferredLocale ?? null,
    flowId: input.flowId ?? crypto.randomUUID(),
    requiresBrowserBinding: input.requiresBrowserBinding,
    issuedAt: Date.now(),
  }
  return signJson(payload)
}

export async function verifyHopToken(value: string | undefined): Promise<HopTokenPayload | null> {
  const parsed = await verifyJson<HopTokenPayload>(value, HOP_TOKEN_MAX_AGE_SECONDS)
  if (!parsed) return null
  if (!parsed.session || typeof parsed.returnTo !== 'string') return null
  if (parsed.preferredLocale !== null && typeof parsed.preferredLocale !== 'string') return null
  if (typeof parsed.flowId !== 'string' || parsed.flowId.length === 0) return null
  if (typeof parsed.requiresBrowserBinding !== 'boolean') return null
  return parsed
}
