import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import {
  hasAnyCapability,
  resolveUserCapabilities,
} from '@/lib/permissions'
import { log } from '@/lib/log'
import type { DiscordInteractionPayload } from '@/lib/discord-interactions'
import type { AdminApprovalActor } from '@/lib/admin-approval-service'

interface TenantRow {
  id: string
  discord_guild_id: string
  slug: string
  name: string
  created_by_discord_id: string | null
}

export interface DiscordAdminApprovalActorResult {
  ok: true
  actor: AdminApprovalActor
}

export type DiscordAdminApprovalAuthResult =
  | DiscordAdminApprovalActorResult
  | { ok: false; error: 'not_in_guild' | 'guild_not_linked' | 'not_authorized' }

export async function resolveDiscordAdminApprovalActor(
  payload: DiscordInteractionPayload,
  requiredCapabilities: readonly bigint[],
): Promise<DiscordAdminApprovalAuthResult> {
  if (!payload.guild_id) return { ok: false, error: 'not_in_guild' }
  const discordId = payload.member?.user?.id ?? payload.user?.id ?? null
  if (!discordId) return { ok: false, error: 'not_authorized' }

  const db = getAdminClient()
  const { data, error } = await db
    .from('tenants')
    .select('id, discord_guild_id, slug, name, created_by_discord_id')
    .eq('discord_guild_id', payload.guild_id)
    .eq('status', 'active')
    .maybeSingle()
  if (error) {
    log.error('[discord-admin-auth] tenant lookup failed', error, {
      discord_guild_id: payload.guild_id,
    })
    return { ok: false, error: 'guild_not_linked' }
  }
  if (!data) return { ok: false, error: 'guild_not_linked' }

  const tenant = data as TenantRow
  const roleIds = payload.member?.roles ?? []
  const isOwner = tenant.created_by_discord_id === discordId
  const isOverrideAdmin = await hasTenantAdminOverride(tenant.id, discordId)
  const hasBootstrapAdminAccess = isOwner || isOverrideAdmin
  const capabilities = await resolveUserCapabilities(db, {
    guildId: tenant.id,
    discordId,
    discordRoleIds: roleIds,
    isLegacyAdmin: hasBootstrapAdminAccess,
  })
  if (!hasAnyCapability(capabilities, requiredCapabilities)) {
    return { ok: false, error: 'not_authorized' }
  }

  return {
    ok: true,
    actor: {
      guildId: tenant.id,
      discordGuildId: tenant.discord_guild_id,
      discordId,
      username: getInvokerDisplayName(payload) ?? `<@${discordId}>`,
    },
  }
}

async function hasTenantAdminOverride(tenantId: string, discordId: string): Promise<boolean> {
  const { data, error } = await getAdminClient()
    .from('tenant_admin_overrides')
    .select('discord_id')
    .eq('tenant_id', tenantId)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (error) {
    log.error('[discord-admin-auth] override lookup failed', error, {
      tenant_id: tenantId,
      discord_id: discordId,
    })
    return false
  }
  return !!data
}

function getInvokerDisplayName(payload: DiscordInteractionPayload): string | null {
  return (
    payload.member?.nick?.trim() ||
    payload.member?.user?.global_name?.trim() ||
    payload.member?.user?.username?.trim() ||
    payload.user?.global_name?.trim() ||
    payload.user?.username?.trim() ||
    null
  )
}
