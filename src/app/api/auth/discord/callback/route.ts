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
import { SESSION_COOKIE_NAME, cookieOptions, signSession, type SessionPayload } from '@/lib/session'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getPrimaryTenantId,
  getTenantDiscordConfig,
  getTenantDiscordConfigByDiscordGuildId,
  type TenantDiscordConfig,
} from '@/lib/tenant'
import { isLocale } from '@/i18n/locales'
import { recordAdminLogin } from '@/lib/tenant-activity'
import { signHopToken, verifyOAuthState, type OAuthStatePayload } from '@/lib/oauth-state'
import {
  buildTenantHostUrl,
  classifyHost,
  FALLBACK_TENANT_SLUG,
} from '@/lib/tenant-resolver'

// Onboarding cookie stays on the canonical domain (it's consumed by /onboard
// which is served from the canonical host until the new tenant exists).
const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'
const ONBOARD_GUILDS_TTL_SEC = 60 * 30

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
  key:
    | 'event_creator_role_ids'
    | 'event_creator_role_ids_combat'
    | 'event_creator_role_ids_ff'
    | 'event_creator_role_ids_ganking'
    | 'bomb_squad_caller_role_ids',
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

function buildErrorOrigin(state: OAuthStatePayload | null): string {
  // Bounce to the originating tenant subdomain when we have it — otherwise a
  // failed login on `foo.albion-guildmanager.com` would strand the user on
  // the canonical domain. Only trust the origin if it parses as a tenant host.
  if (state?.originHost) {
    const classified = classifyHost(state.originHost)
    if (classified.kind === 'tenant') {
      return `https://${state.originHost}`
    }
  }
  const appUrl = process.env.APP_URL
  if (appUrl) return appUrl
  return 'https://albion-guildmanager.com'
}

function errorRedirect(state: OAuthStatePayload | null, reason: string): NextResponse {
  const origin = buildErrorOrigin(state)
  const target = new URL('/', origin)
  target.searchParams.set('auth_error', reason)
  return NextResponse.redirect(target)
}

function extractOriginSlug(originHost: string): string | null {
  const classified = classifyHost(originHost)
  if (classified.kind === 'tenant') return classified.slug
  return null
}

async function buildHopRedirect(
  slug: string,
  session: SessionPayload,
  returnTo: string,
  preferredLocale: string | null,
): Promise<NextResponse> {
  const hopToken = await signHopToken({ session, returnTo, preferredLocale })
  const finishPath = `/api/auth/finish?token=${encodeURIComponent(hopToken)}`
  return NextResponse.redirect(buildTenantHostUrl(slug, finishPath))
}

interface OnboardGuild {
  id: string
  name: string
  icon: string | null
}

async function onboardingResponse(
  canonicalOrigin: string,
  user: DiscordUser,
  onboardableGuilds: DiscordUserGuild[],
): Promise<NextResponse> {
  // Onboarding stays on the canonical domain — the tenant doesn't exist yet,
  // so there's no subdomain to hop to. Once bot-callback creates the tenant,
  // later logins go through the canonical hop to that new subdomain.
  const response = NextResponse.redirect(new URL('/onboard', canonicalOrigin))
  const sessionCookie = await signSession({
    discordId: user.id,
    username: user.global_name || user.username,
    avatar: user.avatar,
    isMember: false,
    isAdmin: false,
    isGuest: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
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
  return response
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const discordError = url.searchParams.get('error')

  if (discordError) return errorRedirect(null, 'denied')
  if (!code || !returnedState) return errorRedirect(null, 'invalid')

  const state = await verifyOAuthState(returnedState)
  if (!state) return errorRedirect(null, 'state_mismatch')

  try {
    const token = await exchangeCode(code)
    const user = await getCurrentUser(token.access_token)
    if (!user) return errorRedirect(state, 'no_identity')

    // Phase 3: 유저의 Discord 길드 목록 → tenants 매칭.
    const userGuilds = await listUserGuilds(token.access_token).catch((e) => {
      console.error('[discord-callback] listUserGuilds failed', e)
      return [] as Awaited<ReturnType<typeof listUserGuilds>>
    })

    const matchedTenants: TenantDiscordConfig[] = []
    for (const g of userGuilds) {
      const tenant = await getTenantDiscordConfigByDiscordGuildId(g.id)
      if (tenant && tenant.botInstalled) matchedTenants.push(tenant)
    }

    const returnTo =
      state.returnTo.startsWith('/') && !state.returnTo.startsWith('//') ? state.returnTo : '/'

    // /onboard 흐름은 새 길드에 봇을 설치하려는 의도. 사용자가 기존 tenant
    // 의 멤버여도 그 tenant subdomain 으로 hop 하면 안 된다 — onboard cookie
    // 와 이후 bot-install state cookie 가 모두 canonical 도메인에 있어야
    // 일관된다. 기존 멤버 경로를 우회해 곧장 onboarding 응답으로 진입.
    if (returnTo.startsWith('/onboard')) {
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
      return onboardingResponse(url.origin, user, onboardableGuilds)
    }

    // ───── Member path ─────
    if (matchedTenants.length > 0) {
      // Prefer the tenant whose slug matches the originating subdomain —
      // keeps multi-tenant users on the subdomain they started from.
      const originSlug = extractOriginSlug(state.originHost)
      const tenant =
        (originSlug ? matchedTenants.find((t) => t.slug === originSlug) : undefined) ??
        matchedTenants[0]

      const member = await getGuildMember(token.access_token, tenant.discordGuildId)
      if (!member) return errorRedirect(state, 'not_in_guild')
      const identity = identityFromMember(member, tenant.memberRoleIds, tenant.adminRoleIds)
      if (!identity) return errorRedirect(state, 'no_identity')
      // 슈퍼어드민이 부여한 admin 오버라이드. 길드 역할 없이도 admin 권한을
      // 강제 부여한다 — 운영/지원 시나리오용. row 가 있으면 isAdmin=true.
      const { data: overrideRow } = await getAdminClient()
        .from('tenant_admin_overrides')
        .select('discord_id')
        .eq('tenant_id', tenant.id)
        .eq('discord_id', user.id)
        .maybeSingle()
      const isAdmin = identity.isAdmin || !!overrideRow
      const isMember = identity.isMember || !!overrideRow

      if (isMember) {
        const [legacyIds, combatIds, ffIds, gankingIds, bombSquadCallerRoleIds] = await Promise.all(
          [
            loadRoleIdSetting('event_creator_role_ids', tenant.id),
            loadRoleIdSetting('event_creator_role_ids_combat', tenant.id),
            loadRoleIdSetting('event_creator_role_ids_ff', tenant.id),
            loadRoleIdSetting('event_creator_role_ids_ganking', tenant.id),
            loadRoleIdSetting('bomb_squad_caller_role_ids', tenant.id),
          ],
        )
        const memberRoleSet = new Set(member.roles)
        const hasLegacy = legacyIds.some((id) => memberRoleSet.has(id))
        const eventCreatorCategories: EventCategory[] = isAdmin
          ? [...EVENT_CATEGORIES]
          : [
              ...(hasLegacy || combatIds.some((id) => memberRoleSet.has(id))
                ? (['전투'] as const)
                : []),
              ...(hasLegacy || ffIds.some((id) => memberRoleSet.has(id))
                ? (['FF'] as const)
                : []),
              ...(hasLegacy || gankingIds.some((id) => memberRoleSet.has(id))
                ? (['갱킹'] as const)
                : []),
            ]
        const canCreateEvents = isAdmin || eventCreatorCategories.length > 0
        const isBombSquadCaller = bombSquadCallerRoleIds.some((id) => memberRoleSet.has(id))
        const displayName = identity.username

        try {
          await upsertGuildAvatar(
            tenant.id,
            user.id,
            displayName,
            user.avatar,
            isAdmin,
            isBombSquadCaller,
          )
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

        const session: SessionPayload = {
          discordId: user.id,
          username: displayName,
          avatar: user.avatar,
          isMember: true,
          isAdmin,
          isGuest: false,
          canCreateEvents,
          eventCreatorCategories,
          eventScope: null,
          guildId: tenant.id,
          issuedAt: Date.now(),
        }
        if (isAdmin) {
          // 무활동 테넌트 식별 신호 — 슈퍼어드민 UI 에서만 사용. 실패해도 로그인은 계속.
          await recordAdminLogin(tenant.id)
        }
        const destination = resolvePostLoginPath(returnTo, preferred)
        return buildHopRedirect(
          tenant.slug,
          session,
          destination,
          isLocale(preferred) ? preferred : null,
        )
      }
      // isMember == false → 봇은 있으나 member/admin 역할이 없는 경우.
      // 게스트 경로로 폴백해 invite/onboarding 분기를 다시 탄다.
    }

    // ───── Guest path & Onboarding ─────
    const db = getAdminClient()

    let eventScope: string | null = null
    if (state.invite) {
      const nowIso = new Date().toISOString()
      const { data: tokenRow } = await db
        .from('event_guest_tokens')
        .select('event_id, revoked_at, expires_at')
        .eq('token', state.invite)
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
        return onboardingResponse(url.origin, user, onboardableGuilds)
      }
      return errorRedirect(state, matchedTenants.length > 0 ? 'no_role' : 'not_in_guild')
    }

    // 게스트: 이벤트 스코프로 로그인. 이벤트가 속한 tenant 의 서브도메인으로 hop.
    const { data: scopeEvent } = await db
      .from('events')
      .select('guild_id')
      .eq('id', eventScope)
      .maybeSingle()
    const guestGuildId =
      (scopeEvent?.guild_id as string | undefined) ?? (await getPrimaryTenantId())

    const guestTenant = await getTenantDiscordConfig(guestGuildId)
    const guestSlug = guestTenant?.slug ?? FALLBACK_TENANT_SLUG

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
      await db.from('guests').insert({
        guild_id: guestGuildId,
        discord_id: user.id,
        username: displayName,
        avatar: user.avatar,
      })
    }

    let guestPreferred = existingGuest?.preferred_language ?? null
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

    const guestSession: SessionPayload = {
      discordId: user.id,
      username: displayName,
      avatar: user.avatar,
      isMember: false,
      isAdmin: false,
      isGuest: true,
      canCreateEvents: false,
      eventCreatorCategories: [],
      eventScope,
      guildId: guestGuildId,
      issuedAt: Date.now(),
    }
    const scopedReturnTo = `/events/${eventScope}`
    const destination = resolvePostLoginPath(scopedReturnTo, guestPreferred)
    return buildHopRedirect(
      guestSlug,
      guestSession,
      destination,
      isLocale(guestPreferred) ? guestPreferred : null,
    )
  } catch (e) {
    console.error('[discord-callback]', e)
    return errorRedirect(state, 'server_error')
  }
}
