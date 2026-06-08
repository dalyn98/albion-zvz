import { NextResponse, type NextRequest } from 'next/server'
import { withNoStore } from '@/lib/no-store-response'
import {
  SEO_SESSION_COOKIE,
  isClientSeoAttributionEventType,
  recordClientSeoAttributionEvent,
  seoSessionCookieOptions,
} from '@/lib/seo-attribution'

type TrackErrorCode =
  | 'forbidden_origin'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'unsupported_event'

const MAX_BODY_BYTES = 4096

function json(
  body: { ok: true } | { ok: false; code: TrackErrorCode },
  status: number,
): NextResponse {
  return withNoStore(NextResponse.json(body, { status }))
}

function isSameOriginRequest(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

function hasOversizedBody(request: NextRequest): boolean {
  const raw = request.headers.get('content-length')
  if (!raw) return false
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > MAX_BODY_BYTES
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(request)) return json({ ok: false, code: 'forbidden_origin' }, 403)
  if (hasOversizedBody(request)) return json({ ok: false, code: 'payload_too_large' }, 413)

  const payload = (await request.json().catch(() => null)) as {
    eventType?: unknown
    path?: unknown
    referrer?: unknown
    target?: unknown
  } | null
  if (!payload || typeof payload.path !== 'string') {
    return json({ ok: false, code: 'invalid_payload' }, 400)
  }
  if (!isClientSeoAttributionEventType(payload.eventType)) {
    return json({ ok: false, code: 'unsupported_event' }, 400)
  }

  const attributionPayload = {
    eventType: payload.eventType,
    path: payload.path,
    ...(typeof payload.referrer === 'string' ? { referrer: payload.referrer } : {}),
    ...(typeof payload.target === 'string' ? { target: payload.target } : {}),
  }
  const result = await recordClientSeoAttributionEvent(request, attributionPayload)
  if (!result.ok) return json({ ok: false, code: result.code }, result.status)

  const response = json({ ok: true }, 200)
  response.cookies.set(
    SEO_SESSION_COOKIE,
    result.visitorId,
    seoSessionCookieOptions(request.headers.get('host')),
  )
  return response
}
