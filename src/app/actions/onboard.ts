'use server'


import { publicActionError } from '@/lib/public-action-error'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'
import {
  getSession,
  signSession,
  SESSION_COOKIE_NAME,
  cookieOptions,
  type SessionPayload,
} from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { isValidTenantSlug, slugBaseFromAlbionGuildName } from '@/lib/tenant-slug'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import { signHopToken } from '@/lib/oauth-state'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { AODP_ALLOWED_CITIES } from '@/lib/shop/aodp-constants'
import { isValidTenantTimezone } from '@/lib/timezone'
import { recordAdminLogin } from '@/lib/tenant-activity'
import { ALL_CAPABILITIES, serializeCapabilities } from '@/lib/permissions'
import { log } from '@/lib/log'
import { EVENT_CATEGORIES } from '@/types'
import { isDiscordId, normalizeDiscordIdList } from '@/lib/discord-id'
import { logTenantOnboardingEvent } from '@/lib/tenant-onboarding-events'
import { invalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { invalidateTenantDirectoryCache } from '@/lib/tenant-cache'
import {
  fetchDiscordGuildChannels,
  fetchDiscordGuildRoles,
} from '@/lib/discord-guild-resources'
import {
  AUTH_FLOW_BINDING_COOKIE_VALUE,
  canShareAuthBindingCookie,
  hopTokenBindingCookieName,
  hopTokenBindingCookieOptions,
} from '@/lib/auth-flow-cookie'

// 온보딩 위저드는 3 단계다. 각 단계별 액션은 세션이 tenant 의 created_by_discord_id
// 와 일치하는지만 독립적으로 검증하고, 세션 자체(isAdmin 등) 는 bot-callback 에서
// 이미 세팅된 값을 그대로 쓴다. 마지막 단계에서만 세션을 재서명해 issuedAt 을
// 갱신하고 홈 길드 컨텍스트를 확정한다.
//
// (봇 설치 시작점은 /api/auth/discord/bot-install 라우트 핸들러로 옮겼다.
// server action + Set-Cookie + 외부 redirect 조합이 Next.js 에서 신뢰할 수 없었음.)

interface TenantOwnerCheck {
  id: string
  discord_guild_id: string
  created_by_discord_id: string
}

// 세 단계가 공유하는 owner 검증. created_by_discord_id 와 세션 유저가 같아야
// 설정 변경 가능. 봇 설치 callback 이 심어놓은 값을 기준으로 한다.
async function verifyTenantOwnership(
  tenantId: string,
  session: SessionPayload,
): Promise<TenantOwnerCheck | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id, discord_guild_id, created_by_discord_id')
    .eq('id', tenantId)
    .maybeSingle()
  if (!data) return null
  if (data.created_by_discord_id !== session.discordId) return null
  return {
    id: data.id as string,
    discord_guild_id: data.discord_guild_id as string,
    created_by_discord_id: data.created_by_discord_id as string,
  }
}

interface SaveTenantSetupInput {
  tenantId: string
  memberRoleIds: string[]
  adminRoleIds: string[]
  eventChannelId: string
  timezone: string
}

// 단계 1: Discord 역할 + 공지 채널 + 시간대. 저장 후 세션은 건드리지 않고
// 클라이언트가 다음 단계로 네비게이트.
//
// 서브도메인 slug 는 이 단계에서 받지 않는다 — 봇 설치 시 자동 생성된 임시
// slug ("guild-xxxx") 가 그대로 들어가 있고, 단계 2(saveTenantAlbion) 에서
// 알비온 홈 길드 이름 기반으로 자동 갱신된다.
export async function saveTenantSetup(
  input: SaveTenantSetupInput,
): Promise<{ error?: string }> {
  const t = await getTranslations('onboard')
  const session = await getSession()
  if (!session) return { error: t('unauthorized') }

  if (!Array.isArray(input.memberRoleIds) || !Array.isArray(input.adminRoleIds)) {
    return { error: t('errorGeneric') }
  }

  const memberRoleIds = normalizeDiscordIdList(input.memberRoleIds)
  if (!memberRoleIds) return { error: t('errorGeneric') }
  if (memberRoleIds.length === 0) {
    return { error: t('missingRoles') }
  }

  // self-lockout 방어: admin_role_ids 가 비면 세션 만료 후 이 tenant 에
  // 아무도 관리자로 들어올 수 없다. 서버 쪽에서 한 번 더 막는다.
  const adminRoleIds = normalizeDiscordIdList(input.adminRoleIds)
  if (!adminRoleIds) return { error: t('errorGeneric') }
  if (adminRoleIds.length === 0) {
    return { error: t('missingAdminRoles') }
  }

  if (!input.eventChannelId) {
    return { error: t('missingEventChannel') }
  }
  if (!isDiscordId(input.eventChannelId)) {
    return { error: t('errorGeneric') }
  }

  if (!isValidTenantTimezone(input.timezone)) {
    return { error: t('errorGeneric') }
  }

  const tenant = await verifyTenantOwnership(input.tenantId, session)
  if (!tenant) return { error: t('unauthorized') }

  let availableRoles
  let availableChannels
  try {
    const [roles, channels] = await Promise.all([
      fetchDiscordGuildRoles(tenant.discord_guild_id),
      fetchDiscordGuildChannels(tenant.discord_guild_id),
    ])
    availableRoles = roles
      .filter(
        (role) =>
          role.id !== tenant.discord_guild_id &&
          !role.managed,
      )
    availableChannels = channels.filter(
      (channel) => channel.type === 0 || channel.type === 5,
    )
  } catch (error) {
    log.warn('[saveTenantSetup] Discord resource verification failed', {
      tenant_id: input.tenantId,
      discord_guild_id: tenant.discord_guild_id,
      error_message: error instanceof Error ? error.message : String(error),
    })
    return { error: t('errorGeneric') }
  }
  const roleById = new Map(availableRoles.map((role) => [role.id, role]))
  if (
    [...memberRoleIds, ...adminRoleIds].some(
      (roleId) => !roleById.has(roleId),
    )
  ) {
    return { error: t('errorGeneric') }
  }
  if (
    !availableChannels.some(
      (channel) => channel.id === input.eventChannelId,
    )
  ) {
    return { error: t('errorGeneric') }
  }

  const db = getAdminClient()
  const { error } = await db
    .from('tenants')
    .update({
      member_role_ids: memberRoleIds,
      event_channel_id: input.eventChannelId,
    })
    .eq('id', input.tenantId)
  if (error) {
    return { error: await publicActionError(error, 'actions/onboard') }
  }

  const { error: permissionError } = await db.rpc(
    'replace_onboarding_permission_admin_roles',
    {
      p_guild_id: input.tenantId,
      p_roles: adminRoleIds.map((roleId) => ({
        id: roleId,
        name: roleById.get(roleId)!.name,
      })),
      p_actor_discord_id: session.discordId,
    },
  )
  if (permissionError) {
    return {
      error: await publicActionError(
        permissionError,
        'actions/onboard.permissions',
      ),
    }
  }

  // 시간대는 app_settings 에 저장 — tenants 테이블에는 안 둠 (다른 timezone 관련
  // 동작도 app_settings 를 단일 진실원천으로). 이 단계 실패는 ignore — 위저드
  // 진행은 계속하고 admin settings 에서 다시 저장 가능.
  await db.from('app_settings').upsert(
    [
      {
        guild_id: input.tenantId,
        key: 'tenant_timezone',
        value: input.timezone,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'guild_id,key' },
  )
  invalidateAppSettingsCache(input.tenantId)
  invalidateTenantDirectoryCache()

  await logTenantOnboardingEvent({
    guildId: input.tenantId,
    actorDiscordId: session.discordId,
    eventType: 'setup_step_saved',
    details: {
      step: 'discord',
      memberRoleCount: memberRoleIds.length,
      adminRoleCount: adminRoleIds.length,
      eventChannelConfigured: !!input.eventChannelId,
      timezone: input.timezone,
    },
  })

  return {}
}

interface SaveTenantAlbionInput {
  tenantId: string
  server: string
  homeGuildId: string
  homeGuildName: string
  // 기준 거래소 도시. 빈 문자열이면 저장 생략 (기존 default 유지).
  aodpCity?: string
}

const MAX_HOME_GUILD_ID_LENGTH = 500
const MAX_HOME_GUILD_NAME_LENGTH = 200
const SLUG_FALLBACK_RETRIES = 5

// 다른 tenant 가 같은 알비온 홈 길드(UUID) 를 등록한 상태인지 확인한다. 인덱스
// (mig 101) 가 DB 레벨에서도 강제하지만, 사용자 친화적인 에러 메시지를 주려면
// 먼저 SELECT 로 확인하는 게 깔끔. 자기 자신은 결과에서 제외.
async function findHomeGuildConflict(
  db: ReturnType<typeof getAdminClient>,
  homeGuildId: string,
  excludeTenantId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('app_settings')
    .select('guild_id')
    .eq('key', 'albion_home_guild_id')
    .eq('value', homeGuildId)
    .neq('guild_id', excludeTenantId)
    .limit(1)
  if (error) {
    // 조회 실패 시 보수적으로 false (= 충돌 없음으로 가정). DB unique index 가
    // 최종 안전망이라 false 양성이라도 INSERT 단계에서 23505 로 거부됨.
    log.warn('[saveTenantAlbion] conflict check failed', {
      tenant_id: excludeTenantId,
      home_guild_id: homeGuildId,
      error: await publicActionError(error, 'actions/onboard'),
    })
    return false
  }
  return Array.isArray(data) && data.length > 0
}

// 알비온 길드명 base 부터 시작해 충돌 없는 tenants.slug 를 찾는다. 호출 패턴:
//   1차: base 단독 ("jelda") — 사용자가 가장 원하는 깨끗한 형태
//   2~6차: base-{random4} ("jelda-a1b2") — 충돌 시 4글자 random suffix 로 회피
// 모두 실패하면 null 반환 → 호출부가 slug 갱신을 skip 하고 기존 slug 유지.
async function findUniqueSlug(
  db: ReturnType<typeof getAdminClient>,
  base: string,
  excludeTenantId: string,
): Promise<string | null> {
  const isAvailable = async (candidate: string): Promise<boolean> => {
    if (!isValidTenantSlug(candidate)) return false
    const { data, error } = await db
      .from('tenants')
      .select('id')
      .eq('slug', candidate)
      .neq('id', excludeTenantId)
      .maybeSingle()
    if (error) {
      log.warn('[saveTenantAlbion] slug availability check failed', {
        tenant_id: excludeTenantId,
        candidate,
        error: await publicActionError(error, 'actions/onboard'),
      })
      return false
    }
    return !data
  }

  if (await isAvailable(base)) return base

  for (let i = 0; i < SLUG_FALLBACK_RETRIES; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 6)
    const candidate = `${base}-${suffix}`
    if (await isAvailable(candidate)) return candidate
  }
  return null
}

// 단계 2: 알비온 서버 + 홈 길드. 길드 UUID/이름은 서버별로 다르기 때문에 셋을
// 원자적으로 저장해야 한다 — app_settings PK 는 (guild_id, key) 복합.
//
// homeGuildName 은 killboard-sync 의 동명이인 매칭과 verifyDeathInWindow 의 길드
// 일치 검증에 사용된다 (env 하드코딩 ALBION_GUILD_NAME 대체).
//
// 추가로 (사용자 요청 2026-04-26) 홈 길드 인증이 끝나는 이 시점에 서브도메인
// slug 도 길드 이름 기반으로 자동 갱신된다 — 사이트 곳곳에 표시되는 식별자가
// 알비온 길드 이름과 일치하도록. 한 알비온 길드는 한 사이트에만 연결될 수 있어
// (mig 101 unique index) 동일 UUID 가 다른 tenant 에 이미 등록된 상태면 에러.
export async function saveTenantAlbion(
  input: SaveTenantAlbionInput,
): Promise<{ error?: string }> {
  const t = await getTranslations('onboard')
  const session = await getSession()
  if (!session) return { error: t('unauthorized') }

  const tenant = await verifyTenantOwnership(input.tenantId, session)
  if (!tenant) return { error: t('unauthorized') }

  if (!isAlbionServer(input.server)) {
    return { error: t('errorGeneric') }
  }
  const server: AlbionServer = input.server
  const homeGuildId = input.homeGuildId.trim()
  if (homeGuildId.length > MAX_HOME_GUILD_ID_LENGTH) {
    return { error: t('errorGeneric') }
  }
  const homeGuildName = (input.homeGuildName ?? '').trim()
  if (homeGuildName.length > MAX_HOME_GUILD_NAME_LENGTH) {
    return { error: t('errorGeneric') }
  }
  if (!homeGuildId || !homeGuildName) {
    return { error: t('homeGuildRequired') }
  }

  const db = getAdminClient()

  const conflict = await findHomeGuildConflict(db, homeGuildId, input.tenantId)
  if (conflict) return { error: t('homeGuildAlreadyRegistered') }

  const base = slugBaseFromAlbionGuildName(homeGuildName)
  // base 가 비었거나 reserved 단어와 매칭되는 등 invalid 라면 slug 갱신을
  // 포기하고 기존 자동 slug ("guild-xxxx") 그대로 유지. 한글/한자 길드명이
  // 흔히 이 케이스 — 그래도 사이트 동작에는 문제 없음.
  if (base.length > 0) {
    const newSlug = await findUniqueSlug(db, base, input.tenantId)
    if (newSlug) {
      const { error: slugError } = await db
        .from('tenants')
        .update({ slug: newSlug })
        .eq('id', input.tenantId)
      if (slugError) {
        // race 로 인한 충돌 — 다음 시도에서 새 random suffix 로 회피 가능.
        // 위저드 진행을 막지 않기 위해 로그만 남기고 통과.
        log.warn('[saveTenantAlbion] slug update failed', {
          tenant_id: input.tenantId,
          new_slug: newSlug,
          error: await publicActionError(slugError, 'actions/onboard'),
        })
      }
    }
  }

  const now = new Date().toISOString()
  const rows = [
    {
      guild_id: input.tenantId,
      key: 'albion_server',
      value: server,
      updated_at: now,
    },
    {
      guild_id: input.tenantId,
      key: 'albion_home_guild_id',
      value: homeGuildId,
      updated_at: now,
    },
    {
      guild_id: input.tenantId,
      key: 'albion_home_guild_name',
      value: homeGuildName,
      updated_at: now,
    },
  ]

  // 기준 도시는 선택 사항 — 명시 입력했고 화이트리스트 안에 있을 때만 저장.
  // 잘못된 값이 와도 위저드 진행은 막지 않고 그냥 무시 (관리자가 어드민 설정에서
  // 다시 고를 수 있다).
  const aodpCity = (input.aodpCity ?? '').trim()
  if (aodpCity.length > 0 && (AODP_ALLOWED_CITIES as readonly string[]).includes(aodpCity)) {
    rows.push({
      guild_id: input.tenantId,
      key: 'aodp_cities',
      value: JSON.stringify([aodpCity]),
      updated_at: now,
    })
  }

  const { error } = await db.from('app_settings').upsert(rows, {
    onConflict: 'guild_id,key',
  })
  if (error) {
    // unique index (mig 101) 가 race 로 막은 경우 — 위에서 SELECT 후 다른 tenant
    // 가 같은 UUID 를 등록했을 때. 사용자에겐 동일 메시지로 안내.
    if ((error as { code?: string }).code === '23505') {
      return { error: t('homeGuildAlreadyRegistered') }
    }
    return { error: await publicActionError(error, 'actions/onboard') }
  }
  invalidateAppSettingsCache(input.tenantId)
  invalidateTenantDirectoryCache()
  await logTenantOnboardingEvent({
    guildId: input.tenantId,
    actorDiscordId: session.discordId,
    eventType: 'setup_step_saved',
    details: {
      step: 'albion',
      server,
      homeGuildId,
      homeGuildName,
      aodpCityConfigured: aodpCity.length > 0,
    },
  })
  return {}
}

interface SaveTenantRewardsInput {
  tenantId: string
  rewards: Array<{ role_name: string; silver: number; payout_rate_percent: number }>
  policy: {
    regearSupportEnabled: boolean
    autoRegearEnabled: boolean
    craftRegearEnabled: boolean | null
    regearRequireVerification: boolean
    regearPayoutRatePercent: number
    eventsAutoStartEnabled: boolean
  }
}

// 단계 3 (최종): 리기어 정책 + 역할별 기본 실버. bot-callback 이 seed 를 못 했거나
// 실패한 경우를 대비해 upsert 로 저장 — mig 075 이후 PK=(guild_id, role_name)
// 이므로 conflict target 지정 가능.
//
// 정책 토글 (auto/craft/verification/payout/events_auto_start) 은 app_settings 에
// 저장. 어드민이 나중에 동일 키를 수정할 수 있으며, 저장 실패 시 도메인 기본값
// 으로 폴백 (admin 페이지에서 재설정 가능).
//
// 저장 성공 시:
//   1) tenants.status='pending' → 'active' 로 flip (이제 subdomain 해상도 가능)
//   2) canonical 도메인에서 현재 실행 중이라 가정하고 tenant 서브도메인으로 hop
//      → admin dashboard 는 {slug}.root/admin/dashboard 에만 존재하므로 세션 쿠키를
//      그 서브도메인에 심어야 한다.
//   3) hop token 으로 감싼 admin 세션을 subdomain /api/auth/finish 로 넘겨
//      로그인 완료 상태로 대시보드에 도착하게 한다.
//
// 반환: redirectUrl (클라이언트가 window.location.href 로 이동) 또는 error.
export async function saveTenantRewards(
  input: SaveTenantRewardsInput,
): Promise<{ error?: string; redirectUrl?: string }> {
  const t = await getTranslations('onboard')
  const session = await getSession()
  if (!session) return { error: t('unauthorized') }

  const tenant = await verifyTenantOwnership(input.tenantId, session)
  if (!tenant) return { error: t('unauthorized') }

  if (typeof input.policy?.regearSupportEnabled !== 'boolean') {
    return { error: t('supportRequiredError') }
  }
  if (
    input.policy.regearSupportEnabled &&
    typeof input.policy.craftRegearEnabled !== 'boolean'
  ) {
    return { error: t('errorGeneric') }
  }

  if (input.policy.regearSupportEnabled) {
    for (const r of input.rewards) {
      if (!Number.isInteger(r.silver) || r.silver < 0) {
        return { error: t('rewardsErrorInvalidSilver') }
      }
      if (typeof r.role_name !== 'string' || r.role_name.length === 0) {
        return { error: t('errorGeneric') }
      }
      if (!isValidRoleRegearPayoutRate(r.payout_rate_percent)) {
        return { error: t('rewardsErrorInvalidPayout') }
      }
    }
  }

  const payoutPercent = input.policy.regearPayoutRatePercent
  if (input.policy.regearSupportEnabled && (
    !Number.isInteger(payoutPercent) ||
    payoutPercent < 1 ||
    payoutPercent > 100
  )) {
    return { error: t('policyErrorInvalidPayout') }
  }

  const db = getAdminClient()
  const now = new Date().toISOString()
  const rows = input.rewards.map((r) => ({
    guild_id: input.tenantId,
    role_name: r.role_name,
    silver: r.silver,
    payout_rate_percent: r.payout_rate_percent,
    updated_at: now,
  }))
  if (input.policy.regearSupportEnabled) {
    const { error: rewardsError } = await db
      .from('role_rewards')
      .upsert(rows, { onConflict: 'guild_id,role_name' })
    if (rewardsError) {
      return {
        error: await publicActionError(rewardsError, 'actions/onboard'),
      }
    }
  }

  const policyRows = [
    {
      guild_id: input.tenantId,
      key: 'regear_support_enabled',
      value: input.policy.regearSupportEnabled ? 'true' : 'false',
      updated_at: now,
    },
    ...(input.policy.regearSupportEnabled ? [
    {
      guild_id: input.tenantId,
      key: 'auto_regear_enabled',
      value: input.policy.autoRegearEnabled ? 'true' : 'false',
      updated_at: now,
    },
    {
      guild_id: input.tenantId,
      key: 'craft_regear_enabled',
      value: input.policy.craftRegearEnabled ? 'true' : 'false',
      updated_at: now,
    },
    {
      guild_id: input.tenantId,
      key: 'regear_require_verification',
      value: input.policy.regearRequireVerification ? 'true' : 'false',
      updated_at: now,
    },
    {
      guild_id: input.tenantId,
      key: 'regear_payout_rate_percent',
      value: String(payoutPercent),
      updated_at: now,
    },
    ] : []),
    {
      guild_id: input.tenantId,
      key: 'events_auto_start_enabled',
      value: input.policy.eventsAutoStartEnabled ? 'true' : 'false',
      updated_at: now,
    },
  ]
  const { error: policyError } = await db
    .from('app_settings')
    .upsert(policyRows, { onConflict: 'guild_id,key' })
  if (policyError) {
    log.error('[saveTenantRewards] policy upsert failed', policyError, {
      tenant_id: input.tenantId,
    })
    return { error: t('errorGeneric') }
  }

  // 온보딩 완료 — tenant 를 active 로 flip 하고 slug 를 한 번에 조회.
  // 이미 active (재온보딩) 면 status 업데이트가 no-op 이지만 select 로
  // 현 slug 는 항상 최신값을 받아온다.
  const { data: activatedTenant, error: activateError } = await db
    .from('tenants')
    .update({ status: 'active' })
    .eq('id', input.tenantId)
    .select('slug')
    .single()
  if (activateError || !activatedTenant) {
    log.error('[saveTenantRewards] activation failed', activateError, {
      tenant_id: input.tenantId,
    })
    return { error: t('errorGeneric') }
  }
  invalidateAppSettingsCache(input.tenantId)
  invalidateTenantDirectoryCache()
  const tenantSlug = activatedTenant.slug as string

  // canonical 도메인용 세션도 업데이트 (혹시 그대로 canonical 에 남아있어도
  // admin 세션 상태). subdomain 쿠키는 hop token 을 통해 finish 엔드포인트가 심는다.
  const adminSession: SessionPayload = {
    discordId: session.discordId,
    username: session.username,
    avatar: session.avatar,
    isMember: true,
    isAdmin: true,
    isGuest: false,
    isBombSquadCaller: false,
    isLocalGuildAccount: false,
    isAllianceCandidate: false,
    canCreateEvents: true,
    eventCreatorCategories: [...EVENT_CATEGORIES],
    eventScope: null,
    guildId: input.tenantId,
    // 온보딩 완료 직후 첫 admin — ALL_CAPABILITIES 명시 부여. 다음 로그인부터
    // resolveUserCapabilities 가 role grant 기반으로 갱신.
    capabilities: serializeCapabilities(ALL_CAPABILITIES),
    issuedAt: Date.now(),
  }

  const newSession = await signSession(adminSession)
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()])
  cookieStore.set(SESSION_COOKIE_NAME, newSession, cookieOptions())

  // 무활동 테넌트 식별 신호 — 슈퍼어드민 UI 에서만 사용. 실패해도 흐름은 계속.
  await recordAdminLogin(input.tenantId)

  await logTenantOnboardingEvent({
    guildId: input.tenantId,
    actorDiscordId: session.discordId,
    eventType: 'setup_step_saved',
    details: {
      step: 'rewards',
      rewardCount: input.rewards.length,
      regearSupportEnabled: input.policy.regearSupportEnabled,
      autoRegearEnabled: input.policy.autoRegearEnabled,
      craftRegearEnabled: input.policy.craftRegearEnabled,
      regearRequireVerification: input.policy.regearRequireVerification,
      regearPayoutRatePercent: payoutPercent,
      eventsAutoStartEnabled: input.policy.eventsAutoStartEnabled,
    },
  })
  await logTenantOnboardingEvent({
    guildId: input.tenantId,
    actorDiscordId: session.discordId,
    eventType: 'setup_completed',
    details: { redirectSlug: tenantSlug },
  })

  const flowId = crypto.randomUUID()
  const tenantOrigin = buildTenantHostUrl(tenantSlug, '/')
  const requiresBrowserBinding = canShareAuthBindingCookie(
    requestHeaders.get('host'),
    tenantOrigin,
  )
  const hopToken = await signHopToken({
    session: adminSession,
    returnTo: '/admin/dashboard?onboarded=1',
    flowId,
    requiresBrowserBinding,
  })
  if (requiresBrowserBinding) {
    cookieStore.set(
      hopTokenBindingCookieName(flowId),
      AUTH_FLOW_BINDING_COOKIE_VALUE,
      hopTokenBindingCookieOptions(requestHeaders.get('host')),
    )
  }
  const redirectUrl = buildTenantHostUrl(
    tenantSlug,
    `/api/auth/finish?token=${encodeURIComponent(hopToken)}`,
  )

  revalidatePath('/')
  revalidatePath('/admin/dashboard')
  return { redirectUrl }
}
