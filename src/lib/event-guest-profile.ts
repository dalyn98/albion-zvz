import { getAdminClient } from '@/lib/supabase-admin'
import { isLocale, type Locale } from '@/i18n/locales'

export interface EventGuestProfile {
  displayName: string
  preferredLanguage: Locale
}

export type EventGuestProfileValidationError =
  | 'name_required'
  | 'name_too_short'
  | 'name_too_long'
  | 'invalid_language'

export function normalizeEventGuestDisplayName(
  raw: string,
): { value: string; error?: EventGuestProfileValidationError } {
  const value = raw.trim().replace(/\s+/g, ' ')
  if (!value) return { value, error: 'name_required' }
  if (value.length < 2) return { value, error: 'name_too_short' }
  if (value.length > 32) return { value, error: 'name_too_long' }
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
    .select('display_name, preferred_language')
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
