import { NextResponse, type NextRequest } from 'next/server'
import { getAppSetting } from '@/lib/app-settings'
import { withNoStore } from '@/lib/no-store-response'
import { getSession, type SessionPayload } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSessionGuildId } from '@/lib/tenant'
import { parseUxTelemetryPayload } from '@/lib/ux-telemetry'

const MAX_BODY_BYTES = 4096
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_EVENTS = 60

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

function json(body: { ok: false; code: string }, status: number): NextResponse {
  return withNoStore(NextResponse.json(body, { status }))
}

function empty(status: number): NextResponse {
  return withNoStore(new NextResponse(null, { status }))
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

function hasOversizedBody(request: NextRequest): boolean {
  const raw = request.headers.get('content-length')
  if (!raw) return false
  const size = Number.parseInt(raw, 10)
  return Number.isFinite(size) && size > MAX_BODY_BYTES
}

function actorKind(session: SessionPayload): 'admin' | 'member' | 'guest' | 'local' {
  if (session.isAdmin) return 'admin'
  if (session.isLocalGuildAccount) return 'local'
  if (session.isGuest) return 'guest'
  return 'member'
}

function consumeRateLimit(key: string, now = Date.now()): boolean {
  const bucket = rateLimitBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (bucket.count >= RATE_LIMIT_MAX_EVENTS) return false
  bucket.count += 1
  return true
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) return json({ ok: false, code: 'forbidden_origin' }, 403)
  if (hasOversizedBody(request)) return json({ ok: false, code: 'payload_too_large' }, 413)

  const session = await getSession()
  if (!session) return json({ ok: false, code: 'unauthorized' }, 401)

  const guildId = await getSessionGuildId(session)
  const refreshEnabled = await getAppSetting('ux_refresh_v2_enabled', 'false', guildId)
  if (refreshEnabled !== 'true') return empty(204)

  const payload = parseUxTelemetryPayload(await request.json().catch(() => null))
  if (!payload) return json({ ok: false, code: 'invalid_payload' }, 400)
  if (!consumeRateLimit(`${guildId}:${payload.flowId}`)) {
    return json({ ok: false, code: 'rate_limited' }, 429)
  }

  const { error } = await getAdminClient()
    .from('ux_events')
    .insert({
      guild_id: guildId,
      flow_id: payload.flowId,
      actor_kind: actorKind(session),
      event_type: payload.eventType,
      surface: payload.surface,
      elapsed_ms: payload.elapsedMs ?? null,
      metadata: payload.metadata,
    })

  if (error) return json({ ok: false, code: 'write_failed' }, 503)
  return empty(202)
}
