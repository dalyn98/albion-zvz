import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  signSession,
  type SessionPayload,
} from '@/lib/session-verify'
import {
  consumeEventGuestRequestBudget,
  hashEventGuestManagementSecret,
  isEventGuestManagementSecret,
} from '@/lib/event-guest-security'

export const dynamic = 'force-dynamic'

const MAX_EXCHANGE_BODY_BYTES = 256

function jsonResponse(
  body: { redirectTo?: string; error?: 'unavailable' },
  status: number,
): NextResponse {
  const response = NextResponse.json(body, { status })
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

function isSameOriginPost(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && fetchSite !== 'same-origin') return false
  if (!origin) return false
  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

async function readManagementSecret(
  request: NextRequest,
): Promise<string | null> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]
  if (contentType !== 'application/json') return null
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_EXCHANGE_BODY_BYTES
  ) {
    return null
  }
  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_EXCHANGE_BODY_BYTES) {
    return null
  }
  try {
    const parsed = JSON.parse(body) as { token?: unknown }
    return typeof parsed.token === 'string' &&
      isEventGuestManagementSecret(parsed.token)
      ? parsed.token
      : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) {
    return jsonResponse({ error: 'unavailable' }, 403)
  }

  const token = await readManagementSecret(request)
  if (!token) return jsonResponse({ error: 'unavailable' }, 400)

  const db = getAdminClient()
  const secretHash = await hashEventGuestManagementSecret(token)
  const { data: grant, error: grantError } = await db
    .from('event_guest_management_grants')
    .select('id, guild_id, event_id, application_id')
    .eq('secret_hash', secretHash)
    .is('revoked_at', null)
    .maybeSingle()
  if (grantError || !grant) {
    return jsonResponse({ error: 'unavailable' }, 404)
  }

  const withinBudget = await consumeEventGuestRequestBudget({
    db,
    headers: request.headers,
    guildId: grant.guild_id,
    eventId: grant.event_id,
    action: 'manage',
    subject: secretHash,
    bucketSeconds: 300,
    limit: 30,
  }).catch(() => false)
  if (!withinBudget) {
    return jsonResponse({ error: 'unavailable' }, 429)
  }

  const [
    { data: application, error: applicationError },
    { data: event, error: eventError },
    { data: tenant, error: tenantError },
  ] = await Promise.all([
    db
      .from('event_guest_applications')
      .select('guest_id')
      .eq('guild_id', grant.guild_id)
      .eq('event_id', grant.event_id)
      .eq('id', grant.application_id)
      .maybeSingle(),
    db
      .from('events')
      .select('id, status')
      .eq('guild_id', grant.guild_id)
      .eq('id', grant.event_id)
      .maybeSingle(),
    db
      .from('tenants')
      .select('id, status')
      .eq('id', grant.guild_id)
      .maybeSingle(),
  ])
  if (
    applicationError ||
    eventError ||
    tenantError ||
    !application ||
    !event ||
    event.status === 'draft' ||
    !tenant ||
    tenant.status !== 'active'
  ) {
    return jsonResponse({ error: 'unavailable' }, 404)
  }

  const [{ data: guest }, { data: revoked }, { data: profile }] =
    await Promise.all([
      db
        .from('guests')
        .select('username, avatar')
        .eq('guild_id', grant.guild_id)
        .eq('discord_id', application.guest_id)
        .maybeSingle(),
      db
        .from('guest_revocations')
        .select('discord_id')
        .eq('guild_id', grant.guild_id)
        .eq('discord_id', application.guest_id)
        .maybeSingle(),
      db
        .from('event_guest_profiles')
        .select('display_name')
        .eq('guild_id', grant.guild_id)
        .eq('event_id', grant.event_id)
        .eq('discord_id', application.guest_id)
        .maybeSingle(),
    ])
  if (!guest || revoked || !profile) {
    return jsonResponse({ error: 'unavailable' }, 404)
  }

  const session: SessionPayload = {
    discordId: application.guest_id,
    username: profile.display_name || guest.username,
    avatar: guest.avatar ?? null,
    isMember: false,
    isAdmin: false,
    isGuest: true,
    isBombSquadCaller: false,
    isLocalGuildAccount: false,
    isAllianceCandidate: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: grant.event_id,
    guildId: grant.guild_id,
    capabilities: '',
    authenticatedAt: 0,
    issuedAt: Date.now(),
  }

  await db
    .from('event_guest_management_grants')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', grant.id)
    .is('revoked_at', null)

  const response = jsonResponse(
    { redirectTo: `/events/${encodeURIComponent(grant.event_id)}` },
    200,
  )
  response.cookies.set(
    SESSION_COOKIE_NAME,
    await signSession(session),
    cookieOptions(),
  )
  return response
}
