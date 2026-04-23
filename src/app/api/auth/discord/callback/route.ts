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
import { getTenantIdByDiscordGuildId } from '@/lib/tenant'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'

const STATE_COOKIE = 'discord_oauth_state'
const RETURN_TO_COOKIE = 'discord_oauth_return_to'
const INVITE_COOKIE = 'guest_invite'
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// 로그인 후 최종 리다이렉트 경로를 정한다. preferred_language 가 없으면
// /welcome-language 로 보내서 선택을 강제하고, 있으면 원래 가려던 곳으로.
function resolvePostLoginPath(
  returnTo: string,
  preferredLanguage: string | null,
): string {
  if (isLocale(preferredLanguage)) return returnTo
  const encoded = encodeURIComponent(returnTo)
  return `/welcome-language?return=${encoded}`
}

// app_setting `event_creator_role_ids` 를 역할 ID 배열로 로드. JSON 파싱 실패나
// 잘못된 shape 이면 빈 배열 fallback (=admin 만 이벤트 생성 가능). 로그인 마다
// 한 번 호출되므로 실패 시 로그인 전체를 막지 않도록 방어적으로 처리.
async function loadRoleIdSetting(key: 'event_creator_role_ids' | 'bomb_squad_caller_role_ids'): Promise<string[]> {
  try {
    const raw = await getAppSetting(key, '[]')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

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

    const { guildId: discordGuildId, memberRoleIds, adminRoleIds } = getDiscordConfig()
    const roles = new Set(member?.roles ?? [])
    const isAdmin = adminRoleIds.some((id) => roles.has(id))
    const isMember = memberRoleIds.some((id) => roles.has(id)) || isAdmin
    // 관리자 설정 기반 이벤트 생성 권한 계산. app_setting 은 JSON 배열 문자열로
    // 저장되며, 파싱 실패 시 빈 배열로 fallback 한다(=admin 만 생성 가능).
    const [eventCreatorRoleIds, bombSquadCallerRoleIds] = await Promise.all([
      loadRoleIdSetting('event_creator_role_ids'),
      loadRoleIdSetting('bomb_squad_caller_role_ids'),
    ])
    const hasEventCreatorRole = isMember && eventCreatorRoleIds.some((id) => roles.has(id))
    const canCreateEvents = isAdmin || hasEventCreatorRole
    const isBombSquadCaller = isMember && bombSquadCallerRoleIds.some((id) => roles.has(id))
    // Server nick wins, then global_name, then raw username.
    const displayName = member?.nick || user.global_name || user.username

    const rawReturnTo = request.cookies.get(RETURN_TO_COOKIE)?.value ?? '/'
    const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/'

    if (isMember) {
      try {
        await upsertGuildAvatar(user.id, displayName, user.avatar, isAdmin, isBombSquadCaller)
      } catch (err) {
        console.error('[discord-callback] upsertGuildAvatar failed', err)
      }
      // preferred_language 를 한 번 조회해서 (a) 없으면 환영 페이지로 보내고
      // (b) 있으면 lang 쿠키를 DB 값에 동기화. 새 디바이스/쿠키 삭제 케이스에서
      // 본인이 저장해둔 언어로 바로 렌더된다.
      const db = getAdminClient()
      const { data: langRow } = await db
        .from('guild_avatars')
        .select('preferred_language')
        .eq('discord_id', user.id)
        .maybeSingle()
      const preferred = langRow?.preferred_language ?? null

      // Multi-tenant: 현재 로그인한 Discord 길드에 해당하는 tenant UUID 를
      // session 에 심는다. Phase 2 이후 모든 쿼리가 이 값으로 스코프된다.
      // 레거시 마이그 직전 환경에서 tenants 테이블이 비어 있으면 null → 소비
      // 측에서 primary tenant fallback.
      const guildId = await getTenantIdByDiscordGuildId(discordGuildId)

      const sessionCookie = await signSession({
        discordId: user.id,
        username: displayName,
        avatar: user.avatar,
        isMember: true,
        isAdmin,
        isGuest: false,
        canCreateEvents,
        eventScope: null,
        guildId,
        issuedAt: Date.now(),
      })
      const destination = resolvePostLoginPath(returnTo, preferred)
      const response = NextResponse.redirect(new URL(destination, url.origin))
      response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())
      if (isLocale(preferred)) {
        response.cookies.set(LOCALE_COOKIE, preferred, {
          path: '/',
          maxAge: LOCALE_COOKIE_MAX_AGE,
          sameSite: 'lax',
        })
      }
      response.cookies.delete(STATE_COOKIE)
      response.cookies.delete(RETURN_TO_COOKIE)
      response.cookies.delete(INVITE_COOKIE)
      return response
    }

    // Guest path: must present a valid, non-revoked, non-expired event guest
    // token. Unlike the old global-token model, every guest session is now
    // scoped to exactly one event_id.
    const db = getAdminClient()
    const { data: existingGuest } = await db
      .from('guests')
      .select('discord_id, preferred_language')
      .eq('discord_id', user.id)
      .maybeSingle()

    let eventScope: string | null = null
    const inviteCookie = request.cookies.get(INVITE_COOKIE)?.value
    if (inviteCookie) {
      const nowIso = new Date().toISOString()
      const { data: tokenRow } = await db
        .from('event_guest_tokens')
        .select('event_id, revoked_at, expires_at')
        .eq('token', inviteCookie)
        .maybeSingle()
      if (
        tokenRow &&
        !tokenRow.revoked_at &&
        (!tokenRow.expires_at || tokenRow.expires_at > nowIso)
      ) {
        eventScope = tokenRow.event_id
      }
    }

    if (!eventScope) {
      // No valid event-scoped invite → reject. (전역 토큰 경로 폐기.)
      return errorRedirect(url.origin, member ? 'no_role' : 'not_in_guild')
    }

    if (existingGuest) {
      // Refresh display fields so guest list stays current.
      await db
        .from('guests')
        .update({ username: displayName, avatar: user.avatar })
        .eq('discord_id', user.id)
    } else {
      await db
        .from('guests')
        .insert({
          discord_id: user.id,
          username: displayName,
          avatar: user.avatar,
        })
    }

    // preferred_language: 신규 게스트는 insert 에서 넣지 않았으니 null. 기존
     // 게스트는 위에서 fetch 한 existingGuest.preferred_language 를 사용.
    const guestPreferred = existingGuest?.preferred_language ?? null

    // 게스트의 tenant 는 해당 event 의 guild_id. 한 유저가 guild A 의 게스트
    // 이면서 guild B 의 게스트일 수 있으므로 "유저의 primary tenant" 가 아니라
    // 이 초대 토큰이 속한 이벤트의 guild 를 써야 한다.
    const { data: scopeEvent } = await db
      .from('events')
      .select('guild_id')
      .eq('id', eventScope)
      .maybeSingle()
    const guestGuildId = (scopeEvent?.guild_id as string | undefined) ?? null

    const sessionCookie = await signSession({
      discordId: user.id,
      username: displayName,
      avatar: user.avatar,
      isMember: false,
      isAdmin: false,
      isGuest: true,
      // 게스트는 길드원이 아니라서 역할 기반 자격이 붙지 않는다. 항상 false.
      canCreateEvents: false,
      eventScope,
      guildId: guestGuildId,
      issuedAt: Date.now(),
    })
    // 게스트의 returnTo 는 항상 스코프 이벤트로 강제. 링크를 어떻게 타고
    // 왔든 "그 이벤트만 볼 수 있음" 규칙을 여기서 고정.
    const scopedReturnTo = `/events/${eventScope}`
    const destination = resolvePostLoginPath(scopedReturnTo, guestPreferred)
    const response = NextResponse.redirect(new URL(destination, url.origin))
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())
    if (isLocale(guestPreferred)) {
      response.cookies.set(LOCALE_COOKIE, guestPreferred, {
        path: '/',
        maxAge: LOCALE_COOKIE_MAX_AGE,
        sameSite: 'lax',
      })
    }
    response.cookies.delete(STATE_COOKIE)
    response.cookies.delete(RETURN_TO_COOKIE)
    response.cookies.delete(INVITE_COOKIE)
    return response
  } catch (e) {
    console.error('[discord-callback]', e)
    return errorRedirect(url.origin, 'server_error')
  }
}
