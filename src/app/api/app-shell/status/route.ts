import { NextResponse } from 'next/server'
import { loadAppShellStatus } from '@/lib/app-shell-status'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ adminBadges: null, userStatus: null })
  }

  const guildId = await getSessionGuildId(session)
  const payload = await loadAppShellStatus(guildId, session)
  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}
