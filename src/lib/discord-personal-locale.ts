import 'server-only'

import { mapDiscordLocale } from '@/lib/discord'
import { loadGlobalAccessPreferences } from '@/lib/global-access-preferences-server'
import { isLocale, type Locale } from '@/i18n/locales'
import { log } from '@/lib/log'
import type { DiscordInteractionPayload } from '@/lib/discord-interactions'

const DEFAULT_DISCORD_PERSONAL_LOCALE = 'en' satisfies Locale

type DiscordPersonalLocalePayload = Pick<
  DiscordInteractionPayload,
  'locale' | 'guild_locale' | 'member' | 'user'
>

function invokerDiscordId(payload: DiscordPersonalLocalePayload): string | null {
  return payload.member?.user?.id ?? payload.user?.id ?? null
}

export function resolveDiscordInteractionFallbackLocale(
  payload: Pick<DiscordInteractionPayload, 'locale' | 'guild_locale'>,
): Locale {
  return mapDiscordLocale(payload.locale) ??
    mapDiscordLocale(payload.guild_locale) ??
    DEFAULT_DISCORD_PERSONAL_LOCALE
}

/**
 * Private Discord replies follow the language explicitly selected in AGM.
 * Discord client and guild locales remain safe fallbacks for members who have
 * never saved a preference. Public panel copy must not use this resolver.
 */
export async function resolveDiscordPersonalLocale(
  payload: DiscordPersonalLocalePayload,
): Promise<Locale> {
  const fallback = resolveDiscordInteractionFallbackLocale(payload)
  const discordId = invokerDiscordId(payload)
  if (!discordId) return fallback

  try {
    const preference = await loadGlobalAccessPreferences(discordId)
    if (isLocale(preference?.preferredLanguage)) {
      return preference.preferredLanguage
    }
  } catch (error) {
    log.warn('[discord-personal-locale] preference lookup failed', {
      discord_id: discordId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return fallback
}
