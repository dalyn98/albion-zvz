// 슈퍼어드민 대시보드의 cross-tenant 통계 헬퍼.
//
// 일반 admin 통계와 분리: tenant 필터 없이 head:true count 만 사용 — 데이터
// 자체를 가져올 필요가 없고, 대규모일 때도 가볍다.

import { getAdminClient } from '@/lib/supabase-admin'

export interface SystemStats {
  tenantsTotal: number
  tenantsByStatus: Record<string, number>
  botsInstalled: number
  events: number
  battles: number
  regearRequests: number
  exchangeRequests: number
  donationRequests: number
  members: number
}

const COUNT_COLUMN_BY_TABLE: Record<string, string> = {
  guild_avatars: 'discord_id',
}

async function countAll(table: string): Promise<number> {
  const db = getAdminClient()
  // head:true 라 body 는 비지만, PostgREST 는 select 컬럼 식별자를 파싱해 query plan
  // 을 만든다. 'id' 같은 단일 컬럼이 '*' 보다 가볍다.
  const { count } = await db
    .from(table)
    .select(COUNT_COLUMN_BY_TABLE[table] ?? 'id', { count: 'exact', head: true })
  return count ?? 0
}

export async function getSystemStats(): Promise<SystemStats> {
  const db = getAdminClient()
  const [
    tenantsRaw,
    botsRaw,
    events,
    battles,
    regearRequests,
    exchangeRequests,
    donationRequests,
    members,
  ] = await Promise.all([
    db.from('tenants').select('status'),
    db.from('tenants').select('id', { count: 'exact', head: true }).not('bot_installed_at', 'is', null),
    countAll('events'),
    // 'battles' 테이블에는 guild_id 컬럼이 없다. 슈퍼어드민 전역 카운트는 events 와
    // 대응되는 multi-tenant 추적용 tenant_battle_records 로 계산.
    countAll('tenant_battle_records'),
    countAll('regear_requests'),
    countAll('exchange_requests'),
    countAll('donation_requests'),
    countAll('guild_avatars'),
  ])

  const rows = (tenantsRaw.data ?? []) as Array<{ status: string | null }>
  const byStatus: Record<string, number> = {}
  for (const r of rows) {
    const k = r.status ?? 'unknown'
    byStatus[k] = (byStatus[k] ?? 0) + 1
  }

  return {
    tenantsTotal: rows.length,
    tenantsByStatus: byStatus,
    botsInstalled: botsRaw.count ?? 0,
    events,
    battles,
    regearRequests,
    exchangeRequests,
    donationRequests,
    members,
  }
}

export interface TenantSummary {
  id: string
  slug: string
  name: string
  discordGuildId: string
  status: string
  ownerDiscordId: string | null
  botInstalled: boolean
  botInstalledAt: string | null
  createdAt: string
  lastAdminLoginAt: string | null
  memberCount: number
  eventCount: number
}

export async function listAllTenantsWithStats(): Promise<TenantSummary[]> {
  const db = getAdminClient()
  const [tenantsRes, countsRes] = await Promise.all([
    db
      .from('tenants')
      .select(
        'id, slug, name, discord_guild_id, status, owner_discord_id, bot_installed_at, created_at, last_admin_login_at',
      )
      .order('created_at', { ascending: false }),
    db.rpc('tenant_summary_counts'),
  ])
  const tenants = tenantsRes.data ?? []
  if (tenants.length === 0) return []

  const countsMap = new Map<string, { memberCount: number; eventCount: number }>()
  const rows = (countsRes.data ?? []) as Array<{
    guild_id: string
    member_count: number
    event_count: number
  }>
  for (const r of rows) {
    countsMap.set(r.guild_id, {
      memberCount: Number(r.member_count) || 0,
      eventCount: Number(r.event_count) || 0,
    })
  }

  return tenants.map((t) => {
    const c = countsMap.get(t.id as string)
    return {
      id: t.id as string,
      slug: t.slug as string,
      name: t.name as string,
      discordGuildId: t.discord_guild_id as string,
      status: (t.status as string) ?? 'unknown',
      ownerDiscordId: (t.owner_discord_id as string | null) ?? null,
      botInstalled: !!t.bot_installed_at,
      botInstalledAt: (t.bot_installed_at as string | null) ?? null,
      createdAt: t.created_at as string,
      lastAdminLoginAt: (t.last_admin_login_at as string | null) ?? null,
      memberCount: c?.memberCount ?? 0,
      eventCount: c?.eventCount ?? 0,
    }
  })
}

export interface TenantDetail extends TenantSummary {
  lifecycleReason: string | null
  memberRoleIds: string[]
  adminRoleIds: string[]
  eventChannelId: string | null
  settings: Record<string, unknown>
  battleCount: number
  regearCount: number
  exchangeCount: number
  donationCount: number
  recentEvents: Array<{ id: string; title: string; created_at: string }>
  adminOverrides: Array<{
    discordId: string
    grantedByDiscordId: string
    grantedAt: string
    reason: string | null
  }>
}

export async function getTenantDetail(tenantId: string): Promise<TenantDetail | null> {
  const db = getAdminClient()
  const { data: t } = await db
    .from('tenants')
    .select(
      'id, slug, name, discord_guild_id, status, lifecycle_reason, owner_discord_id, bot_installed_at, created_at, last_admin_login_at, member_role_ids, admin_role_ids, event_channel_id, settings',
    )
    .eq('id', tenantId)
    .maybeSingle()
  if (!t) return null

  const [
    memberCount,
    eventCount,
    battleCount,
    regearCount,
    exchangeCount,
    donationCount,
    recent,
    overrides,
  ] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id', { count: 'exact', head: true })
      .eq('guild_id', tenantId),
    db.from('events').select('id', { count: 'exact', head: true }).eq('guild_id', tenantId),
    // 'battles' 테이블에는 guild_id 컬럼이 없어 직접 필터 불가. tenant 별 집계는
    // tenant_battle_records 로 한다 (mig 076 에서 guild_id 인덱스 보유).
    db.from('tenant_battle_records').select('id', { count: 'exact', head: true }).eq('guild_id', tenantId),
    db.from('regear_requests').select('id', { count: 'exact', head: true }).eq('guild_id', tenantId),
    db.from('exchange_requests').select('id', { count: 'exact', head: true }).eq('guild_id', tenantId),
    db.from('donation_requests').select('id', { count: 'exact', head: true }).eq('guild_id', tenantId),
    db
      .from('events')
      .select('id, title, created_at')
      .eq('guild_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('tenant_admin_overrides')
      .select('discord_id, granted_by_discord_id, granted_at, reason')
      .eq('tenant_id', tenantId)
      .order('granted_at', { ascending: false }),
  ])

  return {
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    discordGuildId: t.discord_guild_id as string,
    status: (t.status as string) ?? 'unknown',
    lifecycleReason: (t.lifecycle_reason as string | null) ?? null,
    ownerDiscordId: (t.owner_discord_id as string | null) ?? null,
    botInstalled: !!t.bot_installed_at,
    botInstalledAt: (t.bot_installed_at as string | null) ?? null,
    createdAt: t.created_at as string,
    lastAdminLoginAt: (t.last_admin_login_at as string | null) ?? null,
    memberCount: memberCount.count ?? 0,
    eventCount: eventCount.count ?? 0,
    memberRoleIds: (t.member_role_ids as string[] | null) ?? [],
    adminRoleIds: (t.admin_role_ids as string[] | null) ?? [],
    eventChannelId: (t.event_channel_id as string | null) ?? null,
    settings: (t.settings as Record<string, unknown> | null) ?? {},
    battleCount: battleCount.count ?? 0,
    regearCount: regearCount.count ?? 0,
    exchangeCount: exchangeCount.count ?? 0,
    donationCount: donationCount.count ?? 0,
    recentEvents: ((recent.data ?? []) as Array<{ id: string; title: string; created_at: string }>),
    adminOverrides: ((overrides.data ?? []) as Array<{
      discord_id: string
      granted_by_discord_id: string
      granted_at: string
      reason: string | null
    }>).map((r) => ({
      discordId: r.discord_id,
      grantedByDiscordId: r.granted_by_discord_id,
      grantedAt: r.granted_at,
      reason: r.reason,
    })),
  }
}
