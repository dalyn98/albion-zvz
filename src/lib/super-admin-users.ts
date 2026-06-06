import 'server-only'

import { getAdminClient } from '@/lib/supabase-admin'
import { isSiteNicknameOverrideStoreUnavailableError } from '@/lib/site-nickname-override'

export interface SiteNicknameOverrideDetail {
  discordId: string
  nickname: string
  updatedByDiscordId: string
  reason: string | null
  createdAt: string
  updatedAt: string
}

export interface SiteUserPresenceRow {
  kind: 'member' | 'guest'
  guildId: string
  username: string
  avatar: string | null
  updatedAt: string | null
  withdrawnAt: string | null
  albionNickname: string | null
}

export interface SiteUserTenant {
  id: string
  name: string
  slug: string
}

export interface SiteUserLookup {
  discordId: string
  override: SiteNicknameOverrideDetail | null
  overrideStoreAvailable: boolean
  presences: SiteUserPresenceRow[]
  tenants: Map<string, SiteUserTenant>
}

interface OverrideRow {
  discord_id: string
  nickname: string
  updated_by_discord_id: string
  reason: string | null
  created_at: string
  updated_at: string
}

interface GuildAvatarRow {
  guild_id: string
  username: string
  avatar: string | null
  updated_at: string | null
  withdrawn_at: string | null
  albion_nickname: string | null
}

interface GuestRow {
  guild_id: string
  username: string
  avatar: string | null
  joined_at: string | null
}

interface TenantRow {
  id: string
  name: string
  slug: string
}

function toOverride(row: OverrideRow | null): SiteNicknameOverrideDetail | null {
  if (!row) return null
  return {
    discordId: row.discord_id,
    nickname: row.nickname,
    updatedByDiscordId: row.updated_by_discord_id,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function lookupSiteUserByDiscordId(discordId: string): Promise<SiteUserLookup> {
  const db = getAdminClient()
  const [overrideResult, membersResult, guestsResult] = await Promise.all([
    db
      .from('site_user_nickname_overrides')
      .select('discord_id, nickname, updated_by_discord_id, reason, created_at, updated_at')
      .eq('discord_id', discordId)
      .maybeSingle(),
    db
      .from('guild_avatars')
      .select('guild_id, username, avatar, updated_at, withdrawn_at, albion_nickname')
      .eq('discord_id', discordId)
      .order('updated_at', { ascending: false }),
    db
      .from('guests')
      .select('guild_id, username, avatar, joined_at')
      .eq('discord_id', discordId)
      .order('joined_at', { ascending: false }),
  ])

  let overrideStoreAvailable = true
  if (overrideResult.error) {
    if (!isSiteNicknameOverrideStoreUnavailableError(overrideResult.error)) {
      throw new Error(`nickname override lookup failed: ${overrideResult.error.message}`)
    }
    overrideStoreAvailable = false
  }
  if (membersResult.error) {
    throw new Error(`member lookup failed: ${membersResult.error.message}`)
  }
  if (guestsResult.error) {
    throw new Error(`guest lookup failed: ${guestsResult.error.message}`)
  }

  const memberRows = (membersResult.data ?? []) as GuildAvatarRow[]
  const guestRows = (guestsResult.data ?? []) as GuestRow[]
  const presences: SiteUserPresenceRow[] = [
    ...memberRows.map((row) => ({
      kind: 'member' as const,
      guildId: row.guild_id,
      username: row.username,
      avatar: row.avatar,
      updatedAt: row.updated_at,
      withdrawnAt: row.withdrawn_at,
      albionNickname: row.albion_nickname,
    })),
    ...guestRows.map((row) => ({
      kind: 'guest' as const,
      guildId: row.guild_id,
      username: row.username,
      avatar: row.avatar,
      updatedAt: row.joined_at,
      withdrawnAt: null,
      albionNickname: null,
    })),
  ]

  const tenantIds = Array.from(new Set(presences.map((row) => row.guildId)))
  const tenants = new Map<string, SiteUserTenant>()
  if (tenantIds.length > 0) {
    const { data, error } = await db.from('tenants').select('id, name, slug').in('id', tenantIds)
    if (error) throw new Error(`tenant lookup failed: ${error.message}`)
    for (const row of (data ?? []) as TenantRow[]) {
      tenants.set(row.id, { id: row.id, name: row.name, slug: row.slug })
    }
  }

  return {
    discordId,
    override: overrideStoreAvailable ? toOverride((overrideResult.data as OverrideRow | null) ?? null) : null,
    overrideStoreAvailable,
    presences,
    tenants,
  }
}
