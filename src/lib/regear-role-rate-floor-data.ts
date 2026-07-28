import type { getAdminClient } from '@/lib/supabase-admin'
import {
  resolveRegearDiscordRoleRateFloor,
  type RegearDiscordRoleRateFloor,
} from '@/lib/regear-role-rate-floor'
import { loadRequesterDiscordRoleIds } from '@/lib/regear-role-policy-data'

type AdminDbClient = ReturnType<typeof getAdminClient>

interface RegearDiscordRoleRateFloorDbRow {
  id: string
  discord_role_id: string
  discord_role_name: string
  minimum_payout_rate_percent: number
  updated_at: string
}

export function mapRegearDiscordRoleRateFloorRow(
  row: RegearDiscordRoleRateFloorDbRow,
): RegearDiscordRoleRateFloor {
  return {
    id: row.id,
    discordRoleId: row.discord_role_id,
    discordRoleName: row.discord_role_name,
    minimumPayoutRatePercent: row.minimum_payout_rate_percent,
    updatedAt: row.updated_at,
  }
}

export async function loadRegearDiscordRoleRateFloorConfig(
  db: AdminDbClient,
  guildId: string,
): Promise<{
  configured: boolean
  policies: RegearDiscordRoleRateFloor[]
  error?: string
}> {
  const { data, error } = await db
    .from('regear_discord_role_rate_floors')
    .select(
      'id, discord_role_id, discord_role_name, minimum_payout_rate_percent, updated_at',
    )
    .eq('guild_id', guildId)
    .order('minimum_payout_rate_percent', { ascending: false })
  if (error) return { configured: false, policies: [], error: error.message }
  const policies = ((data ?? []) as RegearDiscordRoleRateFloorDbRow[]).map(
    mapRegearDiscordRoleRateFloorRow,
  )
  return { configured: policies.length > 0, policies }
}

export async function resolveRequesterRegearRoleRateFloor(input: {
  db: AdminDbClient
  guildId: string
  discordId: string
}): Promise<{
  configured: boolean
  matched: RegearDiscordRoleRateFloor | null
  rolesUnavailable: boolean
  error?: string
}> {
  const config = await loadRegearDiscordRoleRateFloorConfig(input.db, input.guildId)
  if (config.error || !config.configured) {
    return {
      configured: false,
      matched: null,
      rolesUnavailable: false,
      error: config.error,
    }
  }

  const memberRoles = await loadRequesterDiscordRoleIds(input.guildId, input.discordId)
  return {
    configured: true,
    matched: resolveRegearDiscordRoleRateFloor(memberRoles.roleIds, config.policies),
    rolesUnavailable: memberRoles.unavailable,
  }
}
