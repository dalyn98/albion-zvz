import { NextRequest, NextResponse } from 'next/server'
import {
  buildAuthorizeUrl,
  exchangeCode,
  getCurrentUser,
  getGuildMemberByBot,
  identityFromMember,
  listUserGuilds,
  mapDiscordLocale,
  type DiscordUser,
  type DiscordUserGuild,
} from '@/lib/discord'
import { SESSION_COOKIE_NAME, cookieOptions, signSession, type SessionPayload } from '@/lib/session'
import { resolveUserCapabilities, serializeCapabilities } from '@/lib/permissions'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { getAppSetting } from '@/lib/app-settings'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveTenantLoginAccess } from '@/lib/tenant-login-access'
import {
  getPrimaryTenantId,
  getTenantDiscordConfig,
  getTenantDiscordConfigByDiscordGuildId,
  type TenantDiscordConfig,
} from '@/lib/tenant'
import { isLocale } from '@/i18n/locales'
import { recordAdminLogin } from '@/lib/tenant-activity'
import { signHopToken, signOAuthState, verifyOAuthState, type OAuthStatePayload } from '@/lib/oauth-state'
import { resolveEventGuestAuthScope } from '@/lib/event-guest-auth'
import {
  buildTenantHostUrl,
  classifyHost,
  FALLBACK_TENANT_SLUG,
  resolveTenantBySlug,
} from '@/lib/tenant-resolver'
import { log } from '@/lib/log'
import { recordAuthFailure } from '@/lib/auth-telemetry'

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
    | 'bomb_squad_caller_role_ids'
    | 'active_member_role_ids',
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

function errorRedirect(
  request: NextRequest,
  state: OAuthStatePayload | null,
  reason: string,
  extra?: Record<string, unknown>,
): NextResponse {
  recordAuthFailure(request, 'callback', reason, {
    origin_host: state?.originHost ?? null,
    return_to: state?.returnTo ?? null,
    has_invite: state?.invite != null,
    ...(extra ?? {}),
  })
  const origin = buildErrorOrigin(state)
  const target = new URL(buildErrorPath(state), origin)
  target.searchParams.set('auth_error', reason)
  return NextResponse.redirect(target)
}

function buildErrorPath(state: OAuthStatePayload | null): string {
  const returnTo = state?.returnTo
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/'
  if (returnTo.startsWith('/api/')) return '/'
  return returnTo
}

function extractOriginSlug(originHost: string): string | null {
  const classified = classifyHost(originHost)
  if (classified.kind === 'tenant') return classified.slug
  return null
}

async function resolveOriginTenantFallback(
  state: OAuthStatePayload,
  matchedTenants: readonly TenantDiscordConfig[],
): Promise<TenantDiscordConfig | null> {
  const originSlug = extractOriginSlug(state.originHost)
  if (!originSlug || matchedTenants.some((tenant) => tenant.slug === originSlug)) {
    return null
  }

  const resolved = await resolveTenantBySlug(originSlug)
  if (!resolved) return null

  const tenant = await getTenantDiscordConfig(resolved.tenantId)
  if (!tenant?.botInstalled) return null
  return tenant
}

function mergeTenantMatches(
  originTenantFallback: TenantDiscordConfig | null,
  matchedTenants: readonly TenantDiscordConfig[],
): TenantDiscordConfig[] {
  if (!originTenantFallback) return [...matchedTenants]
  return [
    originTenantFallback,
    ...matchedTenants.filter((tenant) => tenant.id !== originTenantFallback.id),
  ]
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
    isBombSquadCaller: false,
    isLocalGuildAccount: false,
    isAllianceCandidate: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: null,
    guildId: null,
    // 온보딩 단계라 테넌트가 아직 없다 — capability 비트도 0. 본격 admin 세션은
    // bot-callback/onboard 완료 후 갱신.
    capabilities: '0',
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

  // start 에서 prompt=none 으로 보낸 사용자가 처음 인증하는 경우 Discord 가
  // consent_required 로 응답한다 — 신규 사용자에게 동의 화면을 띄우기 위해
  // prompt=consent 로 한 번만 retry. state 가 유효하면 originHost / returnTo
  // / invite 를 그대로 보존해 새 state 로 재발급.
  if (discordError === 'consent_required' && returnedState) {
    const fallbackState = await verifyOAuthState(returnedState)
    if (fallbackState) {
      const retryState = await signOAuthState({
        originHost: fallbackState.originHost,
        returnTo: fallbackState.returnTo,
        invite: fallbackState.invite,
        preferredLocale: fallbackState.preferredLocale,
      })
      return NextResponse.redirect(buildAuthorizeUrl(retryState, { prompt: 'consent' }))
    }
  }

  if (discordError) {
    const errorState = returnedState ? await verifyOAuthState(returnedState) : null
    return errorRedirect(request, errorState, 'denied', { discord_error: discordError })
  }
  if (!code || !returnedState) return errorRedirect(request, null, 'invalid')

  const state = await verifyOAuthState(returnedState)
  if (!state) {
    return errorRedirect(request, null, 'state_mismatch', {
      state_present: !!returnedState,
      state_length: returnedState.length,
    })
  }

  try {
    const token = await exchangeCode(code)
    const user = await getCurrentUser(token.access_token)
    if (!user) return errorRedirect(request, state, 'no_identity')

    // Phase 3: 유저의 Discord 길드 목록 → tenants 매칭.
    const userGuilds = await listUserGuilds(token.access_token).catch((e) => {
      log.error('[discord-callback] listUserGuilds failed', e, { discord_id: user.id })
      return [] as Awaited<ReturnType<typeof listUserGuilds>>
    })

    const matchedTenants: TenantDiscordConfig[] = []
    for (const g of userGuilds) {
      const tenant = await getTenantDiscordConfigByDiscordGuildId(g.id)
      if (tenant && tenant.botInstalled) matchedTenants.push(tenant)
    }

    const returnTo =
      state.returnTo.startsWith('/') && !state.returnTo.startsWith('//') ? state.returnTo : '/'

    // 이벤트 게스트 스코프를 먼저 해석한다.
    // - invite 토큰이 있으면 유효/만료/폐기 여부를 엄격히 본다.
    // - invite 토큰이 없는 공개 이벤트 링크(`/events/:id`)도 published 이벤트면
    //   이벤트 스코프 게스트로 로그인시킨다. 외부 지원자가 공개 이벤트 링크에서
    //   Discord 로그인을 눌렀을 때 `/onboard` 봇 설치 화면으로 빠지는 회귀를 막기
    //   위한 분기다.
    const guestAuthScope = await resolveEventGuestAuthScope(getAdminClient(), {
      inviteToken: state.invite,
      returnTo,
    })
    const inviteEventScope = guestAuthScope?.eventId ?? null
    const inviteTenantId = guestAuthScope?.guildId ?? null
    const originTenantFallback = await resolveOriginTenantFallback(state, matchedTenants)
    const loginCandidateTenants = mergeTenantMatches(originTenantFallback, matchedTenants)
    const inviteForcesGuestPath =
      inviteEventScope !== null &&
      inviteTenantId !== null &&
      !loginCandidateTenants.some((t) => t.id === inviteTenantId)

    // /onboard 흐름은 새 길드에 봇을 설치하려는 의도. 사용자가 기존 tenant
    // 의 멤버여도 그 tenant subdomain 으로 hop 하면 안 된다 — onboard cookie
    // 와 이후 bot-install state cookie 가 모두 canonical 도메인에 있어야
    // 일관된다. 기존 멤버 경로를 우회해 곧장 onboarding 응답으로 진입.
    //
    // 주의: '/onboard' 와 그 하위 경로만 매칭. 단순 startsWith('/onboard')
    // 는 '/onboarding/albion' (멤버 알비온 인증 위저드) 까지 잡아버려서
    // 길드원 초대 링크로 들어온 사용자를 admin onboarding 으로 잘못 보낸다.
    const isAdminOnboard = returnTo === '/onboard' || returnTo.startsWith('/onboard/')
    if (isAdminOnboard) {
      const matchedTenantGuildIds = new Set(loginCandidateTenants.map((t) => t.discordGuildId))
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
    if (loginCandidateTenants.length > 0 && !inviteForcesGuestPath) {
      // 초대가 가리키는 tenant 의 멤버라면 그 tenant 우선. 아니면 originHost
      // 매칭, 그것도 없으면 [0] fallback. (inviteForcesGuestPath 가 true 면 이
      // 블록 자체를 skip 해서 게스트 path 로 직행.)
      const inviteTenantMatch =
        inviteTenantId ? loginCandidateTenants.find((t) => t.id === inviteTenantId) : undefined
      const originSlug = extractOriginSlug(state.originHost)
      const tenant =
        inviteTenantMatch ??
        (originSlug ? loginCandidateTenants.find((t) => t.slug === originSlug) : undefined) ??
        loginCandidateTenants[0]

      const memberByBot = await getGuildMemberByBot(tenant.discordGuildId, user.id)
      const member = memberByBot ? { ...memberByBot, user: memberByBot.user ?? user } : null
      if (!member && (!inviteEventScope || inviteTenantId !== tenant.id)) {
        return errorRedirect(request, state, 'not_in_guild', {
          tenant_id: tenant.id,
          matched_tenants: loginCandidateTenants.length,
          user_guild_matched_tenants: matchedTenants.length,
          origin_tenant_fallback: originTenantFallback?.id ?? null,
        })
      }
      if (member) {
      // 멤버 역할 판정은 admin 이 설정 UI 에서 바꾼 active_member_role_ids 를
      // 우선 적용 — 비어있으면 onboarding 시점 시드된 tenant.member_role_ids
      // 로 폴백. member-sync.ts 와 동일한 우선순위.
      const activeMemberRoleIds = await loadRoleIdSetting('active_member_role_ids', tenant.id)
      const effectiveMemberRoleIds =
        activeMemberRoleIds.length > 0 ? activeMemberRoleIds : tenant.memberRoleIds
      const identity = identityFromMember(member, effectiveMemberRoleIds, tenant.adminRoleIds)
      const isTenantOwner = tenant.createdByDiscordId === user.id
      const [legacyIds, combatIds, ffIds, gankingIds, bombSquadCallerRoleIds] =
        await Promise.all([
          loadRoleIdSetting('event_creator_role_ids', tenant.id),
          loadRoleIdSetting('event_creator_role_ids_combat', tenant.id),
          loadRoleIdSetting('event_creator_role_ids_ff', tenant.id),
          loadRoleIdSetting('event_creator_role_ids_ganking', tenant.id),
          loadRoleIdSetting('bomb_squad_caller_role_ids', tenant.id),
        ])
      const memberRoleSet = new Set(member.roles)
      const isBombSquadCaller = bombSquadCallerRoleIds.some((id) => memberRoleSet.has(id))
      // 슈퍼어드민이 부여한 admin 오버라이드. 길드 역할 없이도 admin 권한을
      // 강제 부여한다 — 운영/지원 시나리오용. row 가 있으면 isAdmin=true.
      const { data: overrideRow } = await getAdminClient()
        .from('tenant_admin_overrides')
        .select('discord_id')
        .eq('tenant_id', tenant.id)
        .eq('discord_id', user.id)
        .maybeSingle()
      // 테넌트 생성자는 Discord 역할 선택을 잘못해도 다음 로그인에서 잠기면 안 된다.
      // created_by_discord_id 는 봇 설치 OAuth 로 확정된 실제 설치자라 tenant-local
      // owner 예외로만 사용한다.
      const { isAdmin, isMember } = resolveTenantLoginAccess({
        identity,
        hasAdminOverride: !!overrideRow,
        isTenantOwner,
      })

      const isAllianceCandidate = !isMember && !isAdmin
      if (isMember || isBombSquadCaller || isAllianceCandidate) {
        const hasLegacy = legacyIds.some((id) => memberRoleSet.has(id))
        const eventCreatorCategories: EventCategory[] = isAdmin
          ? [...EVENT_CATEGORIES]
          : isMember
            ? [
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
            : []
        const canCreateEvents = isAdmin || eventCreatorCategories.length > 0
        const displayName = identity?.username ?? member.nick ?? user.global_name ?? user.username

        if (isMember || isBombSquadCaller) {
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
            log.error('[discord-callback] upsertGuildAvatar failed', err, {
              tenant_id: tenant.id,
              discord_id: user.id,
            })
          }
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
          const fromBrowser = isLocale(state.preferredLocale) ? state.preferredLocale : null
          const preferredFromLocale = fromBrowser ?? mapDiscordLocale(user.locale)
          if (preferredFromLocale) {
            const { error: langErr } = await db
              .from('guild_avatars')
              .update({ preferred_language: preferredFromLocale })
              .eq('guild_id', tenant.id)
              .eq('discord_id', user.id)
            if (langErr) {
              log.error('[discord-callback] save preferred_language failed', langErr, {
                tenant_id: tenant.id,
                discord_id: user.id,
              })
            } else {
              preferred = preferredFromLocale
            }
          }
        }

        // Granular capability 비트필드 — role grant + per-user override 의 합성.
        // isAdmin 인 세션은 ALL_CAPABILITIES 마스크라 점진 마이그 도중 권한 누락
        // 사고 0. DB 조회 실패 시에도 로그인은 계속 진행 (capabilities='0').
        let capabilitiesBits = 0n
        try {
          capabilitiesBits = isMember
            ? await resolveUserCapabilities(getAdminClient(), {
                guildId: tenant.id,
                discordId: user.id,
                discordRoleIds: member.roles,
                isLegacyAdmin: isAdmin,
              })
            : 0n
        } catch (err) {
          log.error('[discord-callback] resolveUserCapabilities failed', err, {
            tenant_id: tenant.id,
            discord_id: user.id,
          })
        }

        const session: SessionPayload = {
          discordId: user.id,
          username: displayName,
          avatar: user.avatar,
          isMember,
          isAdmin,
          isGuest: false,
          isBombSquadCaller,
          isLocalGuildAccount: false,
          isAllianceCandidate,
          canCreateEvents,
          eventCreatorCategories,
          eventScope: null,
          guildId: tenant.id,
          capabilities: serializeCapabilities(capabilitiesBits),
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
      }
      // isMember == false → 봇은 있으나 member/admin 역할이 없는 경우.
      // 게스트 경로로 폴백해 invite/onboarding 분기를 다시 탄다.
    }

    // ───── Guest path & Onboarding ─────
    const db = getAdminClient()

    // 위에서 이미 검증한 이벤트 게스트 결과 재사용 — DB 라운드트립 절약 + 분기 일관성.
    const eventScope: string | null = inviteEventScope

    if (!eventScope) {
      const matchedTenantGuildIds = new Set(loginCandidateTenants.map((t) => t.discordGuildId))
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
      return errorRedirect(
        request,
        state,
        loginCandidateTenants.length > 0 ? 'no_role' : 'not_in_guild',
        {
          matched_tenants: loginCandidateTenants.length,
          user_guild_matched_tenants: matchedTenants.length,
          origin_tenant_fallback: originTenantFallback?.id ?? null,
        },
      )
    }

    // 게스트: 이벤트 스코프로 로그인. 이벤트가 속한 tenant 의 서브도메인으로 hop.
    // inviteTenantId 는 위에서 이미 events 테이블 조회로 채워져 있다.
    const guestGuildId = inviteTenantId ?? (await getPrimaryTenantId())

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
      const fromBrowser = isLocale(state.preferredLocale) ? state.preferredLocale : null
      const preferredFromLocale = fromBrowser ?? mapDiscordLocale(user.locale)
      if (preferredFromLocale) {
        const { error: langErr } = await db
          .from('guests')
          .update({ preferred_language: preferredFromLocale })
          .eq('guild_id', guestGuildId)
          .eq('discord_id', user.id)
        if (langErr) {
          log.error('[discord-callback] save guest preferred_language failed', langErr, {
            tenant_id: guestGuildId,
            discord_id: user.id,
          })
        } else {
          guestPreferred = preferredFromLocale
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
      isBombSquadCaller: false,
      isLocalGuildAccount: false,
      isAllianceCandidate: false,
      canCreateEvents: false,
      eventCreatorCategories: [],
      eventScope,
      guildId: guestGuildId,
      // 게스트는 이벤트 1개 read-only 라 capability 비트는 0. session-verify
      // 의 sessionHas 가 0n 으로 파싱해 모든 capability 체크 false.
      capabilities: '0',
      issuedAt: Date.now(),
    }
    const scopedReturnTo = `/events/${eventScope}`
    return buildHopRedirect(
      guestSlug,
      guestSession,
      scopedReturnTo,
      isLocale(guestPreferred) ? guestPreferred : null,
    )
  } catch (e) {
    log.error('[discord-callback] unhandled', e, { return_to: state.returnTo })
    return errorRedirect(request, state, 'server_error')
  }
}
