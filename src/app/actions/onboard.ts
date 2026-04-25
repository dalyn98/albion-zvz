'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  getSession,
  signSession,
  SESSION_COOKIE_NAME,
  cookieOptions,
  type SessionPayload,
} from '@/lib/session'
import { buildBotInstallUrl } from '@/lib/discord'
import { getAdminClient } from '@/lib/supabase-admin'
import { isValidTenantSlug } from '@/lib/tenant-slug'
import { buildTenantHostUrl } from '@/lib/tenant-resolver'
import { signHopToken } from '@/lib/oauth-state'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'

const BOT_INSTALL_STATE_COOKIE = 'discord_bot_install_state'
const BOT_INSTALL_GUILD_COOKIE = 'discord_bot_install_guild'
const BOT_INSTALL_TTL_SEC = 60 * 10

// 온보딩 위저드는 3 단계다. 각 단계별 액션은 세션이 tenant 의 created_by_discord_id
// 와 일치하는지만 독립적으로 검증하고, 세션 자체(isAdmin 등) 는 bot-callback 에서
// 이미 세팅된 값을 그대로 쓴다. 마지막 단계에서만 세션을 재서명해 issuedAt 을
// 갱신하고 홈 길드 컨텍스트를 확정한다.

// 온보딩 페이지에서 "봇 설치" 버튼을 눌렀을 때 호출. state cookie 를 심고
// Discord 봇 설치 OAuth 로 리다이렉트한다. 돌아오면 /api/auth/discord/bot-callback
// 이 state 와 guild_id 를 검증한다.
export async function startBotInstall(guildId: string): Promise<void> {
  const session = await getSession()
  if (!session) redirect('/api/auth/discord/start?returnTo=/onboard')

  // 클라이언트에서 넘어오는 값이라 길드 ID 형태 검증 — Discord snowflake 는
  // 17~20자리 숫자.
  if (!/^\d{17,20}$/.test(guildId)) {
    redirect('/onboard')
  }

  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  const baseCookie = {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: BOT_INSTALL_TTL_SEC,
  }
  cookieStore.set(BOT_INSTALL_STATE_COOKIE, state, baseCookie)
  cookieStore.set(BOT_INSTALL_GUILD_COOKIE, guildId, baseCookie)

  const installUrl = buildBotInstallUrl({ guildId, state })
  console.log('[startBotInstall] redirecting to', installUrl)
  redirect(installUrl)
}

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
  slug: string
  memberRoleIds: string[]
  adminRoleIds: string[]
  eventChannelId: string | null
}

// 단계 1: slug + Discord 역할 + 공지 채널. 저장 후 세션은 건드리지 않고
// 클라이언트가 다음 단계로 네비게이트.
//
// slug 는 tenants.slug UNIQUE 제약 대상. 서버에서 isValidTenantSlug 로
// 포맷/예약어 재검증하고, DB 충돌(23505) 은 slugTaken 으로 안내.
export async function saveTenantSetup(
  input: SaveTenantSetupInput,
): Promise<{ error?: string }> {
  const t = await getTranslations('onboard')
  const session = await getSession()
  if (!session) return { error: t('unauthorized') }

  const slug = typeof input.slug === 'string' ? input.slug.trim().toLowerCase() : ''
  if (!isValidTenantSlug(slug)) {
    return { error: t('slugInvalid') }
  }

  if (input.memberRoleIds.length === 0) {
    return { error: t('missingRoles') }
  }

  // self-lockout 방어: admin_role_ids 가 비면 세션 만료 후 이 tenant 에
  // 아무도 관리자로 들어올 수 없다. 서버 쪽에서 한 번 더 막는다.
  if (input.adminRoleIds.length === 0) {
    return { error: t('missingAdminRoles') }
  }

  const tenant = await verifyTenantOwnership(input.tenantId, session)
  if (!tenant) return { error: t('unauthorized') }

  const db = getAdminClient()
  const { error } = await db
    .from('tenants')
    .update({
      slug,
      member_role_ids: input.memberRoleIds,
      admin_role_ids: input.adminRoleIds,
      event_channel_id: input.eventChannelId,
    })
    .eq('id', input.tenantId)
  if (error) {
    // Postgres unique_violation — 다른 tenant 가 같은 slug 를 이미 쓰고 있다.
    if ((error as { code?: string }).code === '23505') {
      return { error: t('slugTaken') }
    }
    return { error: error.message }
  }

  return {}
}

interface SaveTenantAlbionInput {
  tenantId: string
  server: string
  homeGuildId: string
}

const MAX_HOME_GUILD_ID_LENGTH = 500

// 단계 2: 알비온 서버 + 홈 길드. 길드 UUID 는 서버별로 다르기 때문에 둘을
// 원자적으로 저장해야 한다 — app_settings PK 는 (guild_id, key) 복합.
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

  const db = getAdminClient()
  const now = new Date().toISOString()
  const { error } = await db.from('app_settings').upsert(
    [
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
    ],
    { onConflict: 'guild_id,key' },
  )
  if (error) return { error: error.message }
  return {}
}

interface SaveTenantRewardsInput {
  tenantId: string
  rewards: Array<{ role_name: string; silver: number }>
}

// 단계 3 (최종): 역할별 기본 리기어 실버. bot-callback 이 seed 를 못 했거나
// 실패한 경우를 대비해 upsert 로 저장 — mig 075 이후 PK=(guild_id, role_name)
// 이므로 conflict target 지정 가능.
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

  for (const r of input.rewards) {
    if (!Number.isInteger(r.silver) || r.silver < 0) {
      return { error: t('rewardsErrorInvalidSilver') }
    }
    if (typeof r.role_name !== 'string' || r.role_name.length === 0) {
      return { error: t('errorGeneric') }
    }
  }

  const db = getAdminClient()
  const now = new Date().toISOString()
  const rows = input.rewards.map((r) => ({
    guild_id: input.tenantId,
    role_name: r.role_name,
    silver: r.silver,
    updated_at: now,
  }))
  const { error: rewardsError } = await db
    .from('role_rewards')
    .upsert(rows, { onConflict: 'guild_id,role_name' })
  if (rewardsError) return { error: rewardsError.message }

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
    console.error('[saveTenantRewards] activation failed', activateError)
    return { error: t('errorGeneric') }
  }
  const tenantSlug = activatedTenant.slug as string

  // canonical 도메인용 세션도 업데이트 (혹시 그대로 canonical 에 남아있어도
  // admin 세션 상태). subdomain 쿠키는 hop token 을 통해 finish 엔드포인트가 심는다.
  const adminSession = {
    discordId: session.discordId,
    username: session.username,
    avatar: session.avatar,
    isMember: true,
    isAdmin: true,
    isGuest: false,
    canCreateEvents: true,
    eventScope: null,
    guildId: input.tenantId,
    issuedAt: Date.now(),
  } as const

  const newSession = await signSession(adminSession)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, newSession, cookieOptions())

  const hopToken = await signHopToken({
    session: adminSession,
    returnTo: '/admin/dashboard?onboarded=1',
  })
  const redirectUrl = buildTenantHostUrl(
    tenantSlug,
    `/api/auth/finish?token=${encodeURIComponent(hopToken)}`,
  )

  revalidatePath('/')
  revalidatePath('/admin/dashboard')
  return { redirectUrl }
}
