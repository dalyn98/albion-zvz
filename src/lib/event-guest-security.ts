import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

const MANAGEMENT_SECRET_BYTES = 32
const MANAGEMENT_SECRET_RE = /^[A-Za-z0-9_-]{40,64}$/

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createEventGuestManagementSecret(): string {
  const bytes = new Uint8Array(MANAGEMENT_SECRET_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

export function isEventGuestManagementSecret(value: string): boolean {
  return MANAGEMENT_SECRET_RE.test(value)
}

export async function hashEventGuestManagementSecret(secret: string): Promise<string> {
  if (!isEventGuestManagementSecret(secret)) throw new Error('invalid_management_secret')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(secret),
  )
  return bytesToHex(new Uint8Array(digest))
}

async function hmacHex(value: string): Promise<string> {
  const secret = process.env.COOKIE_SECRET
  if (!secret) throw new Error('COOKIE_SECRET is not set')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  )
  return bytesToHex(new Uint8Array(digest))
}

function requestConnectionHint(headersList: Headers): string {
  const forwarded = headersList.get('x-forwarded-for')?.split(',')[0]?.trim()
  const connecting =
    forwarded ||
    headersList.get('x-real-ip')?.trim() ||
    headersList.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  const userAgent = headersList.get('user-agent')?.slice(0, 256) ?? 'unknown'
  return `${connecting}\u0000${userAgent}`
}

export async function consumeEventGuestRequestBudget(input: {
  db: SupabaseClient
  headers: Headers
  guildId: string
  eventId: string
  action: 'access' | 'profile' | 'slot' | 'manage' | 'regear'
  subject: string
  bucketSeconds: number
  limit: number
}): Promise<boolean> {
  const scopeHash = await hmacHex([
    'event-guest-rate-v1',
    input.guildId,
    input.eventId,
    input.action,
    input.subject,
    requestConnectionHint(input.headers),
  ].join('\u0000'))
  const { data, error } = await input.db.rpc('consume_event_guest_request_budget', {
    p_guild_id: input.guildId,
    p_event_id: input.eventId,
    p_action: input.action,
    p_scope_hash: scopeHash,
    p_bucket_seconds: input.bucketSeconds,
    p_limit: input.limit,
  })
  if (error) throw new Error(error.message)
  return data === true
}
