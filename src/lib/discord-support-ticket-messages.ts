import type { Locale } from '@/i18n/locales'
import type { DiscordInteractionPayload } from '@/lib/discord-interactions'
import type { DiscordSupportMessages } from '@/lib/discord-support-ticket-core'

export function resolveDiscordSupportLocale(
  payload: Pick<DiscordInteractionPayload, 'locale' | 'guild_locale'>,
): Locale {
  void payload
  // The official support server deliberately operates in English. Product UI
  // localization remains unchanged, but support policy and bot copy stay
  // consistent for every requester and every retained ticket.
  return 'en'
}
export async function loadDiscordSupportMessages(
  locale: Locale,
): Promise<DiscordSupportMessages> {
  void locale
  const document = (await import('../messages/en.json')).default as Record<string, unknown>
  const namespace = (document.discordSupport ?? {}) as Record<string, string>
  return namespace as unknown as DiscordSupportMessages
}
