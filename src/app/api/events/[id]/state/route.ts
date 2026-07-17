import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { resolvePublicEventPageGuildId } from '@/lib/event-guest-auth'
import {
  parseEventStateSnapshot,
  shouldPollEventSnapshot,
} from '@/lib/event-state-snapshot'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const [{ id }, headersList, session] = await Promise.all([
    params,
    headers(),
    getSession(),
  ])
  const url = new URL(request.url)
  const inviteToken = url.searchParams.get('invite')?.trim() || null
  const db = getAdminClient()
  const [sessionGuildId, publicGuildId] = await Promise.all([
    session ? getSessionGuildId(session) : Promise.resolve(null),
    resolvePublicEventPageGuildId(db, {
      eventId: id,
      inviteToken,
      hostHeader: headersList.get('host'),
    }),
  ])
  const guildId = publicGuildId ?? sessionGuildId
  if (!guildId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { data, error } = await db.rpc('get_event_state_snapshot', {
    p_guild_id: guildId,
    p_event_id: id,
  })
  const snapshot = parseEventStateSnapshot(data)
  if (error || !snapshot) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json(
    {
      fingerprint: snapshot.fingerprint,
      shouldPoll: shouldPollEventSnapshot(snapshot),
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  )
}
