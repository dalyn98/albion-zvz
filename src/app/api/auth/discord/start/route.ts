import { NextRequest, NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/discord'

const STATE_COOKIE = 'discord_oauth_state'
const RETURN_TO_COOKIE = 'discord_oauth_return_to'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const requested = url.searchParams.get('returnTo') ?? '/'
  // Only accept relative paths so an attacker can't turn this into an open redirect.
  const returnTo = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  const state = crypto.randomUUID()
  const response = NextResponse.redirect(buildAuthorizeUrl(state))

  const baseCookie = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 10,
  }
  response.cookies.set(STATE_COOKIE, state, baseCookie)
  response.cookies.set(RETURN_TO_COOKIE, returnTo, baseCookie)
  return response
}
