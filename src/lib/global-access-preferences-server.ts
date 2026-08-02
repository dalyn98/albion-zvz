import 'server-only'

import { isLocale, type Locale } from '@/i18n/locales'
import { getAdminClient } from '@/lib/supabase-admin'

export interface GlobalAccessPreferences {
  preferredLanguage: Locale | null
  timezone: string | null
}

export async function loadGlobalAccessPreferences(
  discordId: string,
): Promise<GlobalAccessPreferences | null> {
  const { data, error } = await getAdminClient()
    .from('global_access_preferences')
    .select('preferred_language,timezone')
    .eq('provider', 'discord')
    .eq('subject', discordId)
    .maybeSingle()
  if (error) throw new Error(`GLOBAL_PREFERENCE_LOAD_FAILED:${error.code}`)
  if (!data) return null
  return {
    preferredLanguage: isLocale(data.preferred_language)
      ? data.preferred_language
      : null,
    timezone: typeof data.timezone === 'string' ? data.timezone : null,
  }
}

export async function setGlobalAccessPreferences(input: {
  discordId: string
  preferredLanguage?: Locale
  timezone?: string | null
}): Promise<GlobalAccessPreferences> {
  const updateLanguage = input.preferredLanguage !== undefined
  const updateTimezone = Object.prototype.hasOwnProperty.call(input, 'timezone')
  const { data, error } = await getAdminClient().rpc(
    'set_global_access_preferences',
    {
      p_provider: 'discord',
      p_subject: input.discordId,
      p_preferred_language: input.preferredLanguage ?? null,
      p_timezone: updateTimezone ? input.timezone ?? null : null,
      p_update_language: updateLanguage,
      p_update_timezone: updateTimezone,
    },
  )
  if (error) throw error
  const result = data as {
    preferredLanguage?: unknown
    timezone?: unknown
  } | null
  return {
    preferredLanguage: typeof result?.preferredLanguage === 'string' &&
      isLocale(result.preferredLanguage)
      ? result.preferredLanguage
      : null,
    timezone: typeof result?.timezone === 'string' ? result.timezone : null,
  }
}
