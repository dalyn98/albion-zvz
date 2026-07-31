import { getAdminClient } from '@/lib/supabase-admin'
import { isLocale, type Locale } from '@/i18n/locales'
import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'

export interface EventGuestProfile {
  displayName: string
  preferredLanguage: Locale
  albionServer: AlbionServer | null
  albionPlayerId: string | null
  albionCharacterName: string | null
  albionGuildName: string | null
  characterVerified: boolean
}

export type EventGuestProfileValidationError =
  | 'name_required'
  | 'name_too_short'
  | 'name_too_long'
  | 'invalid_language'
  | 'character_required'
  | 'character_too_long'

export function normalizeEventGuestDisplayName(
  raw: string,
): { value: string; error?: EventGuestProfileValidationError } {
  const value = raw.trim().replace(/\s+/g, ' ')
  if (!value) return { value, error: 'name_required' }
  if (value.length < 2) return { value, error: 'name_too_short' }
  if (value.length > 32) return { value, error: 'name_too_long' }
  return { value }
}

export function normalizeEventGuestCharacterName(
  raw: string,
): { value: string; error?: EventGuestProfileValidationError } {
  const value = raw.trim().replace(/\s+/g, ' ')
  if (!value) return { value, error: 'character_required' }
  if (value.length > 64) return { value, error: 'character_too_long' }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { value, error: 'character_required' }
  }
  return { value }
}

export async function getEventGuestProfile(
  guildId: string,
  eventId: string,
  discordId: string,
): Promise<EventGuestProfile | null> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('event_guest_profiles')
    .select(
      'display_name, preferred_language, albion_server, albion_player_id, albion_character_name, albion_guild_name, character_verified',
    )
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (error || !data) return null
  const preferredLanguage = data.preferred_language
  if (!isLocale(preferredLanguage)) return null
  return {
    displayName: data.display_name as string,
    preferredLanguage,
    albionServer: isAlbionServer(data.albion_server) ? data.albion_server : null,
    albionPlayerId:
      typeof data.albion_player_id === 'string' ? data.albion_player_id : null,
    albionCharacterName:
      typeof data.albion_character_name === 'string'
        ? data.albion_character_name
        : null,
    albionGuildName:
      typeof data.albion_guild_name === 'string' ? data.albion_guild_name : null,
    characterVerified: data.character_verified === true,
  }
}

export async function getEventGuestDisplayNamesByDiscordIds(
  guildId: string,
  eventId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const unique = Array.from(new Set(ids))
  const db = getAdminClient()
  const { data } = await db
    .from('event_guest_profiles')
    .select('discord_id, display_name')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .in('discord_id', unique)
  const result = new Map<string, string>()
  for (const row of data ?? []) {
    result.set(row.discord_id as string, row.display_name as string)
  }
  return result
}
