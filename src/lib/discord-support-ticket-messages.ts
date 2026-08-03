import type { Locale } from '@/i18n/locales'
import { mapDiscordLocale } from '@/lib/discord'
import type { DiscordInteractionPayload } from '@/lib/discord-interactions'
import type { DiscordSupportMessages } from '@/lib/discord-support-ticket-core'

export function resolveDiscordSupportLocale(
  payload: Pick<DiscordInteractionPayload, 'locale' | 'guild_locale'>,
): Locale {
  return mapDiscordLocale(payload.locale) ?? mapDiscordLocale(payload.guild_locale) ?? 'ko'
}
export async function loadDiscordSupportMessages(
  locale: Locale,
): Promise<DiscordSupportMessages> {
  const document = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const namespace = (document.discordSupport ?? {}) as Record<string, string>
  return namespace as unknown as DiscordSupportMessages
}
