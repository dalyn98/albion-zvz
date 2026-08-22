import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { getAdminClient } from '@/lib/supabase-admin'

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST205'])

export interface AlbionIdentityResourceExceptionBinding {
  guildId: string
  discordId: string
  server: AlbionServer
  playerId: string
  playerName: string
}

export interface AlbionIdentityResourceException
  extends AlbionIdentityResourceExceptionBinding {
  reason: string
  grantedByDiscordId: string
  grantedAt: string
  updatedAt: string
}

interface ResourceExceptionRow {
  guild_id: string
  discord_id: string
  albion_server: AlbionServer
  albion_player_id: string
  albion_player_name: string
  reason: string
  granted_by_discord_id: string
  granted_at: string
  updated_at: string
}

export function isMissingAlbionResourceExceptionTable(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false
  if (error.code && MISSING_TABLE_CODES.has(error.code)) return true
  return typeof error.message === 'string' &&
    error.message.includes('albion_identity_resource_exceptions')
}

export function matchesAlbionResourceException(
  binding: AlbionIdentityResourceExceptionBinding,
  identity: {
    guildId: string
    discordId: string
    server: AlbionServer | null
    playerId: string | null
    trustStatus: string | null
    revokedAt?: string | null
  },
): boolean {
  return !identity.revokedAt &&
    identity.trustStatus !== 'revoked' &&
    binding.guildId === identity.guildId &&
    binding.discordId === identity.discordId &&
    binding.server === identity.server &&
    binding.playerId === identity.playerId
}

function mapRow(row: ResourceExceptionRow): AlbionIdentityResourceException {
  return {
    guildId: row.guild_id,
    discordId: row.discord_id,
    server: row.albion_server,
    playerId: row.albion_player_id,
    playerName: row.albion_player_name,
    reason: row.reason,
    grantedByDiscordId: row.granted_by_discord_id,
    grantedAt: row.granted_at,
    updatedAt: row.updated_at,
  }
}

export async function getAlbionIdentityResourceException(
  guildId: string,
  discordId: string,
  db: SupabaseClient = getAdminClient(),
): Promise<AlbionIdentityResourceException | null> {
  const { data, error } = await db
    .from('albion_identity_resource_exceptions')
    .select(
      'guild_id, discord_id, albion_server, albion_player_id, albion_player_name, reason, granted_by_discord_id, granted_at, updated_at',
    )
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()

  if (isMissingAlbionResourceExceptionTable(error)) return null
  if (error) throw error
  return data ? mapRow(data as ResourceExceptionRow) : null
}

export async function listMatchingAlbionResourceExceptionDiscordIds(input: {
  guildId: string
  discordIds: string[]
  db?: SupabaseClient
}): Promise<Set<string>> {
  if (input.discordIds.length === 0) return new Set()
  const db = input.db ?? getAdminClient()
  const requestedDiscordIds = new Set(input.discordIds)
  const { data: allExceptionRows, error: exceptionError } = await db
    .from('albion_identity_resource_exceptions')
    .select('discord_id, albion_server, albion_player_id')
    .eq('guild_id', input.guildId)

  if (isMissingAlbionResourceExceptionTable(exceptionError)) return new Set()
  if (exceptionError) throw exceptionError
  const exceptionRows = (allExceptionRows ?? []).filter((row) =>
    requestedDiscordIds.has(row.discord_id as string),
  )
  if (exceptionRows.length === 0) return new Set()

  const { data: linkRows, error: linkError } = await db
    .from('account_albion_tenant_links')
    .select('discord_id, albion_server, albion_player_id, trust_status, revoked_at')
    .eq('guild_id', input.guildId)
    .in(
      'discord_id',
      exceptionRows.map((row) => row.discord_id as string),
    )
  if (linkError) throw linkError

  const currentByDiscord = new Map(
    (linkRows ?? []).map((row) => [
      row.discord_id as string,
      row.trust_status === 'revoked' || row.revoked_at
        ? null
        : `${row.albion_server ?? ''}:${row.albion_player_id ?? ''}`,
    ]),
  )
  const matched = new Set<string>()
  for (const row of exceptionRows ?? []) {
    const discordId = row.discord_id as string
    const binding = `${row.albion_server ?? ''}:${row.albion_player_id ?? ''}`
    if (currentByDiscord.get(discordId) === binding) matched.add(discordId)
  }
  return matched
}
