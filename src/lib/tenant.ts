// Multi-tenant 헬퍼. Phase 1 에서는 auth callback 이 로그인 시 현재 길드의
// tenant UUID 를 session 에 심어둘 때 사용된다. Phase 2 이후 server action 들이
// session.guildId 로 필터링하는 지점마다 getSessionGuildId() 를 통해 레거시
// 쿠키 fallback 을 해결한다.
//
// 운영 환경에서 tenant 는 드물게 추가되므로 primary tenant id 는 메모리에
// 잠깐 캐시한다. DB 부하 절감용 최적화이며, 마이그 직후나 tenant 가 늘어나는
// Phase 3 에서도 TTL 이 짧아 안전하다.

import { getAdminClient } from '@/lib/supabase-admin'
import type { SessionPayload } from '@/lib/session'
import { isSuperAdmin } from '@/lib/super-admin'
import { getImpersonationFromCookies } from '@/lib/super-admin-impersonation'

let primaryTenantCache: { id: string; expiresAt: number } | null = null
const PRIMARY_TENANT_TTL_MS = 60 * 1000

let activeTenantsCache: { tenants: TenantDiscordConfig[]; expiresAt: number } | null = null
const ACTIVE_TENANTS_TTL_MS = 60 * 1000

export async function getTenantIdByDiscordGuildId(
  discordGuildId: string,
): Promise<string | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id')
    .eq('discord_guild_id', discordGuildId)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

// 현재 .env 의 DISCORD_GUILD_ID 에 해당하는 tenant UUID. 레거시 세션 (guildId
// 없음) 이나 시스템 컨텍스트 (cron, webhook) 에서 기본 tenant 를 집어내는 용도.
export async function getPrimaryTenantId(): Promise<string> {
  const now = Date.now()
  if (primaryTenantCache && primaryTenantCache.expiresAt > now) {
    return primaryTenantCache.id
  }
  const discordGuildId = process.env.DISCORD_GUILD_ID
  if (!discordGuildId) {
    throw new Error('DISCORD_GUILD_ID is not set; cannot resolve primary tenant')
  }
  const id = await getTenantIdByDiscordGuildId(discordGuildId)
  if (!id) {
    throw new Error(
      `Primary tenant not found for DISCORD_GUILD_ID=${discordGuildId}. ` +
        `Run migration 071_tenants_bootstrap.sql to seed tenant #1.`,
    )
  }
  primaryTenantCache = { id, expiresAt: now + PRIMARY_TENANT_TTL_MS }
  return id
}

// Session 에서 현재 요청의 tenant UUID 를 꺼낸다. 레거시 쿠키 (Phase 1 이전
// 발급) 는 guildId 가 null 이므로 primary tenant 로 fallback. 이 fallback 은
// Phase 1 배포 직후 수 일간만 필요하고, 이후 session 만료 주기 (7일) 가 지나면
// 자연스럽게 사라진다.
//
// 슈퍼어드민 임퍼소네이션: 슈퍼어드민이 "이 길드 어드민으로 보기" 를 켰으면
// 별도 쿠키에서 tenantId 를 꺼내 우선시한다. 일반 사용자는 쿠키가 있어도
// 슈퍼어드민이 아니면 무시.
export async function getSessionGuildId(session: SessionPayload): Promise<string> {
  if (isSuperAdmin(session.discordId)) {
    const impersonation = await getImpersonationFromCookies()
    if (impersonation) return impersonation.tenantId
  }
  if (session.guildId) return session.guildId
  return getPrimaryTenantId()
}

// Phase 3: tenant 스코프의 Discord 설정. env 대신 tenants 테이블 컬럼을 본다.
// 호출부는 auth callback, member-sync cron, 이벤트 알림, 닉네임 동기화 등.
export interface TenantDiscordConfig {
  id: string
  discordGuildId: string
  slug: string
  name: string
  memberRoleIds: string[]
  adminRoleIds: string[]
  eventChannelId: string | null
  botInstalled: boolean
}

export async function getTenantDiscordConfig(
  tenantId: string,
): Promise<TenantDiscordConfig | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select(
      'id, discord_guild_id, slug, name, member_role_ids, admin_role_ids, event_channel_id, bot_installed_at',
    )
    .eq('id', tenantId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    discordGuildId: data.discord_guild_id as string,
    slug: data.slug as string,
    name: data.name as string,
    memberRoleIds: (data.member_role_ids as string[] | null) ?? [],
    adminRoleIds: (data.admin_role_ids as string[] | null) ?? [],
    eventChannelId: (data.event_channel_id as string | null) ?? null,
    botInstalled: !!data.bot_installed_at,
  }
}

export async function getTenantDiscordConfigByDiscordGuildId(
  discordGuildId: string,
): Promise<TenantDiscordConfig | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select(
      'id, discord_guild_id, slug, name, member_role_ids, admin_role_ids, event_channel_id, bot_installed_at',
    )
    .eq('discord_guild_id', discordGuildId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    discordGuildId: data.discord_guild_id as string,
    slug: data.slug as string,
    name: data.name as string,
    memberRoleIds: (data.member_role_ids as string[] | null) ?? [],
    adminRoleIds: (data.admin_role_ids as string[] | null) ?? [],
    eventChannelId: (data.event_channel_id as string | null) ?? null,
    botInstalled: !!data.bot_installed_at,
  }
}

export async function listActiveTenants(): Promise<TenantDiscordConfig[]> {
  const now = Date.now()
  if (activeTenantsCache && activeTenantsCache.expiresAt > now) {
    return activeTenantsCache.tenants
  }
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select(
      'id, discord_guild_id, slug, name, member_role_ids, admin_role_ids, event_channel_id, bot_installed_at',
    )
    .eq('status', 'active')
  const tenants = (data ?? []).map((r) => ({
    id: r.id as string,
    discordGuildId: r.discord_guild_id as string,
    slug: r.slug as string,
    name: r.name as string,
    memberRoleIds: (r.member_role_ids as string[] | null) ?? [],
    adminRoleIds: (r.admin_role_ids as string[] | null) ?? [],
    eventChannelId: (r.event_channel_id as string | null) ?? null,
    botInstalled: !!r.bot_installed_at,
  }))
  activeTenantsCache = { tenants, expiresAt: now + ACTIVE_TENANTS_TTL_MS }
  return tenants
}
