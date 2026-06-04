import { NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME } from '@/lib/session'
import { DISCORD_REAUTH_COOKIE_NAME, discordReauthCookieOptions } from '@/lib/discord-reauth'
import { withNoStore } from '@/lib/no-store-response'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const response = NextResponse.redirect(new URL('/', url.origin), { status: 303 })
  response.cookies.delete(SESSION_COOKIE_NAME)
  response.cookies.set(DISCORD_REAUTH_COOKIE_NAME, '1', discordReauthCookieOptions())
  return withNoStore(response)
}
