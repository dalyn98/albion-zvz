// Signed session cookie for Discord-identified users.
//
// We keep a small JSON payload (Discord ID, display name, avatar, role flags,
// issuedAt) directly in the cookie, HMAC-SHA256 signed with COOKIE_SECRET.
// This avoids a DB/session store and works fine in Edge runtime — same
// shape as the old admin token, just carrying more fields.
//
// Format: `base64url(payloadJson).base64url(signatureBytes)`

import { cookies } from 'next/headers'

export const SESSION_COOKIE_NAME = 'user_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export interface SessionPayload {
  discordId: string
  username: string
  avatar: string | null
  isMember: boolean
  isAdmin: boolean
  isGuest: boolean
  // Admin 이거나 app_setting 의 event_creator_role_ids 중 하나를 가진 구성원.
  // 로그인 시점에 계산되므로 역할 리스트 변경은 재로그인 후 반영된다.
  canCreateEvents: boolean
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

export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getSigningKey()
  const json = JSON.stringify(payload)
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(json))
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${base64UrlEncode(sig)}`
}

export async function verifySession(cookieValue: string | undefined): Promise<SessionPayload | null> {
  if (!cookieValue) return null
  const parts = cookieValue.split('.')
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
    const parsed = JSON.parse(json) as Partial<SessionPayload> & { issuedAt: number }
    // Expire server-side too — cookie maxAge is client hint, not enforcement.
    const ageSeconds = (Date.now() - parsed.issuedAt) / 1000
    if (ageSeconds > SESSION_MAX_AGE_SECONDS) return null
    // Legacy cookies issued before isGuest / canCreateEvents were added default
    // to safe values — admins always retain the capability so their old
    // sessions keep working without forcing a re-login.
    const isAdmin = parsed.isAdmin ?? false
    return {
      discordId: parsed.discordId ?? '',
      username: parsed.username ?? '',
      avatar: parsed.avatar ?? null,
      isMember: parsed.isMember ?? false,
      isAdmin,
      isGuest: parsed.isGuest ?? false,
      canCreateEvents: parsed.canCreateEvents ?? isAdmin,
      issuedAt: parsed.issuedAt,
    }
  } catch {
    return null
  }
}

// Convenience for server components / actions running inside a request.
export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  return verifySession(store.get(SESSION_COOKIE_NAME)?.value)
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  }
}
