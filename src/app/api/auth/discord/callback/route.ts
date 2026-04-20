import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCode,
  getCurrentUser,
  getDiscordConfig,
  getGuildMember,
} from '@/lib/discord'
import { SESSION_COOKIE_NAME, cookieOptions, signSession } from '@/lib/session'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'

const STATE_COOKIE = 'discord_oauth_state'
const RETURN_TO_COOKIE = 'discord_oauth_return_to'
const INVITE_COOKIE = 'guest_invite'

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/', origin)
  url.searchParams.set('auth_error', reason)
  const response = NextResponse.redirect(url)
  response.cookies.delete(STATE_COOKIE)
  response.cookies.delete(RETURN_TO_COOKIE)
  response.cookies.delete(INVITE_COOKIE)
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
    // member may be null (user not in guild) — guests can still log in.
    const [member, user] = await Promise.all([
      getGuildMember(token.access_token),
      getCurrentUser(token.access_token),
    ])
    if (!user) return errorRedirect(url.origin, 'no_identity')

    const { memberRoleIds, adminRoleIds } = getDiscordConfig()
    const roles = new Set(member?.roles ?? [])
    const isAdmin = adminRoleIds.some((id) => roles.has(id))
    const isMember = memberRoleIds.some((id) => roles.has(id)) || isAdmin
    // Server nick wins, then global_name, then raw username.
    const displayName = member?.nick || user.global_name || user.username

    const rawReturnTo = request.cookies.get(RETURN_TO_COOKIE)?.value ?? '/'
    const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/'

    if (isMember) {
      try {
        await upsertGuildAvatar(user.id, displayName, user.avatar, isAdmin)
      } catch (err) {
        console.error('[discord-callback] upsertGuildAvatar failed', err)
      }
      const sessionCookie = await signSession({
        discordId: user.id,
        username: displayName,
        avatar: user.avatar,
        isMember: true,
        isAdmin,
        isGuest: false,
        issuedAt: Date.now(),
      })
      const response = NextResponse.redirect(new URL(returnTo, url.origin))
      response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())
      response.cookies.delete(STATE_COOKIE)
      response.cookies.delete(RETURN_TO_COOKIE)
      response.cookies.delete(INVITE_COOKIE)
      return response
    }

    // Guest path: either already registered, or presenting a valid invite cookie.
    const db = getAdminClient()
    const { data: existingGuest } = await db
      .from('guests')
      .select('discord_id')
      .eq('discord_id', user.id)
      .maybeSingle()

    let canGuest = !!existingGuest
    if (canGuest) {
      // Refresh display fields so guest list stays current.
      await db
        .from('guests')
        .update({ username: displayName, avatar: user.avatar })
        .eq('discord_id', user.id)
    } else {
      const inviteCookie = request.cookies.get(INVITE_COOKIE)?.value
      if (inviteCookie) {
        const currentToken = await getAppSetting('guest_invite_token', '')
        if (currentToken && inviteCookie === currentToken) {
          const { error } = await db
            .from('guests')
            .insert({
              discord_id: user.id,
              username: displayName,
              avatar: user.avatar,
            })
          if (!error) canGuest = true
        }
      }
    }

    if (!canGuest) {
      // Distinguish "in guild but no role" from "not in guild at all" so the
      // landing page can show the right copy.
      return errorRedirect(url.origin, member ? 'no_role' : 'not_in_guild')
    }

    const sessionCookie = await signSession({
      discordId: user.id,
      username: displayName,
      avatar: user.avatar,
      isMember: false,
      isAdmin: false,
      isGuest: true,
      issuedAt: Date.now(),
    })
    const response = NextResponse.redirect(new URL(returnTo, url.origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())
    response.cookies.delete(STATE_COOKIE)
    response.cookies.delete(RETURN_TO_COOKIE)
    response.cookies.delete(INVITE_COOKIE)
    return response
  } catch (e) {
    console.error('[discord-callback]', e)
    return errorRedirect(url.origin, 'server_error')
  }
}
