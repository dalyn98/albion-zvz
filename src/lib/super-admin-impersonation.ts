// 슈퍼어드민 임퍼소네이션 ("이 길드 어드민으로 보기").
//
// 본 시스템은 별도 서명 쿠키 `super_admin_impersonating` 으로 작동한다 — 세션
// 쿠키의 guildId 를 직접 덮어쓰지 않고, getSessionGuildId() 에서 임퍼소네이션
// 쿠키가 있으면 우선시한다. 슈퍼어드민이 아닌 경우 쿠키는 무시된다 (방어적 검증).
//
// 쿠키 페이로드: { tenantId, startedAt }. HMAC-SHA256 서명, 단명 (1시간 TTL).
// 임퍼소네이션은 의도적으로 짧게 — 잊고 떠나는 사고 방지.

import { cookies } from 'next/headers'

export const IMPERSONATION_COOKIE_NAME = 'super_admin_impersonating'
const IMPERSONATION_TTL_SECONDS = 60 * 60

interface ImpersonationPayload {
  tenantId: string
  startedAt: number
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

export async function signImpersonation(tenantId: string): Promise<string> {
  const key = await getSigningKey()
  const payload: ImpersonationPayload = { tenantId, startedAt: Date.now() }
  const json = JSON.stringify(payload)
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(json))
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${base64UrlEncode(sig)}`
}

export async function verifyImpersonation(
  cookieValue: string | undefined,
): Promise<ImpersonationPayload | null> {
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
    const parsed = JSON.parse(json) as Partial<ImpersonationPayload> & { startedAt: number }
    if (typeof parsed.tenantId !== 'string' || typeof parsed.startedAt !== 'number') return null
    const ageSeconds = (Date.now() - parsed.startedAt) / 1000
    if (ageSeconds > IMPERSONATION_TTL_SECONDS) return null
    return { tenantId: parsed.tenantId, startedAt: parsed.startedAt }
  } catch {
    return null
  }
}

export async function getImpersonationFromCookies(): Promise<ImpersonationPayload | null> {
  const store = await cookies()
  return verifyImpersonation(store.get(IMPERSONATION_COOKIE_NAME)?.value)
}

export function impersonationCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    maxAge: IMPERSONATION_TTL_SECONDS,
    path: '/',
  }
}
