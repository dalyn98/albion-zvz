import { after, NextRequest, NextResponse } from 'next/server'
import { signSession, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session'
import { ALL_CAPABILITIES, serializeCapabilities } from '@/lib/permissions'
import { getDiscordGuild, exchangeBotInstallCode, getCurrentUser } from '@/lib/discord'
import { getAdminClient } from '@/lib/supabase-admin'
import { isValidTenantSlug } from '@/lib/tenant-resolver'
import { upsertGuildAvatar } from '@/lib/discord-avatar'
import { recordAdminLogin } from '@/lib/tenant-activity'
import { LAST_GUILD_COOKIE, lastGuildCookieOptions } from '@/lib/last-guild-cookie'
import { log } from '@/lib/log'
import { createAuthTimer, recordAuthSuccess } from '@/lib/auth-telemetry'
import { withNoStore } from '@/lib/no-store-response'
import { redactSearchParams } from '@/lib/redact-search-params'
import { captureTenantAcquisitionSource, SEO_SESSION_COOKIE } from '@/lib/seo-attribution'
import { logTenantOnboardingEvent } from '@/lib/tenant-onboarding-events'
import { SLOT_ROLES, EVENT_CATEGORIES } from '@/types'

const ONBOARD_GUILDS_COOKIE = 'discord_onboard_guilds'

// 봇이 Discord 길드에 설치된 뒤 Discord 가 redirect 로 호출하는 엔드포인트.
// Query: guild_id=..., permissions=..., code=... (state 는 Discord 가 bot scope +
// disable_guild_select 조합에서 echo 하지 않음 — 실측으로 확인됨)
//
// 무결성 보장:
//   1. code 를 Discord 토큰 엔드포인트로 교환 — Discord 만 발급할 수 있는
//      authentic 한 인증 토큰을 받아낸다 (state 보다 강한 증거).
//   2. 그 토큰으로 /users/@me 호출해 *실제 설치자* 신원을 확정. 사이트 세션과
//      다른 Discord 계정으로 설치한 경우(웹/앱 다중 계정) 도 정확히 잡는다.
//   3. 봇이 실제로 그 길드에 설치되어 있어야 한다 (getDiscordGuild) — code 가
//      유효해도 봇이 들어있지 않으면 (브라우저 도중 닫힘 등) 거부.
//
// 사이트 세션 != 설치자: 설치자(installerDiscordId) 를 tenant 소유자로 박고,
// 세션도 설치자 신원으로 재발급한다. MANAGE_GUILD 권한을 가진 쪽에 onboarding
// 권한을 주는 게 맞기 때문 — 사이트에 A 로 로그인했다가 봇은 B 로 설치한 경우,
// B 가 그 길드의 admin 이고 A 는 그 길드와 무관하다.

function errorRedirect(origin: string, reason: string): NextResponse {
  const url = new URL('/onboard', origin)
  url.searchParams.set('install_error', reason)
  return withNoStore(NextResponse.redirect(url))
}

// guild.name 에서 slug 초안을 뽑는다. 반드시 isValidTenantSlug 를 통과해야 —
// 통과하지 못하면 `guild-<suffix>` 로 폴백. 충돌은 호출부 retry 로 처리.
// 제약: a-z0-9/hyphen, 2–32자, 선/후 하이픈 금지, 연속 하이픈 금지, reserved 제외.
function slugifyGuildName(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    // 비 ASCII (한글/한자 포함) 는 제거 — slug 는 DNS 호스트명으로 쓰이므로.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

  const candidate = base.length > 0 ? `${base}-${suffix}` : `guild-${suffix}`
  if (isValidTenantSlug(candidate)) return candidate
  // base 가 reserved 와 정확히 일치하는 경우 등에 대비한 보수적 폴백.
  return `guild-${suffix}`
}

const MAX_SLUG_ATTEMPTS = 5

async function runPostResponseTask(
  label: string,
  task: () => Promise<unknown>,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await task()
  } catch (error) {
    log.error(`[bot-callback] post-response ${label} failed`, error, context)
  }
}

function scheduleBotCallbackPostResponseWork(input: {
  request: NextRequest
  tenantId: string
  installerDiscordId: string
  discordGuildId: string
  guildName: string
  createdTenant: boolean
}): void {
  const visitorId = input.request.cookies.get(SEO_SESSION_COOKIE)?.value ?? null
  const context = {
    tenant_id: input.tenantId,
    discord_guild_id: input.discordGuildId,
    installer_discord_id: input.installerDiscordId,
  }

  after(async () => {
    await Promise.all([
      runPostResponseTask('recordAdminLogin', () => recordAdminLogin(input.tenantId), context),
      runPostResponseTask(
        'logTenantOnboardingEvent',
        () =>
          logTenantOnboardingEvent({
            guildId: input.tenantId,
            actorDiscordId: input.installerDiscordId,
            eventType: 'bot_installed',
            details: {
              discordGuildId: input.discordGuildId,
              guildName: input.guildName,
              createdTenant: input.createdTenant,
            },
          }),
        context,
      ),
      runPostResponseTask(
        'captureTenantAcquisitionSource',
        () => captureTenantAcquisitionSource({ tenantId: input.tenantId, visitorId }),
        context,
      ),
    ])
  })
}

export async function GET(request: NextRequest) {
  const elapsedMs = createAuthTimer()
  const url = new URL(request.url)
  const discordError = url.searchParams.get('error')
  if (discordError) return errorRedirect(url.origin, 'denied')

  // 사이트 세션은 의도적으로 확인하지 않는다. 사용자가 사이트에서는 A 계정으로
  // 로그인하고 봇은 B 계정으로 설치하는 경우가 흔하기 때문 (웹/앱 다른 계정).
  // 모든 신원은 아래에서 code 교환으로 가져오는 installer 한 곳에서 결정한다.

  const guildId = url.searchParams.get('guild_id')
  if (!guildId || !/^\d{17,20}$/.test(guildId)) {
    log.error('[bot-callback] invalid guild_id', undefined, { params: redactSearchParams(url.searchParams) })
    return errorRedirect(url.origin, 'guild_id_missing')
  }

  const code = url.searchParams.get('code')
  if (!code) {
    log.error('[bot-callback] missing code', undefined, { params: redactSearchParams(url.searchParams) })
    return errorRedirect(url.origin, 'code_missing')
  }

  try {
    // code 교환 → /users/@me 로 실제 설치자 확정. 이걸 통과해야 Discord 가
    // 발급한 진짜 code 라는 게 증명된다 (사이트 세션 위변조와 무관한 확신).
    const tokenRes = await exchangeBotInstallCode(code)
    const [installer, guild] = await Promise.all([
      getCurrentUser(tokenRes.access_token),
      getDiscordGuild(guildId),
    ])
    if (!installer) {
      log.error('[bot-callback] /users/@me returned null', undefined, { guild_id: guildId })
      return errorRedirect(url.origin, 'identity_unknown')
    }

    // 봇이 실제로 길드에 들어있어야 한다. 들어있지 않으면 설치 실패 또는
    // 브라우저에서 도중 창을 닫은 경우.
    if (!guild) return errorRedirect(url.origin, 'bot_not_in_guild')

    const installerDiscordId = installer.id
    const db = getAdminClient()
    // 이미 이 Discord 길드에 대한 tenant 가 있으면 재사용 — 재설치 시나리오.
    // created_by_discord_id 는 건드리지 않는다 (원래 설치자 보존).
    const { data: existing } = await db
      .from('tenants')
      .select('id, slug, created_by_discord_id')
      .eq('discord_guild_id', guildId)
      .maybeSingle()

    let tenantId: string
    let tenantSlug: string
    let tenantOwnerDiscordId: string
    let createdTenant = false
    if (existing) {
      tenantId = existing.id as string
      tenantSlug = existing.slug as string
      tenantOwnerDiscordId = (existing.created_by_discord_id as string) ?? installerDiscordId
      // 재설치: name/bot_installed_at 만 갱신. status 는 건드리지 않는다 —
      // 이미 active 면 active 유지 (라이브 사이트 영향 없음), pending 이면
      // 위저드 재진입이 자연스럽도록 pending 유지.
      await db
        .from('tenants')
        .update({
          name: guild.name,
          bot_installed_at: new Date().toISOString(),
        })
        .eq('id', tenantId)
    } else {
      // 신규 INSERT 는 status='pending'. 위저드 3단계 (saveTenantRewards) 가
      // status='active' 로 flip 해야 subdomain 해상도 (resolveTenantBySlug) 가
      // 이 tenant 를 인식한다. 위저드 중단 tenant 는 pending 상태로 남아
      // `{slug}.albion-guildmanager.com` 에 영향을 주지 않는다.
      //
      // slug 는 tenants.slug UNIQUE 제약을 받는다. 새 suffix 로 최대 5회
      // 재시도 — 실제 충돌 확률은 4^36 suffix space 에서 매우 낮지만 방어적.
      let tenantRow: { id: string; slug: string } | null = null
      let lastInsertError: unknown = null
      for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
        const { data: inserted, error: insertError } = await db
          .from('tenants')
          .insert({
            discord_guild_id: guildId,
            slug: slugifyGuildName(guild.name),
            name: guild.name,
            status: 'pending',
            bot_installed_at: new Date().toISOString(),
            created_by_discord_id: installerDiscordId,
          })
          .select('id, slug')
          .single()
        if (inserted && !insertError) {
          tenantRow = inserted as { id: string; slug: string }
          break
        }
        lastInsertError = insertError
        // Postgres unique_violation code = 23505.
        const errorCode = (insertError as { code?: string } | null)?.code
        if (errorCode !== '23505') break
      }
      if (!tenantRow) {
        log.error('[bot-callback] tenant insert failed', lastInsertError, {
          guild_id: guildId,
          installer_discord_id: installerDiscordId,
        })
        return errorRedirect(url.origin, 'server_error')
      }
      tenantId = tenantRow.id
      tenantSlug = tenantRow.slug
      tenantOwnerDiscordId = installerDiscordId
      createdTenant = true

      // 새 tenant 에 기본 role_rewards row 를 seed (silver=0 = "미설정, 리기어 차단").
      // onboarding 위저드 3단계에서 관리자가 실버 값을 채운다. 실패해도 tenant
      // 생성 자체는 성공한 상태이므로 에러 로그만 남기고 진행 — 위저드에서 upsert
      // 으로 다시 시도할 수 있다.
      const seedRows = SLOT_ROLES.map((role_name) => ({
        guild_id: tenantId,
        role_name,
        silver: 0,
        updated_at: new Date().toISOString(),
      }))
      const { error: seedError } = await db
        .from('role_rewards')
        .upsert(seedRows, { onConflict: 'guild_id,role_name' })
      if (seedError) {
        log.error('[bot-callback] role_rewards seed failed', seedError, { tenant_id: tenantId })
      }
    }

    // 설치자를 즉시 이 tenant 의 admin 세션으로 설정 — 설정 페이지에서 바로
    // 역할/채널을 저장할 수 있게. 사이트 세션과 다른 Discord 계정으로 설치한
    // 경우(웹/앱 다중 계정) 도 여기서 설치자 신원으로 세션을 재발급해 줘서
    // onboarding 위저드의 verifyTenantOwnership 가 통과되도록 한다.
    //
    // 재설치 시 tenantOwnerDiscordId 와 installerDiscordId 가 다르면 — 다른
    // 사람이 봇을 재설치한 케이스. tenant 소유자는 원래 사람으로 유지하지만
    // 세션은 발급하지 않는다 (onboarding 권한 없음). 이 경우 /onboard 으로
    // 돌려보낸다.
    if (tenantOwnerDiscordId !== installerDiscordId) {
      log.warn('[bot-callback] reinstall by non-owner', {
        tenant_owner_discord_id: tenantOwnerDiscordId,
        installer_discord_id: installerDiscordId,
        tenant_id: tenantId,
      })
      return errorRedirect(url.origin, 'not_owner')
    }

    const installerUsername = installer.global_name ?? installer.username

    // 정상 OAuth 콜백(/api/auth/discord/callback) 은 로그인 시점에 guild_avatars
    // 행을 upsert 한다. 봇 설치자는 그 경로를 거치지 않을 수 있으므로 (다른
    // Discord 계정으로 사이트에 들어왔다거나, 사이트 로그인 없이 바로 봇 설치
    // 링크를 클릭했거나) 여기서 보장. albion_server 등 알비온 식별자 컬럼은
    // 빈 상태로 유지되어 onboarding 모달이 자연스럽게 한 번 뜨고 manual save 등
    // UPDATE 가 0 rows 가 되지 않는다.
    try {
      await upsertGuildAvatar(
        tenantId,
        installerDiscordId,
        installerUsername,
        installer.avatar,
        true,
        false,
      )
    } catch (e) {
      log.error('[bot-callback] upsertGuildAvatar failed', e, {
        tenant_id: tenantId,
        installer_discord_id: installerDiscordId,
      })
    }

    const newSession = await signSession({
      discordId: installerDiscordId,
      username: installerUsername,
      avatar: installer.avatar,
      isMember: true,
      isAdmin: true,
      isGuest: false,
      isBombSquadCaller: false,
      isLocalGuildAccount: false,
      isAllianceCandidate: false,
      canCreateEvents: true,
      eventCreatorCategories: [...EVENT_CATEGORIES],
      eventScope: null,
      guildId: tenantId,
      // 봇 설치자는 곧장 첫 admin — ALL_CAPABILITIES 명시 부여. Discord role
      // 별 grant 가 아직 비어 있어도 capability 게이트가 모두 통과.
      capabilities: serializeCapabilities(ALL_CAPABILITIES),
      issuedAt: Date.now(),
    })

    const response = NextResponse.redirect(new URL(`/onboard/setup/${tenantId}`, url.origin))
    response.cookies.set(SESSION_COOKIE_NAME, newSession, cookieOptions())
    response.cookies.set(
      LAST_GUILD_COOKIE,
      tenantSlug,
      lastGuildCookieOptions(request.headers.get('host')),
    )
    response.cookies.delete(ONBOARD_GUILDS_COOKIE)
    recordAuthSuccess(request, 'bot_callback', {
      tenant_id: tenantId,
      discord_guild_id: guildId,
      created_tenant: createdTenant,
      duration_ms: elapsedMs(),
    })
    scheduleBotCallbackPostResponseWork({
      request,
      tenantId,
      installerDiscordId,
      discordGuildId: guildId,
      guildName: guild.name,
      createdTenant,
    })
    return withNoStore(response)
  } catch (e) {
    log.error('[bot-callback] unhandled', e, { guild_id: guildId })
    return errorRedirect(url.origin, 'server_error')
  }
}
