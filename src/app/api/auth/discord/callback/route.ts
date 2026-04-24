import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeCode,
  getCurrentUser,
  getGuildMember,
  identityFromMember,
  listUserGuilds,
  mapDiscordLocale,
  type DiscordUser,
  type DiscordUserGuild,
} from '@/lib/discord'
import { SESSION_COOKIE_NAME, cookieOptions, signSession } from '@/lib/session'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getPrimaryTenantId,
  getTenantDiscordConfigByDiscordGuildId,
  type TenantDiscordConfig,
} from '@/lib/tenant'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'

const STATE_COOKIE = 'discord_oauth_state'
const RETURN_TO_COOKIE = 'discord_oauth_return_to'
const INVITE_COOKIE = 'guest_invite'
const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'
const ONBOARD_GUILDS_TTL_SEC = 60 * 30 // 30분: 봇 설치 결정 + 돌아오는 round-trip 용
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

// Discord 유저 권한 bitmask. MANAGE_GUILD = 0x20 — 봇 초대 가능.
const MANAGE_GUILD_BIT = BigInt(0x20)

function resolvePostLoginPath(
  returnTo: string,
  preferredLanguage: string | null,
): string {
  if (isLocale(preferredLanguage)) return returnTo
  const encoded = encodeURIComponent(returnTo)
  return `/welcome-language?return=${encoded}`
}

async function loadRoleIdSetting(
  key: 'event_creator_role_ids' | 'bomb_squad_caller_role_ids',
  guildId: string,
): Promise<string[]> {
  try {
    const raw = await getAppSetting(key, '[]', guildId)
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

interface OnboardGuild {
  id: string
  name: string
  icon: string | null
}

async function onboardingRedirect(
  origin: string,
  user: DiscordUser,
  onboardableGuilds: DiscordUserGuild[],
): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/onboard', origin))
  // 온보딩 세션: 아직 어떤 tenant 에도 속하지 않은 상태. layout 이 /onboard 경로
  // 는 role 없이도 접근 가능하도록 별도 처리. 설치 완료 후 bot-callback 이
  // 새 tenant 의 admin 세션으로 재발급.
  const sessionCookie = await signSession({
    discordId: user.id,
    username: user.global_name || user.username,
    avatar: user.avatar,
    isMember: false,
    isAdmin: false,
    isGuest: false,
    canCreateEvents: false,
    eventScope: null,
    guildId: null,
    issuedAt: Date.now(),
  })
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions())
  const payload: OnboardGuild[] = onboardableGuilds.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
  }))
  response.cookies.set(ONBOARD_GUILDS_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: ONBOARD_GUILDS_TTL_SEC,
  })
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
    const user = await getCurrentUser(token.access_token)
    if (!user) return errorRedirect(url.origin, 'no_identity')

    // Phase 3: 유저의 Discord 길드 목록 → tenants 매칭. 관리자 승인된 tenant 중
    // 유저가 속한 길드의 교집합.
    const userGuilds = await listUserGuilds(token.access_token).catch((e) => {
      console.error('[discord-callback] listUserGuilds failed', e)
      return [] as Awaited<ReturnType<typeof listUserGuilds>>
    })

    const matchedTenants: TenantDiscordConfig[] = []
    for (const g of userGuilds) {
      const tenant = await getTenantDiscordConfigByDiscordGuildId(g.id)
      if (tenant && tenant.botInstalled) matchedTenants.push(tenant)
    }

    const rawReturnTo = request.cookies.get(RETURN_TO_COOKIE)?.value ?? '/'
    const returnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/'

    // ───── Member path ─────
    // 유저가 가입된 tenant 가 하나 이상이면 첫 번째를 선택.
    // (>1 이면 추후 picker UI 를 추가. 현재 MVP 는 첫 매칭 자동 선택.)
    if (matchedTenants.length > 0) {
      const tenant = matchedTenants[0]
      const member = await getGuildMember(token.access_token, tenant.discordGuildId)
      if (!member) {
        // tenant 에 매칭은 됐으나 (guilds 에 포함) 멤버 카드가 없는 경우 — 레이스.
        return errorRedirect(url.origin, 'not_in_guild')
      }
      const identity = identityFromMember(member, tenant.memberRoleIds, tenant.adminRoleIds)
      if (!identity) return errorRedirect(url.origin, 'no_identity')
      const { isAdmin, isMember } = identity

      const [eventCreatorRoleIds, bombSquadCallerRoleIds] = await Promise.all([
        loadRoleIdSetting('event_creator_role_ids', tenant.id),
        loadRoleIdSetting('bomb_squad_caller_role_ids', tenant.id),
      ])
      const memberRoleSet = new Set(member.roles)
      const hasEventCreatorRole = isMember && eventCreatorRoleIds.some((id) => memberRoleSet.has(id))
      const canCreateEvents = isAdmin || hasEventCreatorRole
      const isBombSquadCaller = isMember && bombSquadCallerRoleIds.some((id) => memberRoleSet.has(id))
      const displayName = identity.username

      if (!isMember) {
        // 봇은 있으나 member/admin 역할이 없는 경우 — 게스트 경로로 폴백.
        // 그대로 falls-through to guest path.
      } else {
        try {
          await upsertGuildAvatar(tenant.id, user.id, displayName, user.avatar, isAdmin, isBombSquadCaller)
        } catch (err) {
          console.error('[discord-callback] upsertGuildAvatar failed', err)
        }
        const db = getAdminClient()
        const { data: langRow } = await db
          .from('guild_avatars')
          .select('preferred_language')
          .eq('guild_id', tenant.id)
          .eq('discord_id', user.id)
          .maybeSingle()
        let preferred = langRow?.preferred_language ?? null
        // DB 에 아직 선택된 언어가 없으면 Discord 계정 언어를 초기값으로 사용.
        // 지원 locale 로 매핑되면 DB 에 저장해 이후 로그인부터 welcome-language
        // 페이지를 건너뛰게 하고, 그렇지 않으면 preferred=null 로 두어 기존대로
        // 환영 페이지가 뜨게 한다.
        if (!isLocale(preferred)) {
          const fromDiscord = mapDiscordLocale(user.locale)
          if (fromDiscord) {
            const { error: langErr } = await db
              .from('guild_avatars')
              .update({ preferred_language: fromDiscord })
              .eq('guild_id', tenant.id)
              .eq('discord_id', user.id)
            if (langErr) {
              console.error('[discord-callback] save preferred_language failed', langErr)
            } else {
              preferred = fromDiscord
            }
          }
        }

        const sessionCookie = await signSession({
          discordId: user.id,
          username: displayName,
          avatar: user.avatar,
          isMember: true,
          isAdmin,
          isGuest: false,
          canCreateEvents,
          eventScope: null,
          guildId: tenant.id,
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
    }

    // ───── Guest path ─────
    // 초대 토큰이 있으면 이벤트 스코프 게스트. 없으면 — 유저가 MANAGE_GUILD 를 가진
    // Discord 길드가 있으면 /onboard 로 안내 (신규 길드 온보딩). 둘 다 아니면 거절.
    const inviteCookie = request.cookies.get(INVITE_COOKIE)?.value
    const db = getAdminClient()

    let eventScope: string | null = null
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
        eventScope = tokenRow.event_id as string
      }
    }

    if (!eventScope) {
      // 초대 토큰 없음 → 온보딩 가능한 길드가 있는지 확인. 이미 tenant 로 등록된
      // 길드는 "이미 설치됨" 상태라 목록에서 제외한다 (사용자 혼란 방지).
      const matchedTenantGuildIds = new Set(matchedTenants.map((t) => t.discordGuildId))
      const onboardableGuilds = userGuilds.filter((g) => {
        if (matchedTenantGuildIds.has(g.id)) return false
        try {
          const perms = BigInt(g.permissions)
          return g.owner || (perms & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT
        } catch {
          return g.owner
        }
      })
      if (onboardableGuilds.length > 0) {
        return onboardingRedirect(url.origin, user, onboardableGuilds)
      }
      return errorRedirect(url.origin, matchedTenants.length > 0 ? 'no_role' : 'not_in_guild')
    }

    // 게스트: 이벤트 스코프로 로그인.
    const { data: scopeEvent } = await db
      .from('events')
      .select('guild_id')
      .eq('id', eventScope)
      .maybeSingle()
    const guestGuildId =
      (scopeEvent?.guild_id as string | undefined) ?? (await getPrimaryTenantId())

    const { data: existingGuest } = await db
      .from('guests')
      .select('discord_id, preferred_language')
      .eq('guild_id', guestGuildId)
      .eq('discord_id', user.id)
      .maybeSingle()
    const displayName = user.global_name || user.username

    if (existingGuest) {
      await db
        .from('guests')
        .update({ username: displayName, avatar: user.avatar })
        .eq('guild_id', guestGuildId)
        .eq('discord_id', user.id)
    } else {
      await db
        .from('guests')
        .insert({
          guild_id: guestGuildId,
          discord_id: user.id,
          username: displayName,
          avatar: user.avatar,
        })
    }

    let guestPreferred = existingGuest?.preferred_language ?? null
    // 게스트 계정도 동일하게 Discord locale → preferred_language 부트스트랩.
    // 매핑 실패 시 null 로 남겨 welcome-language 페이지가 최종 선택을 받는다.
    if (!isLocale(guestPreferred)) {
      const fromDiscord = mapDiscordLocale(user.locale)
      if (fromDiscord) {
        const { error: langErr } = await db
          .from('guests')
          .update({ preferred_language: fromDiscord })
          .eq('guild_id', guestGuildId)
          .eq('discord_id', user.id)
        if (langErr) {
          console.error('[discord-callback] save guest preferred_language failed', langErr)
        } else {
          guestPreferred = fromDiscord
        }
      }
    }

    const sessionCookie = await signSession({
      discordId: user.id,
      username: displayName,
      avatar: user.avatar,
      isMember: false,
      isAdmin: false,
      isGuest: true,
      canCreateEvents: false,
      eventScope,
      guildId: guestGuildId,
      issuedAt: Date.now(),
    })
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
