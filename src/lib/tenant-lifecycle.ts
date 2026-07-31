import 'server-only'

import { getGuildMemberByBot } from '@/lib/discord'
import {
  resolveDiscordAuthorization,
  type LiveDiscordAuthorization,
} from '@/lib/discord-live-authorization'
import type { SessionPayload } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import {
  getTenantDiscordConfig,
  type TenantStatus,
} from '@/lib/tenant'

export const RECENT_DISCORD_AUTH_MS = 10 * 60 * 1000

export interface TenantLifecycleObligation {
  key: string
  count: number
  path: string
}

export interface TenantLifecycleState {
  guildId: string
  guildName: string
  status: TenantStatus
  reason: string | null
  botInstalled: boolean
  botRemovedAt: string | null
  inactivityWarningAt: string | null
  deletionRequestedAt: string | null
  purgeAt: string | null
  deletionRequestId: string | null
  obligations: {
    total: number
    items: TenantLifecycleObligation[]
  }
}

function parseObligations(value: unknown): TenantLifecycleState['obligations'] {
  if (!value || typeof value !== 'object') return { total: 0, items: [] }
  const record = value as Record<string, unknown>
  const items = Array.isArray(record.items)
    ? record.items.flatMap((raw) => {
        if (!raw || typeof raw !== 'object') return []
        const item = raw as Record<string, unknown>
        if (
          typeof item.key !== 'string' ||
          typeof item.count !== 'number' ||
          !Number.isInteger(item.count) ||
          item.count < 0 ||
          typeof item.path !== 'string' ||
          !item.path.startsWith('/')
        ) {
          return []
        }
        return [{
          key: item.key,
          count: item.count,
          path: item.path,
        }]
      })
    : []
  const total =
    typeof record.total === 'number' &&
    Number.isInteger(record.total) &&
    record.total >= 0
      ? record.total
      : items.reduce((sum, item) => sum + item.count, 0)
  return { total, items }
}

export function isRecentDiscordAuthentication(
  authenticatedAt: number | null | undefined,
  now = Date.now(),
): boolean {
  return (
    typeof authenticatedAt === 'number' &&
    Number.isFinite(authenticatedAt) &&
    authenticatedAt > 0 &&
    authenticatedAt <= now + 60_000 &&
    authenticatedAt >= now - RECENT_DISCORD_AUTH_MS
  )
}

export function workspaceLifecycleReauthHref(guildId: string): string {
  const returnTo = `/onboard/setup/${guildId}`
  return `/api/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}&retry=1`
}

export async function loadTenantLifecycleState(
  guildId: string,
): Promise<TenantLifecycleState | null> {
  const db = getAdminClient()
  const [tenantResult, requestResult, obligationResult] = await Promise.all([
    db
      .from('tenants')
      .select(
        'id,name,status,lifecycle_reason,bot_installed_at,bot_removed_at,inactivity_warning_at,deletion_requested_at,purge_at',
      )
      .eq('id', guildId)
      .maybeSingle(),
    db
      .from('tenant_deletion_requests')
      .select('id,status,purge_at')
      .eq('guild_id', guildId)
      .in('status', ['pending', 'purging'])
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.rpc('tenant_deletion_obligations', { p_guild_id: guildId }),
  ])
  if (tenantResult.error) throw new Error(tenantResult.error.message)
  if (!tenantResult.data) return null
  if (requestResult.error) throw new Error(requestResult.error.message)
  if (obligationResult.error) throw new Error(obligationResult.error.message)

  const tenant = tenantResult.data
  return {
    guildId: tenant.id as string,
    guildName: tenant.name as string,
    status: tenant.status as TenantStatus,
    reason: (tenant.lifecycle_reason as string | null) ?? null,
    botInstalled: !!tenant.bot_installed_at,
    botRemovedAt: (tenant.bot_removed_at as string | null) ?? null,
    inactivityWarningAt:
      (tenant.inactivity_warning_at as string | null) ?? null,
    deletionRequestedAt:
      (tenant.deletion_requested_at as string | null) ?? null,
    purgeAt:
      (requestResult.data?.purge_at as string | null | undefined) ??
      (tenant.purge_at as string | null) ??
      null,
    deletionRequestId:
      (requestResult.data?.id as string | null | undefined) ?? null,
    obligations: parseObligations(obligationResult.data),
  }
}

// Lifecycle recovery deliberately bypasses the active-tenant requirement used
// by ordinary commands, but repeats live Discord membership and capability
// resolution for the exact target tenant. Platform impersonation and local or
// guest identities are never accepted for deletion.
export async function resolveTenantLifecycleAuthorization(
  guildId: string,
  signedSession: SessionPayload,
): Promise<LiveDiscordAuthorization | null> {
  if (
    !signedSession.discordId ||
    signedSession.isGuest ||
    signedSession.isLocalGuildAccount
  ) {
    return null
  }
  const tenant = await getTenantDiscordConfig(guildId)
  if (
    !tenant ||
    tenant.status === 'deleted' ||
    !tenant.botInstalled
  ) {
    return null
  }
  const member = await getGuildMemberByBot(
    tenant.discordGuildId,
    signedSession.discordId,
  )
  if (!member) return null
  return resolveDiscordAuthorization({
    tenant,
    discordId: signedSession.discordId,
    member,
    previousSession: signedSession,
    issuedAt: signedSession.issuedAt,
    authenticatedAt: signedSession.authenticatedAt ?? 0,
  })
}
