import { NextResponse, type NextRequest } from 'next/server'
import { withNoStore } from '@/lib/no-store-response'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import {
  isTenantOnboardingEventType,
  logTenantOnboardingEvent,
  type TenantOnboardingEventType,
} from '@/lib/tenant-onboarding-events'

type TrackErrorCode =
  | 'unauthorized'
  | 'forbidden_origin'
  | 'invalid_payload'
  | 'unsupported_event'

const CLIENT_TRACKABLE_EVENTS = new Set<TenantOnboardingEventType>([
  'member_invite_copied',
])

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession()
  if (!session?.isAdmin) return json({ ok: false, code: 'unauthorized' }, 401)
  if (!isSameOriginRequest(request)) return json({ ok: false, code: 'forbidden_origin' }, 403)

  const payload = (await request.json().catch(() => null)) as {
    eventType?: unknown
  } | null
  if (!payload || !isTenantOnboardingEventType(payload.eventType)) {
    return json({ ok: false, code: 'invalid_payload' }, 400)
  }
  if (!CLIENT_TRACKABLE_EVENTS.has(payload.eventType)) {
    return json({ ok: false, code: 'unsupported_event' }, 400)
  }

  const guildId = await getSessionGuildId(session)
  await logTenantOnboardingEvent({
    guildId,
    actorDiscordId: session.discordId,
    eventType: payload.eventType,
    details: {},
  })

  return json({ ok: true }, 200)
}
