import { getAppSetting } from '@/lib/app-settings'
import { getGuildMemberByBot } from '@/lib/discord'
import { log } from '@/lib/log'
import type { getAdminClient } from '@/lib/supabase-admin'
import { getTenantDiscordConfig } from '@/lib/tenant'
import {
  resolveRegearRolePolicy,
  roleGroupFromSlotRole,
  type RegearRoleGroup,
  type RegearRolePolicyResolution,
  type RegearRolePolicyRow,
} from './regear-role-policy'

export interface RegearDiscordRolePolicy {
  id: string
  discordRoleId: string
  discordRoleName: string
  roleGroup: RegearRoleGroup
  silverCap: number
  payoutRatePercent: number | null
  updatedAt: string
}

type AdminDbClient = ReturnType<typeof getAdminClient>

interface RegearDiscordRolePolicyDbRow {
  id: string
  discord_role_id: string
  discord_role_name: string
  regear_role_group: string
  silver_cap: number
  payout_rate_percent: number | null
  updated_at: string
}

export function mapRegearDiscordRolePolicyRow(
  row: RegearDiscordRolePolicyDbRow,
): RegearDiscordRolePolicy {
  return {
    id: row.id,
    discordRoleId: row.discord_role_id,
    discordRoleName: row.discord_role_name,
    roleGroup: row.regear_role_group as RegearRoleGroup,
    silverCap: row.silver_cap,
    payoutRatePercent: row.payout_rate_percent,
    updatedAt: row.updated_at,
  }
}

export async function loadRegearDiscordRolePolicyConfig(
  db: AdminDbClient,
  guildId: string,
): Promise<{
  enabled: boolean
  policies: RegearDiscordRolePolicy[]
  error?: string
}> {
  const [enabledRaw, policiesRes] = await Promise.all([
    getAppSetting('regear_discord_role_policy_enabled', 'false', guildId),
    db
      .from('regear_discord_role_policies')
      .select('id, discord_role_id, discord_role_name, regear_role_group, silver_cap, payout_rate_percent, updated_at')
      .eq('guild_id', guildId)
      .order('regear_role_group')
      .order('silver_cap', { ascending: false }),
  ])
  if (policiesRes.error) return { enabled: enabledRaw === 'true', policies: [], error: policiesRes.error.message }
  return {
    enabled: enabledRaw === 'true',
    policies: ((policiesRes.data ?? []) as RegearDiscordRolePolicyDbRow[]).map(
      mapRegearDiscordRolePolicyRow,
    ),
  }
}

async function loadRequesterDiscordRoleIds(
  guildId: string,
  discordId: string,
): Promise<{ roleIds: string[]; unavailable: boolean }> {
  const tenantConfig = await getTenantDiscordConfig(guildId)
  if (!tenantConfig) return { roleIds: [], unavailable: true }
  try {
    const member = await getGuildMemberByBot(tenantConfig.discordGuildId, discordId)
    if (!member) return { roleIds: [], unavailable: true }
    return { roleIds: member.roles ?? [], unavailable: false }
  } catch (error) {
    log.error('[regear-role-policy] Discord member role lookup failed', error, {
      tenant_id: guildId,
      discord_id: discordId,
    })
    return { roleIds: [], unavailable: true }
  }
}

export async function resolveRequesterRegearRolePolicy(input: {
  db: AdminDbClient
  guildId: string
  discordId: string
  roleName: string
  fallbackSilverCap: number
}): Promise<RegearRolePolicyResolution & { error?: string }> {
  const config = await loadRegearDiscordRolePolicyConfig(input.db, input.guildId)
  if (config.error) {
    return {
      ...resolveRegearRolePolicy({
        enabled: false,
        roleGroup: roleGroupFromSlotRole(input.roleName),
        fallbackSilverCap: input.fallbackSilverCap,
        memberRoleIds: [],
        policies: [],
      }),
      error: config.error,
    }
  }
  const roleGroup = roleGroupFromSlotRole(input.roleName)
  const memberRoles = config.enabled
    ? await loadRequesterDiscordRoleIds(input.guildId, input.discordId)
    : { roleIds: [], unavailable: false }
  const policies: RegearRolePolicyRow[] = config.policies.map((policy) => ({
    id: policy.id,
    discordRoleId: policy.discordRoleId,
    discordRoleName: policy.discordRoleName,
    roleGroup: policy.roleGroup,
    silverCap: policy.silverCap,
    payoutRatePercent: policy.payoutRatePercent,
  }))
  return resolveRegearRolePolicy({
    enabled: config.enabled,
    roleGroup,
    fallbackSilverCap: input.fallbackSilverCap,
    memberRoleIds: memberRoles.roleIds,
    rolesUnavailable: memberRoles.unavailable,
    policies,
  })
}

export async function createRequesterRegearRolePolicyResolver(input: {
  db: AdminDbClient
  guildId: string
  discordId: string
}): Promise<{
  enabled: boolean
  resolve: (roleName: string, fallbackSilverCap: number) => RegearRolePolicyResolution
  error?: string
}> {
  const config = await loadRegearDiscordRolePolicyConfig(input.db, input.guildId)
  if (config.error) {
    return {
      enabled: false,
      resolve: (roleName, fallbackSilverCap) =>
        resolveRegearRolePolicy({
          enabled: false,
          roleGroup: roleGroupFromSlotRole(roleName),
          fallbackSilverCap,
          memberRoleIds: [],
          policies: [],
        }),
      error: config.error,
    }
  }
  const memberRoles = config.enabled
    ? await loadRequesterDiscordRoleIds(input.guildId, input.discordId)
    : { roleIds: [], unavailable: false }
  const policies: RegearRolePolicyRow[] = config.policies.map((policy) => ({
    id: policy.id,
    discordRoleId: policy.discordRoleId,
    discordRoleName: policy.discordRoleName,
    roleGroup: policy.roleGroup,
    silverCap: policy.silverCap,
    payoutRatePercent: policy.payoutRatePercent,
  }))

  return {
    enabled: config.enabled,
    resolve: (roleName, fallbackSilverCap) =>
      resolveRegearRolePolicy({
        enabled: config.enabled,
        roleGroup: roleGroupFromSlotRole(roleName),
        fallbackSilverCap,
        memberRoleIds: memberRoles.roleIds,
        rolesUnavailable: memberRoles.unavailable,
        policies,
      }),
  }
}
