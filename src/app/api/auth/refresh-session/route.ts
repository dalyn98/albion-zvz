import { NextRequest, NextResponse } from 'next/server'
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  getSession,
  signSession,
  type SessionPayload,
} from '@/lib/session'
import { getTenantDiscordConfig } from '@/lib/tenant'
import { classifyHost } from '@/lib/tenant-resolver'
import { withNoStore } from '@/lib/no-store-response'

const REFRESH_HEADER = 'x-agm-session-refresh'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return withNoStore(NextResponse.json(body, { status }))
}

async function canRefreshOnHost(
  request: NextRequest,
  session: SessionPayload,
): Promise<boolean> {
  if (!session.guildId || session.isGuest || session.isLocalGuildAccount) return false

  const host = request.headers.get('host')
  const classification = classifyHost(host)
  if (classification.kind !== 'tenant') return true

  const tenant = await getTenantDiscordConfig(session.guildId)
  return tenant?.slug === classification.slug
}

export async function POST(request: NextRequest) {
  if (request.headers.get(REFRESH_HEADER) !== '1') {
    return json({ ok: false, error: 'missing_refresh_header' }, 400)
  }

  const session = await getSession()
  if (!session) return json({ ok: false, error: 'unauthorized' }, 401)

  if (!(await canRefreshOnHost(request, session))) {
    return json({ ok: false, error: 'session_not_refreshable' }, 403)
  }

  const refreshedAt = Date.now()
  const response = json({ ok: true, refreshedAt })
  response.cookies.set(
    SESSION_COOKIE_NAME,
    await signSession({ ...session, issuedAt: refreshedAt }),
    cookieOptions(),
  )
  return response
}
