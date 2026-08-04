import { NextRequest, NextResponse } from 'next/server'
import { isAlbionServer } from '@/lib/albion-gameinfo'
import {
  AGM_BATTLES_CONNECT_INTENT_COOKIE,
  agmBattlesConnectIntentCookieOptions,
} from '@/lib/agm-battles-connect-intent'
import { signAgmBattlesConnectIntent } from '@/lib/oauth-state'
import { normalizePublicZvzAlbionId } from '@/lib/public-zvz-record-links'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { withNoStore } from '@/lib/no-store-response'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const server = url.searchParams.get('server')
  const guildAlbionId = normalizePublicZvzAlbionId(url.searchParams.get('guild'))
  const rawSource = url.searchParams.get('source') ?? '/zvz-battles'
  const sourcePath = sanitizeInternalReturnTo(rawSource)
  if (
    !isAlbionServer(server) ||
    !guildAlbionId ||
    !sourcePath.startsWith('/zvz-battles/')
  ) {
    return withNoStore(NextResponse.json({ error: 'invalid_connect_intent' }, { status: 400 }))
  }

  const token = await signAgmBattlesConnectIntent({
    server,
    guildAlbionId,
    sourcePath,
  })
  const login = new URL('/login', url.origin)
  login.searchParams.set('returnTo', '/onboard')
  const response = NextResponse.redirect(login)
  response.cookies.set(
    AGM_BATTLES_CONNECT_INTENT_COOKIE,
    token,
    agmBattlesConnectIntentCookieOptions(request.headers.get('host')),
  )
  response.headers.set('referrer-policy', 'no-referrer')
  return withNoStore(response)
}
