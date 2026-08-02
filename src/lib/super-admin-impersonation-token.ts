// Cookie-free support-view token primitives. This split lets Proxy verify the
// signed support-view cookie without importing `next/headers`.

export const IMPERSONATION_COOKIE_NAME = 'super_admin_impersonating'
export const IMPERSONATION_TTL_SECONDS = 60 * 60

export interface ImpersonationPayload {
  tenantId: string
  startedAt: number
}

const UUID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

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
  if (!UUID_PATTERN.test(tenantId)) throw new Error('invalid tenantId')
  const key = await getSigningKey()
  const payload: ImpersonationPayload = { tenantId, startedAt: Date.now() }
  const payloadB64 = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payloadB64),
  )
  return `${payloadB64}.${base64UrlEncode(signature)}`
}

export async function verifyImpersonation(
  cookieValue: string | undefined,
): Promise<ImpersonationPayload | null> {
  if (!cookieValue) return null
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, signatureB64] = parts

  try {
    const key = await getSigningKey()
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(signatureB64),
      new TextEncoder().encode(payloadB64),
    )
    if (!valid) return null

    const parsed = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    ) as Partial<ImpersonationPayload>
    if (
      typeof parsed.tenantId !== 'string' ||
      !UUID_PATTERN.test(parsed.tenantId) ||
      typeof parsed.startedAt !== 'number'
    ) {
      return null
    }
    const ageSeconds = (Date.now() - parsed.startedAt) / 1000
    if (ageSeconds < 0 || ageSeconds > IMPERSONATION_TTL_SECONDS) return null
    return { tenantId: parsed.tenantId, startedAt: parsed.startedAt }
  } catch {
    return null
  }
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
