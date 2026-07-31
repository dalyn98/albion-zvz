// Multi-tenant 헬퍼. Phase 1 에서는 auth callback 이 로그인 시 현재 길드의
// tenant UUID 를 session 에 심어둘 때 사용된다. Phase 2 이후 server action 들이
// session.guildId 로 필터링하는 지점마다 getSessionGuildId() 를 통해 레거시
// 쿠키 fallback 을 해결한다.
//
// 운영 환경에서 tenant 는 드물게 추가되므로 primary tenant id 는 메모리에
// 잠깐 캐시한다. DB 부하 절감용 최적화이며, 마이그 직후나 tenant 가 늘어나는
// Phase 3 에서도 TTL 이 짧아 안전하다.

import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import type { SessionPayload } from '@/lib/session'
import { isSuperAdmin } from '@/lib/super-admin'
import { getImpersonationFromCookies } from '@/lib/super-admin-impersonation'
import { log } from '@/lib/log'
import { getSupabaseErrorCode, SupabaseQueryError } from '@/lib/supabase-query-error'
import { retrySupabaseRead, type SupabaseReadResult } from '@/lib/supabase-read-retry'
import {
  TENANT_DIRECTORY_CACHE_SECONDS,
  TENANT_DIRECTORY_CACHE_TAG,
} from '@/lib/tenant-cache'

let primaryTenantCache: { id: string; expiresAt: number } | null = null
const PRIMARY_TENANT_TTL_MS = 60 * 1000

let activeTenantsCache: { tenants: TenantDiscordConfig[]; expiresAt: number } | null = null
const ACTIVE_TENANTS_TTL_MS = 60 * 1000

async function retryTenantRead<T>(
  label: string,
  read: () => PromiseLike<SupabaseReadResult<T>>,
): Promise<SupabaseReadResult<T>> {
  return retrySupabaseRead(read, {
    label,
    onRetry: ({ attempt, maxAttempts, delayMs, error }) => {
      log.warn('[tenant] transient lookup retry', {
        operation: label,
        attempt,
        max_attempts: maxAttempts,
        delay_ms: delayMs,
        error_code: getSupabaseErrorCode(error),
      })
    },
  })
}

export async function getTenantIdByDiscordGuildId(
  discordGuildId: string,
): Promise<string | null> {
  const db = getAdminClient()
  const { data, error } = await retryTenantRead('tenant.by_discord_guild_id', () =>
    db
      .from('tenants')
      .select('id')
      .eq('discord_guild_id', discordGuildId)
      .maybeSingle(),
  )
  if (error) {
    log.error('[tenant] tenant lookup failed', error, { discord_guild_id: discordGuildId })
    throw new SupabaseQueryError('Tenant lookup failed', error)
  }
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
//
// React cache() 로 per-request 메모이즈. 인자 session 의 reference 가 cache
// key 라, getSession() 도 cache() 로 감싸 같은 객체를 반환할 때만 dedup 된다 —
// 호출자는 보통 `const session = await getSession(); ... await getSessionGuildId(session)`
// 패턴이라 동일 reference 를 그대로 넘긴다.
export const getSessionGuildId = cache(async (session: SessionPayload): Promise<string> => {
  if (isSuperAdmin(session.discordId)) {
    const impersonation = await getImpersonationFromCookies()
    if (impersonation) return impersonation.tenantId
  }
  if (session.guildId) return session.guildId
  return getPrimaryTenantId()
})

// Phase 3: tenant 스코프의 Discord 설정. env 대신 tenants 테이블 컬럼을 본다.
// 호출부는 auth callback, member-sync cron, 이벤트 알림, 닉네임 동기화 등.
export interface TenantDiscordConfig {
  id: string
  discordGuildId: string
  slug: string
  name: string
  createdByDiscordId: string | null
  memberRoleIds: string[]
  adminRoleIds: string[]
  eventChannelId: string | null
  botInstalled: boolean
  status: TenantStatus
}

export type TenantStatus =
  | 'pending'
  | 'active'
  | 'suspended'
  | 'deletion_pending'
  | 'deleted'

const TENANT_DISCORD_CONFIG_SELECT =
  'id, discord_guild_id, slug, name, status, created_by_discord_id, member_role_ids, admin_role_ids, event_channel_id, bot_installed_at'

interface TenantDiscordConfigRow {
  id: string
  discord_guild_id: string
  slug: string
  name: string
  status: TenantStatus
  created_by_discord_id: string | null
  member_role_ids: string[] | null
  admin_role_ids: string[] | null
  event_channel_id: string | null
  bot_installed_at: string | null
}

function mapTenantDiscordConfig(row: TenantDiscordConfigRow): TenantDiscordConfig {
  return {
    id: row.id,
    discordGuildId: row.discord_guild_id,
    slug: row.slug,
    name: row.name,
    createdByDiscordId: row.created_by_discord_id ?? null,
    memberRoleIds: row.member_role_ids ?? [],
    adminRoleIds: row.admin_role_ids ?? [],
    eventChannelId: row.event_channel_id ?? null,
    botInstalled: !!row.bot_installed_at,
    status: row.status,
  }
}

// React cache() 로 한 render 안의 중복을 제거하고, Next Data Cache 로 Fluid
// 인스턴스와 후속 요청 사이의 동일 tenant 조회도 재사용한다.
async function loadTenantDiscordConfig(
  tenantId: string,
): Promise<TenantDiscordConfig | null> {
  const db = getAdminClient()
  const { data, error } = await retryTenantRead('tenant.discord_config', () =>
    db
      .from('tenants')
      .select(TENANT_DISCORD_CONFIG_SELECT)
      .eq('id', tenantId)
      .maybeSingle(),
  )
  if (error) {
    log.error('[tenant] discord config lookup failed', error, { tenant_id: tenantId })
    throw new SupabaseQueryError('Tenant Discord config lookup failed', error)
  }
  if (!data) return null
  return mapTenantDiscordConfig(data as TenantDiscordConfigRow)
}

export const getTenantDiscordConfig = cache(
  async (tenantId: string): Promise<TenantDiscordConfig | null> => unstable_cache(
    () => loadTenantDiscordConfig(tenantId),
    ['tenant-discord-config', tenantId],
    {
      tags: [TENANT_DIRECTORY_CACHE_TAG],
      revalidate: TENANT_DIRECTORY_CACHE_SECONDS,
    },
  )(),
)

async function loadTenantDiscordConfigByDiscordGuildId(
  discordGuildId: string,
): Promise<TenantDiscordConfig | null> {
  const db = getAdminClient()
  const { data, error } = await retryTenantRead('tenant.discord_config_by_guild_id', () =>
    db
      .from('tenants')
      .select(TENANT_DISCORD_CONFIG_SELECT)
      .eq('discord_guild_id', discordGuildId)
      .maybeSingle(),
  )
  if (error) {
    log.error('[tenant] discord guild config lookup failed', error, {
      discord_guild_id: discordGuildId,
    })
    throw new SupabaseQueryError('Tenant Discord guild config lookup failed', error)
  }
  if (!data) return null
  return mapTenantDiscordConfig(data as TenantDiscordConfigRow)
}

export async function getTenantDiscordConfigByDiscordGuildId(
  discordGuildId: string,
): Promise<TenantDiscordConfig | null> {
  return unstable_cache(
    () => loadTenantDiscordConfigByDiscordGuildId(discordGuildId),
    ['tenant-discord-config-by-discord-guild', discordGuildId],
    {
      tags: [TENANT_DIRECTORY_CACHE_TAG],
      revalidate: TENANT_DIRECTORY_CACHE_SECONDS,
    },
  )()
}

export async function getTenantDiscordConfigsByDiscordGuildIds(
  discordGuildIds: readonly string[],
): Promise<Map<string, TenantDiscordConfig>> {
  const uniqueIds = Array.from(new Set(discordGuildIds.filter((id) => id.length > 0)))
  if (uniqueIds.length === 0) return new Map()

  const db = getAdminClient()
  const { data, error } = await retryTenantRead('tenant.discord_config_batch', () =>
    db
      .from('tenants')
      .select(TENANT_DISCORD_CONFIG_SELECT)
      .in('discord_guild_id', uniqueIds),
  )
  if (error) {
    log.error('[tenant] discord guild configs batch lookup failed', error, {
      discord_guild_ids: uniqueIds,
      count: uniqueIds.length,
    })
    throw new SupabaseQueryError('Tenant Discord guild configs batch lookup failed', error)
  }

  const result = new Map<string, TenantDiscordConfig>()
  for (const row of (data ?? []) as TenantDiscordConfigRow[]) {
    const tenant = mapTenantDiscordConfig(row)
    result.set(tenant.discordGuildId, tenant)
  }
  return result
}

export async function listActiveTenants(): Promise<TenantDiscordConfig[]> {
  const now = Date.now()
  if (activeTenantsCache && activeTenantsCache.expiresAt > now) {
    return activeTenantsCache.tenants
  }
  const db = getAdminClient()
  const { data, error } = await retryTenantRead('tenant.active_list', () =>
    db
      .from('tenants')
      .select(TENANT_DISCORD_CONFIG_SELECT)
      .eq('status', 'active'),
  )
  if (error) {
    log.error('[tenant] active tenant list failed', error)
    throw new SupabaseQueryError('Active tenant list failed', error)
  }
  const tenants = ((data ?? []) as TenantDiscordConfigRow[]).map(mapTenantDiscordConfig)
  activeTenantsCache = { tenants, expiresAt: now + ACTIVE_TENANTS_TTL_MS }
  return tenants
}
