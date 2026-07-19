import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { canUseAllianceEventFeaturesForSession } from '@/lib/albion-identity'
import {
  parseEventStateSnapshot,
  shouldPollEventSnapshot,
} from '@/lib/event-state-snapshot'
import {
  checkEventStateRateLimit,
  parseEventStateId,
} from '@/lib/event-state-rate-limit'

const PRIVATE_NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
}

function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: 'not_found' },
    { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
  )
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id: rawId }, headersList, session] = await Promise.all([
    params,
    headers(),
    getSession(),
  ])
  const id = parseEventStateId(rawId)
  if (!id) {
    return notFoundResponse()
  }
  if (!session) {
    return notFoundResponse()
  }
  if (session.isGuest && session.eventScope !== id) {
    return notFoundResponse()
  }
  const rateLimit = checkEventStateRateLimit({
    eventId: id,
    requestHeaders: headersList,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'rate_limited' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0',
          'Retry-After': String(rateLimit.retryAfterSeconds),
        },
      },
    )
  }
  const guildId = await getSessionGuildId(session)
  const hasDirectEventAccess =
    session.isMember ||
    session.isAdmin ||
    session.isGuest ||
    session.isBombSquadCaller ||
    session.isLocalGuildAccount
  const hasAllianceEventAccess =
    !hasDirectEventAccess &&
    session.isAllianceCandidate &&
    await canUseAllianceEventFeaturesForSession(session.discordId, guildId)
  if (!hasDirectEventAccess && !hasAllianceEventAccess) {
    return notFoundResponse()
  }

  const db = getAdminClient()
  const { data, error } = await db.rpc('get_event_state_snapshot', {
    p_guild_id: guildId,
    p_event_id: id,
  })
  if (error) {
    return NextResponse.json(
      { error: 'temporarily_unavailable' },
      {
        status: 503,
        headers: PRIVATE_NO_STORE_HEADERS,
      },
    )
  }
  const snapshot = parseEventStateSnapshot(data)
  if (!snapshot) {
    return notFoundResponse()
  }

  return NextResponse.json(
    {
      fingerprint: snapshot.fingerprint,
      shouldPoll: shouldPollEventSnapshot(snapshot),
    },
    {
      headers: PRIVATE_NO_STORE_HEADERS,
    },
  )
}
