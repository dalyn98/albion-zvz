import 'server-only'

import { cache } from 'react'
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantDiscordConfig } from '@/lib/tenant'

export interface GuildMemberDirectoryEntry {
  guildMemberId: string
  guildId: string
  tenantStatus: string
  status: 'active' | 'withdrawn'
  displayName: string
  displayNameOverride: string | null
  displayNameSnapshot: string | null
  joinedAt: string
  lastReactivatedAt: string | null
  withdrawnAt: string | null
  discordId: string | null
  discordAccessRevokedAt: string | null
  discordDisplayName: string | null
  avatar: string | null
  isAdmin: boolean
  isCrafter: boolean
  isBombSquadCaller: boolean
  albionServer: 'west' | 'east' | 'europe' | null
  albionPlayerId: string | null
  albionPlayerName: string | null
  characterRelation: 'home_guild' | 'alliance' | 'external' | 'unknown' | null
  characterTrustStatus:
    | 'claimed'
    | 'roster_matched'
    | 'trusted'
    | 'disputed'
    | 'revoked'
    | null
}

export interface AccessibleGuildMembership {
  guildId: string
  guildMemberId: string
  slug: string
  name: string
  displayName: string
  avatar: string | null
  albionPlayerName: string | null
  current: boolean
}

interface GuildMemberDirectoryRow {
  guild_member_id: string
  guild_id: string
  tenant_status: string
  status: 'active' | 'withdrawn'
  display_name: string | null
  display_name_override: string | null
  display_name_snapshot: string | null
  joined_at: string
  last_reactivated_at: string | null
  withdrawn_at: string | null
  discord_id: string | null
  discord_access_revoked_at: string | null
  discord_display_name: string | null
  avatar: string | null
  is_admin: boolean | null
  is_crafter: boolean | null
  is_bomb_squad_caller: boolean | null
  albion_server: 'west' | 'east' | 'europe' | null
  albion_player_id: string | null
  albion_player_name: string | null
  character_relation:
    | 'home_guild'
    | 'alliance'
    | 'external'
    | 'unknown'
    | null
  character_trust_status:
    | 'claimed'
    | 'roster_matched'
    | 'trusted'
    | 'disputed'
    | 'revoked'
    | null
}

const DIRECTORY_COLUMNS = [
  'guild_member_id',
  'guild_id',
  'tenant_status',
  'status',
  'display_name',
  'display_name_override',
  'display_name_snapshot',
  'joined_at',
  'last_reactivated_at',
  'withdrawn_at',
  'discord_id',
  'discord_access_revoked_at',
  'discord_display_name',
  'avatar',
  'is_admin',
  'is_crafter',
  'is_bomb_squad_caller',
  'albion_server',
  'albion_player_id',
  'albion_player_name',
  'character_relation',
  'character_trust_status',
].join(', ')

export function resolveGuildMemberDirectoryDisplayName(input: {
  displayNameOverride?: string | null
  albionPlayerName?: string | null
  displayNameSnapshot?: string | null
  discordDisplayName?: string | null
}): string {
  for (const candidate of [
    input.displayNameOverride,
    input.albionPlayerName,
    input.displayNameSnapshot,
    input.discordDisplayName,
  ]) {
    const value = candidate?.trim()
    if (value) return value
  }
  return ''
}

function mapDirectoryRow(row: GuildMemberDirectoryRow): GuildMemberDirectoryEntry {
  return {
    guildMemberId: row.guild_member_id,
    guildId: row.guild_id,
    tenantStatus: row.tenant_status,
    status: row.status,
    displayName:
      row.display_name?.trim() ||
      resolveGuildMemberDirectoryDisplayName({
        displayNameOverride: row.display_name_override,
        albionPlayerName: row.albion_player_name,
        displayNameSnapshot: row.display_name_snapshot,
        discordDisplayName: row.discord_display_name,
      }),
    displayNameOverride: row.display_name_override,
    displayNameSnapshot: row.display_name_snapshot,
    joinedAt: row.joined_at,
    lastReactivatedAt: row.last_reactivated_at,
    withdrawnAt: row.withdrawn_at,
    discordId: row.discord_id,
    discordAccessRevokedAt: row.discord_access_revoked_at,
    discordDisplayName: row.discord_display_name,
    avatar: row.avatar,
    isAdmin: row.is_admin === true,
    isCrafter: row.is_crafter === true,
    isBombSquadCaller: row.is_bomb_squad_caller === true,
    albionServer: row.albion_server,
    albionPlayerId: row.albion_player_id,
    albionPlayerName: row.albion_player_name,
    characterRelation: row.character_relation,
    characterTrustStatus: row.character_trust_status,
  }
}

export const getGuildMemberDirectoryEntry = cache(
  async (
    guildId: string,
    discordId: string,
  ): Promise<GuildMemberDirectoryEntry | null> => {
    const db = getAdminClient()
    const { data, error } = await db
      .from('guild_member_directory_v1')
      .select(DIRECTORY_COLUMNS)
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .maybeSingle()

    if (error) {
      throw new Error(`Guild member directory lookup failed: ${error.message}`)
    }
    return data ? mapDirectoryRow(data as unknown as GuildMemberDirectoryRow) : null
  },
)

export const listAccessibleGuildMemberships = cache(
  async (
    discordId: string,
    currentGuildId?: string | null,
  ): Promise<AccessibleGuildMembership[]> => {
    const db = getAdminClient()
    const { data, error } = await db
      .from('guild_member_directory_v1')
      .select(DIRECTORY_COLUMNS)
      .eq('discord_id', discordId)
      .eq('status', 'active')

    if (error) {
      throw new Error(`Accessible guild membership lookup failed: ${error.message}`)
    }

    const entries = ((data ?? []) as unknown as GuildMemberDirectoryRow[])
      .map(mapDirectoryRow)
      .filter(
        (entry) =>
          entry.discordId === discordId &&
          entry.discordAccessRevokedAt === null &&
          entry.tenantStatus === 'active',
      )
    const configurations = await Promise.all(
      entries.map((entry) => getTenantDiscordConfig(entry.guildId)),
    )

    return entries
      .flatMap((entry, index) => {
        const tenant = configurations[index]
        if (!tenant?.botInstalled) return []
        return [{
          guildId: entry.guildId,
          guildMemberId: entry.guildMemberId,
          slug: tenant.slug,
          name: tenant.name,
          displayName: entry.displayName,
          avatar: entry.avatar,
          albionPlayerName: entry.albionPlayerName,
          current: entry.guildId === currentGuildId,
        }]
      })
      .sort((left, right) => {
        if (left.current !== right.current) return left.current ? -1 : 1
        return left.name.localeCompare(right.name)
      })
  },
)
