// Signed short-lived tokens for the canonical OAuth hop.
//
// Two token types, both HMAC-SHA256 signed with COOKIE_SECRET in the same
// `base64url(payloadJson).base64url(signature)` shape as session.ts.
//
//   1. OAuthState — stateless CSRF token passed as `state` to Discord.
//      Replaces a state cookie, which cannot cross subdomains. Encodes the
//      originating tenant subdomain so the callback (which runs on the
//      canonical domain) knows where to hop back to.
//
//   2. HopToken — one-time token used to hand a freshly minted session
//      from the canonical callback to the tenant subdomain. The tenant
//      subdomain verifies the token and sets the session cookie on its
//      own host, so the cookie lives under the correct subdomain.
//
// Primitives are duplicated from session.ts rather than extracted, to keep
// session.ts (critical live auth path) untouched.

import type { SessionPayload } from './session'

// 모바일 3G/지하철 같은 느린 연결에서 Discord 인증이 10분을 넘는 케이스가
// 보고됐다. 15분으로 늘려도 nonce + HMAC 으로 재사용 위험은 그대로 막힌다.
const STATE_MAX_AGE_SECONDS = 60 * 15
const HOP_TOKEN_MAX_AGE_SECONDS = 60

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
  issuedAt: number
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
}): Promise<string> {
  const payload: OAuthStatePayload = {
    nonce: crypto.randomUUID(),
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

export async function signHopToken(input: {
  session: SessionPayload
  returnTo: string
  preferredLocale?: string | null
}): Promise<string> {
  const payload: HopTokenPayload = {
    session: input.session,
    returnTo: input.returnTo,
    preferredLocale: input.preferredLocale ?? null,
    issuedAt: Date.now(),
  }
  return signJson(payload)
}

export async function verifyHopToken(value: string | undefined): Promise<HopTokenPayload | null> {
  const parsed = await verifyJson<HopTokenPayload>(value, HOP_TOKEN_MAX_AGE_SECONDS)
  if (!parsed) return null
  if (!parsed.session || typeof parsed.returnTo !== 'string') return null
  if (parsed.preferredLocale !== null && typeof parsed.preferredLocale !== 'string') return null
  return parsed
}
