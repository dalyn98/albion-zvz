'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, signSession, SESSION_COOKIE_NAME, cookieOptions } from '@/lib/session'
import { buildBotInstallUrl } from '@/lib/discord'
import { getAdminClient } from '@/lib/supabase-admin'

const BOT_INSTALL_STATE_COOKIE = 'discord_bot_install_state'
const BOT_INSTALL_GUILD_COOKIE = 'discord_bot_install_guild'
const BOT_INSTALL_TTL_SEC = 60 * 10

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

  redirect(buildBotInstallUrl({ guildId, state }))
}

interface SaveTenantSetupInput {
  tenantId: string
  memberRoleIds: string[]
  adminRoleIds: string[]
  eventChannelId: string | null
}

export async function saveTenantSetup(
  input: SaveTenantSetupInput,
): Promise<{ error?: string }> {
  const t = await getTranslations('onboard')
  const session = await getSession()
  if (!session) return { error: t('unauthorized') }

  if (input.memberRoleIds.length === 0) {
    return { error: t('missingRoles') }
  }

  const db = getAdminClient()
  // 이 tenant 의 creator 만 설정 변경 가능. 봇 설치 callback 이 created_by_discord_id
  // 를 심어놓았으므로 그걸 기준으로 검증. Admin 권한은 아직 session 에 부여되지
  // 않은 상태이기 때문.
  const { data: tenant, error: tenantError } = await db
    .from('tenants')
    .select('id, discord_guild_id, created_by_discord_id')
    .eq('id', input.tenantId)
    .maybeSingle()
  if (tenantError || !tenant) return { error: t('unauthorized') }
  if (tenant.created_by_discord_id !== session.discordId) {
    return { error: t('unauthorized') }
  }

  const { error } = await db
    .from('tenants')
    .update({
      member_role_ids: input.memberRoleIds,
      admin_role_ids: input.adminRoleIds,
      event_channel_id: input.eventChannelId,
    })
    .eq('id', input.tenantId)
  if (error) return { error: error.message }

  // 설정 저장 후 세션을 admin 으로 재발급 — 사용자가 본인 길드 관리자로
  // 즉시 들어갈 수 있게. 다음 로그인부터는 실제 Discord 역할 기반으로 재계산.
  const newSession = await signSession({
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
  })
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, newSession, cookieOptions())
  revalidatePath('/')
  return {}
}
