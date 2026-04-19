import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, getGuildMember, identityFromMember } from '@/lib/discord'
import { SESSION_COOKIE_NAME, cookieOptions, signSession } from '@/lib/session'
import { upsertGuildAvatar } from '@/lib/discord-avatar'

const STATE_COOKIE = 'discord_oauth_state'
const RETURN_TO_COOKIE = 'discord_oauth_return_to'

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/', origin)
  url.searchParams.set('auth_error', reason)
  const response = NextResponse.redirect(url)
  response.cookies.delete(STATE_COOKIE)
  response.cookies.delete(RETURN_TO_COOKIE)
  return response
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const discordError = url.searchParams.get('error')

  if (discordError) return errorRedirect(url.origin, 'denied')
  if (!code || !returnedState) return errorRedirect(url.origin, 'invalid')

  const savedState = request.cookies.get(STATE_COOKIE)?.value
  if (!savedState || savedState !== returnedState) {
    return errorRedirect(url.origin, 'state_mismatch')
  }

  try {
    const token = await exchangeCode(code)
    const member = await getGuildMember(token.access_token)
    if (!member) return errorRedirect(url.origin, 'not_in_guild')

    const identity = identityFromMember(member)
    if (!identity) return errorRedirect(url.origin, 'no_identity')
    if (!identity.isMember) return errorRedirect(url.origin, 'no_role')

    const rawReturnTo = request.cookies.get(RETURN_TO_COOKIE)?.value ?? '/'
    const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/'

    // Snapshot the avatar so other members' UIs can resolve it without hitting
    // the Discord API. Failure here shouldn't block login — the avatar map is
    // best-effort and falls back to a default icon when missing.
    try {
      await upsertGuildAvatar(identity.discordId, identity.username, identity.avatar, identity.isAdmin)
    } catch (err) {
      console.error('[discord-callback] upsertGuildAvatar failed', err)
    }

    const sessionCookie = await signSession({
      discordId: identity.discordId,
      username: identity.username,
      avatar: identity.avatar,
      isMember: identity.isMember,
      isAdmin: identity.isAdmin,
      issuedAt: Date.now(),
    })

    const response = NextResponse.redirect(new URL(returnTo, url.origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())
    response.cookies.delete(STATE_COOKIE)
    response.cookies.delete(RETURN_TO_COOKIE)
    return response
  } catch (e) {
    console.error('[discord-callback]', e)
    return errorRedirect(url.origin, 'server_error')
  }
}
