import { after, NextRequest, NextResponse } from 'next/server'
import {
  buildAuthorizeUrl,
  exchangeCode,
  getCurrentUser,
  getGuildMemberByBot,
  listUserGuilds,
  mapDiscordLocale,
  type DiscordUser,
  type DiscordUserGuild,
} from '@/lib/discord'
import { SESSION_COOKIE_NAME, cookieOptions, signSession, type SessionPayload } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getPrimaryTenantId,
  getTenantDiscordConfig,
  getTenantDiscordConfigsByDiscordGuildIds,
  type TenantDiscordConfig,
} from '@/lib/tenant'
import { isLocale } from '@/i18n/locales'
import { recordAdminLogin } from '@/lib/tenant-activity'
import {
  signHopToken,
  signOAuthState,
  verifyOAuthState,
  type OAuthStatePayload,
} from '@/lib/oauth-state'
import { extractEventIdFromReturnTo, resolveEventGuestAuthScope } from '@/lib/event-guest-auth'
import {
  buildTenantHostUrl,
  classifyHost,
  FALLBACK_TENANT_SLUG,
  resolveTenantBySlug,
} from '@/lib/tenant-resolver'
import { log } from '@/lib/log'
import { createAuthTimer, recordAuthFailure, recordAuthSuccess } from '@/lib/auth-telemetry'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import { withNoStore } from '@/lib/no-store-response'
import { redactUrlSearch } from '@/lib/redact-search-params'
import { resolveEffectiveSiteUsername } from '@/lib/site-nickname-override'
import {
  buildDiscordMemberSession,
  resolveDiscordMemberPostLoginPath,
} from '@/lib/discord-member-session'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  canShareAuthBindingCookie,
  expiredOAuthStateBindingCookieOptions,
  hasOAuthStateBindingCookie,
  hopTokenBindingCookieName,
  hopTokenBindingCookieOptions,
  oauthStateBindingCookieName,
  oauthStateBindingCookieOptions,
} from '@/lib/auth-flow-cookie'
import { buildLoginEntryHref } from '@/lib/login-entry'
import { resolveAuthTargetTenant } from '@/lib/auth-target-tenant'

// Onboarding cookie stays on the canonical domain (it's consumed by /onboard
// which is served from the canonical host until the new tenant exists).
const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'
const ONBOARD_GUILDS_TTL_SEC = 60 * 30

// Discord 유저 권한 bitmask. MANAGE_GUILD = 0x20 — 봇 초대 가능.
const MANAGE_GUILD_BIT = BigInt(0x20)

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
    flow_id: state?.nonce ?? null,
    origin_host: state?.originHost ?? null,
    return_to: state?.returnTo ?? null,
    has_invite: state?.invite != null,
    ...(extra ?? {}),
  })
  const origin = buildErrorOrigin(state)
  const target = new URL(buildLoginEntryHref({
    returnTo: sanitizeInternalReturnTo(state?.returnTo),
    authError: reason,
  }), origin)
  return withNoStore(NextResponse.redirect(target))
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
  request: NextRequest,
  slug: string,
  session: SessionPayload,
  returnTo: string,
  preferredLocale: string | null,
  flowId: string,
): Promise<NextResponse> {
  const tenantOrigin = buildTenantHostUrl(slug, '/')
  const requiresBrowserBinding = canShareAuthBindingCookie(
    request.headers.get('host'),
    tenantOrigin,
  )
  const hopToken = await signHopToken({
    session,
    returnTo,
    preferredLocale,
    flowId,
    requiresBrowserBinding,
  })
  const finishPath = `/api/auth/finish?token=${encodeURIComponent(hopToken)}`
  const response = NextResponse.redirect(buildTenantHostUrl(slug, finishPath))
  response.headers.set('referrer-policy', 'no-referrer')
  if (requiresBrowserBinding) {
    response.cookies.set(
      hopTokenBindingCookieName(flowId),
      AUTH_FLOW_BINDING_COOKIE_VALUE,
      hopTokenBindingCookieOptions(request.headers.get('host')),
    )
  }
  return withNoStore(response)
}

function applyOAuthBindingConsumption(
  response: NextResponse,
  request: NextRequest,
  consumedCookieName: string | null,
): NextResponse {
  if (!consumedCookieName) return response
  response.cookies.set(
    consumedCookieName,
    '',
    expiredOAuthStateBindingCookieOptions(request.headers.get('host')),
  )
  return response
}

function scheduleAuthPostResponseTask(
  label: string,
  task: () => Promise<void>,
  context: Record<string, unknown>,
): void {
  after(async () => {
    try {
      await task()
    } catch (error) {
      log.error(`[discord-callback] post-response ${label} failed`, error, context)
    }
  })
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
  destinationPath: string = '/onboard',
): Promise<NextResponse> {
  // Onboarding stays on the canonical domain — the tenant doesn't exist yet,
  // so there's no subdomain to hop to. Once bot-callback creates the tenant,
  // later logins go through the canonical hop to that new subdomain.
  const response = NextResponse.redirect(new URL(destinationPath, canonicalOrigin))
  const username = await resolveEffectiveSiteUsername(user.id, user.global_name || user.username)
  const sessionCookie = await signSession({
    discordId: user.id,
    username,
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
  return withNoStore(response)
}

export async function GET(request: NextRequest) {
  const elapsedMs = createAuthTimer()
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const discordError = url.searchParams.get('error')
  let consumedOAuthCookieName: string | null = null
  const complete = (response: NextResponse): NextResponse => {
    response.headers.set('referrer-policy', 'no-referrer')
    return applyOAuthBindingConsumption(response, request, consumedOAuthCookieName)
  }
  const fail = (
    state: OAuthStatePayload | null,
    reason: string,
    extra?: Record<string, unknown>,
  ): NextResponse =>
    complete(errorRedirect(request, state, reason, {
      ...(extra ?? {}),
      duration_ms: elapsedMs(),
    }))

  const consumeStateBinding = (state: OAuthStatePayload): boolean => {
    const cookieName = oauthStateBindingCookieName(state.nonce)
    if (!hasOAuthStateBindingCookie(request.cookies, state.nonce)) {
      return false
    }
    consumedOAuthCookieName = cookieName
    return true
  }

  // start 에서 prompt=none 으로 보낸 사용자가 처음 인증하는 경우 Discord 가
  // consent_required 로 응답한다 — 신규 사용자에게 동의 화면을 띄우기 위해
  // prompt=consent 로 한 번만 retry. state 가 유효하면 originHost / returnTo
  // / invite 를 그대로 보존해 새 state 로 재발급.
  if (discordError === 'consent_required' && returnedState) {
    const fallbackState = await verifyOAuthState(returnedState)
    const fallbackBinding = fallbackState
      ? consumeStateBinding(fallbackState)
      : false
    if (fallbackState && fallbackBinding) {
      const retryFlowId = crypto.randomUUID()
      const retryState = await signOAuthState({
        originHost: fallbackState.originHost,
        returnTo: fallbackState.returnTo,
        invite: fallbackState.invite,
        preferredLocale: fallbackState.preferredLocale,
        nonce: retryFlowId,
      })
      const response = NextResponse.redirect(
        buildAuthorizeUrl(retryState, { prompt: 'consent' }),
      )
      response.headers.set('referrer-policy', 'no-referrer')
      response.cookies.set(
        oauthStateBindingCookieName(retryFlowId),
        AUTH_FLOW_BINDING_COOKIE_VALUE,
        oauthStateBindingCookieOptions(request.headers.get('host')),
      )
      return complete(withNoStore(response))
    }
    return fail(fallbackState, 'state_browser_mismatch')
  }

  if (discordError) {
    const errorState = returnedState ? await verifyOAuthState(returnedState) : null
    if (!returnedState || !errorState) return fail(errorState, 'state_mismatch')
    const errorBinding = consumeStateBinding(errorState)
    if (!errorBinding) {
      return fail(errorState, 'state_browser_mismatch')
    }
    return fail(errorState, 'denied', { discord_error: discordError })
  }
  if (!code || !returnedState) return fail(null, 'invalid')

  const state = await verifyOAuthState(returnedState)
  if (!state) {
    return fail(null, 'state_mismatch', {
      state_present: !!returnedState,
      state_length: returnedState.length,
    })
  }
  const stateBinding = consumeStateBinding(state)
  if (!stateBinding) {
    return fail(state, 'state_browser_mismatch')
  }

  try {
    const token = await exchangeCode(code)
    const [user, userGuilds] = await Promise.all([
      getCurrentUser(token.access_token),
      listUserGuilds(token.access_token).catch((e) => {
        log.error('[discord-callback] listUserGuilds failed', e)
        return [] as Awaited<ReturnType<typeof listUserGuilds>>
      }),
    ])
    if (!user) return fail(state, 'no_identity')

    // Phase 3: 유저의 Discord 길드 목록 → tenants 매칭.
    const tenantByDiscordGuildId = await getTenantDiscordConfigsByDiscordGuildIds(
      userGuilds.map((g) => g.id),
    )
    const matchedTenants: TenantDiscordConfig[] = []
    for (const g of userGuilds) {
      const tenant = tenantByDiscordGuildId.get(g.id) ?? null
      if (tenant && tenant.botInstalled) matchedTenants.push(tenant)
    }

    const returnTo = sanitizeInternalReturnTo(state.returnTo)
    const isRegularEventLogin = !state.invite && extractEventIdFromReturnTo(returnTo) !== null

    // 이벤트 게스트 스코프를 먼저 해석한다.
    // - 게스트 권한은 유효한 invite 토큰이 있을 때만 부여한다.
    // - 일반 이벤트 링크(`/events/:id`)는 길드원/연합원 로그인 전용이다.
    const guestAuthScope = await resolveEventGuestAuthScope(getAdminClient(), {
      inviteToken: state.invite,
      returnTo,
    })
    const inviteEventScope = guestAuthScope?.eventId ?? null
    const inviteTenantId = guestAuthScope?.guildId ?? null
    const explicitTargetTenant = await resolveAuthTargetTenant(returnTo, {
      db: getAdminClient(),
      resolveTenantBySlug,
      getTenantDiscordConfig,
    })
    const originTenantFallback = await resolveOriginTenantFallback(state, matchedTenants)
    const originCandidates = mergeTenantMatches(originTenantFallback, matchedTenants)
    const loginCandidateTenants = explicitTargetTenant
      ? [
          explicitTargetTenant,
          ...originCandidates.filter((tenant) => tenant.id !== explicitTargetTenant.id),
        ]
      : originCandidates
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
      const destinationPath = returnTo.startsWith('/onboard/setup/') ? returnTo : '/onboard'
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
      recordAuthSuccess(request, 'callback', {
        flow_id: state.nonce,
        mode: 'onboard',
        onboardable_guilds: onboardableGuilds.length,
        return_to: returnTo,
        duration_ms: elapsedMs(),
      })
      return complete(
        await onboardingResponse(url.origin, user, onboardableGuilds, destinationPath),
      )
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
        explicitTargetTenant ??
        (originSlug ? loginCandidateTenants.find((t) => t.slug === originSlug) : undefined) ??
        loginCandidateTenants[0]

      const member = await getGuildMemberByBot(tenant.discordGuildId, user.id)
      if (!member && (!inviteEventScope || inviteTenantId !== tenant.id)) {
        return fail(state, 'not_in_guild', {
          tenant_id: tenant.id,
          matched_tenants: loginCandidateTenants.length,
          user_guild_matched_tenants: matchedTenants.length,
          origin_tenant_fallback: originTenantFallback?.id ?? null,
          explicit_target_tenant: explicitTargetTenant?.id ?? null,
        })
      }
      if (member) {
        const memberSession = await buildDiscordMemberSession({
          tenant,
          discordId: user.id,
          user,
          member,
          preferredLocale: state.preferredLocale,
        })
        if (memberSession.session.isAdmin) {
          // 무활동 테넌트 식별 신호 — 슈퍼어드민 UI 에서만 사용. 실패해도 로그인은 계속.
          scheduleAuthPostResponseTask(
            'recordAdminLogin',
            () => recordAdminLogin(tenant.id),
            { tenant_id: tenant.id, discord_id: user.id },
          )
        }
        const destination = resolveDiscordMemberPostLoginPath(
          returnTo,
          memberSession.preferredLocale,
        )
        recordAuthSuccess(request, 'callback', {
          flow_id: state.nonce,
          mode: memberSession.mode,
          tenant_id: tenant.id,
          return_to: returnTo,
          duration_ms: elapsedMs(),
        })
        return complete(await buildHopRedirect(
          request,
          tenant.slug,
          memberSession.session,
          destination,
          memberSession.preferredLocale,
          state.nonce,
        ))
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
      if (!isRegularEventLogin && onboardableGuilds.length > 0) {
        recordAuthSuccess(request, 'callback', {
          flow_id: state.nonce,
          mode: 'onboard',
          onboardable_guilds: onboardableGuilds.length,
          return_to: returnTo,
          duration_ms: elapsedMs(),
        })
        return complete(await onboardingResponse(url.origin, user, onboardableGuilds))
      }
      return fail(
        state,
        loginCandidateTenants.length > 0 ? 'no_role' : 'not_in_guild',
        {
          matched_tenants: loginCandidateTenants.length,
          user_guild_matched_tenants: matchedTenants.length,
          origin_tenant_fallback: originTenantFallback?.id ?? null,
          explicit_target_tenant: explicitTargetTenant?.id ?? null,
        },
      )
    }

    // 게스트: 이벤트 스코프로 로그인. 이벤트가 속한 tenant 의 서브도메인으로 hop.
    // inviteTenantId 는 위에서 이미 events 테이블 조회로 채워져 있다.
    const guestGuildId = inviteTenantId ?? (await getPrimaryTenantId())

    const guestTenant = await getTenantDiscordConfig(guestGuildId)
    const guestSlug = guestTenant?.slug ?? FALLBACK_TENANT_SLUG

    const { data: revokedGuest, error: revokedGuestError } = await db
      .from('guest_revocations')
      .select('discord_id')
      .eq('guild_id', guestGuildId)
      .eq('discord_id', user.id)
      .maybeSingle()
    if (revokedGuestError) {
      log.error('[discord-callback] guest revocation lookup failed', revokedGuestError, {
        tenant_id: guestGuildId,
        discord_id: user.id,
      })
      return fail(state, 'server_error')
    }
    if (revokedGuest) {
      return fail(state, 'no_role', {
        tenant_id: guestGuildId,
        event_scope: eventScope,
        guest_revoked: true,
      })
    }

    const { data: existingGuest } = await db
      .from('guests')
      .select('discord_id, preferred_language')
      .eq('guild_id', guestGuildId)
      .eq('discord_id', user.id)
      .maybeSingle()
    const displayName = await resolveEffectiveSiteUsername(user.id, user.global_name || user.username)

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
    recordAuthSuccess(request, 'callback', {
      flow_id: state.nonce,
      mode: 'guest',
      tenant_id: guestGuildId,
      return_to: returnTo,
      event_scope: eventScope,
      duration_ms: elapsedMs(),
    })
    return complete(await buildHopRedirect(
      request,
      guestSlug,
      guestSession,
      scopedReturnTo,
      isLocale(guestPreferred) ? guestPreferred : null,
      state.nonce,
    ))
  } catch (e) {
    log.error('[discord-callback] unhandled', e, { return_to: redactUrlSearch(state.returnTo) })
    return fail(state, 'server_error')
  }
}
