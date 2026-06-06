import 'server-only'
import { cache } from 'react'
import { getAdminClient } from '@/lib/supabase-admin'

export interface ActiveGuildProfileAvatar {
  discordId: string
  username: string
  avatar: string | null
  albionPlayerId: string | null
  isAdmin: boolean
  publicDiscordHandle: string | null
}

interface GuildAvatarRow {
  discord_id: string | null
  username: string | null
  avatar: string | null
  albion_player_id: string | null
  is_admin: boolean | null
  public_discord_handle: string | null
}

export const loadActiveGuildProfileAvatars = cache(
  async (guildId: string): Promise<ActiveGuildProfileAvatar[]> => {
    const db = getAdminClient()
    const { data } = await db
      .from('guild_avatars')
      .select('discord_id, username, avatar, albion_player_id, is_admin, public_discord_handle')
      .eq('guild_id', guildId)
      .is('withdrawn_at', null)
      .order('username', { ascending: true })

    const rows: ActiveGuildProfileAvatar[] = []
    for (const row of (data ?? []) as GuildAvatarRow[]) {
      if (!row.discord_id || !row.username) continue
      rows.push({
        discordId: row.discord_id,
        username: row.username,
        avatar: row.avatar,
        albionPlayerId: row.albion_player_id,
        isAdmin: row.is_admin === true,
        publicDiscordHandle: row.public_discord_handle,
      })
    }
    return rows
  },
)
