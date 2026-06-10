import 'server-only'

import { getTranslations } from 'next-intl/server'
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'
import {
  sendDiscordDmsToUsers,
  sendDiscordDmToUser,
  type DiscordDmPayload,
  type DmResult,
} from '@/lib/discord-dm'
import { log } from '@/lib/log'
import { getAdminClient } from '@/lib/supabase-admin'
import type { EventCategory } from '@/types'

export interface DiscordDmLocaleRow {
  discord_id: string | null
  preferred_language: string | null
}

type DiscordDmTranslationValue = string | number | boolean | Date | null | undefined
export type DiscordDmTranslator = (
  key: string,
  values?: Record<string, DiscordDmTranslationValue>,
) => string

type BuildLocalizedPayload = (
  t: DiscordDmTranslator,
  locale: Locale,
) => DiscordDmPayload | Promise<DiscordDmPayload>

function uniqueDiscordIds(discordIds: readonly string[]): string[] {
  return Array.from(
    new Set(discordIds.filter((id) => typeof id === 'string' && id.length > 0)),
  )
}

export function resolveDiscordDmLocaleMap(
  discordIds: readonly string[],
  avatarRows: readonly DiscordDmLocaleRow[],
  guestRows: readonly DiscordDmLocaleRow[],
): Map<string, Locale> {
  const localeMap = new Map<string, Locale>()
  const explicitIds = new Set<string>()

  for (const discordId of uniqueDiscordIds(discordIds)) {
    localeMap.set(discordId, DEFAULT_LOCALE)
  }

  for (const row of avatarRows) {
    if (!row.discord_id || !localeMap.has(row.discord_id)) continue
    if (!isLocale(row.preferred_language)) continue
    localeMap.set(row.discord_id, row.preferred_language)
    explicitIds.add(row.discord_id)
  }

  for (const row of guestRows) {
    if (!row.discord_id || !localeMap.has(row.discord_id)) continue
    if (explicitIds.has(row.discord_id)) continue
    if (!isLocale(row.preferred_language)) continue
    localeMap.set(row.discord_id, row.preferred_language)
    explicitIds.add(row.discord_id)
  }

  return localeMap
}

export async function loadDiscordDmLocaleMap(
  guildId: string,
  discordIds: readonly string[],
): Promise<Map<string, Locale>> {
  const uniqueIds = uniqueDiscordIds(discordIds)
  if (uniqueIds.length === 0) return new Map()

  const db = getAdminClient()
  const [avatarResult, guestResult] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, preferred_language')
      .eq('guild_id', guildId)
      .in('discord_id', uniqueIds),
    db
      .from('guests')
      .select('discord_id, preferred_language')
      .eq('guild_id', guildId)
      .in('discord_id', uniqueIds),
  ])

  if (avatarResult.error) {
    log.error('[discord-dm-localized] guild_avatars preferred_language lookup failed', avatarResult.error, {
      tenant_id: guildId,
    })
  }
  if (guestResult.error) {
    log.error('[discord-dm-localized] guests preferred_language lookup failed', guestResult.error, {
      tenant_id: guildId,
    })
  }

  return resolveDiscordDmLocaleMap(
    uniqueIds,
    avatarResult.error ? [] : ((avatarResult.data ?? []) as DiscordDmLocaleRow[]),
    guestResult.error ? [] : ((guestResult.data ?? []) as DiscordDmLocaleRow[]),
  )
}

export async function loadDiscordDmLocale(
  guildId: string,
  discordId: string,
): Promise<Locale> {
  const localeMap = await loadDiscordDmLocaleMap(guildId, [discordId])
  return localeMap.get(discordId) ?? DEFAULT_LOCALE
}

export async function getDiscordDmTranslator(locale: Locale): Promise<DiscordDmTranslator> {
  const t = await getTranslations({ locale, namespace: 'discordDm' })
  return (key, values) => t(key as never, values as never)
}

export async function sendLocalizedDiscordDmToUser(
  discordId: string,
  guildId: string,
  buildPayload: BuildLocalizedPayload,
): Promise<DmResult> {
  if (!discordId) return { attempted: 0, succeeded: 0 }
  const locale = await loadDiscordDmLocale(guildId, discordId)
  const t = await getDiscordDmTranslator(locale)
  const payload = await buildPayload(t, locale)
  return sendDiscordDmToUser(discordId, guildId, payload)
}

export async function sendLocalizedDiscordDmsToUsers(
  discordIds: readonly string[],
  guildId: string,
  buildPayload: BuildLocalizedPayload,
  categoryFilter?: EventCategory,
  localeMap?: ReadonlyMap<string, Locale>,
): Promise<DmResult> {
  const uniqueIds = uniqueDiscordIds(discordIds)
  if (uniqueIds.length === 0) return { attempted: 0, succeeded: 0 }

  const resolvedLocaleMap = localeMap ?? await loadDiscordDmLocaleMap(guildId, uniqueIds)
  const idsByLocale = new Map<Locale, string[]>()
  for (const discordId of uniqueIds) {
    const locale = resolvedLocaleMap.get(discordId) ?? DEFAULT_LOCALE
    const ids = idsByLocale.get(locale) ?? []
    ids.push(discordId)
    idsByLocale.set(locale, ids)
  }

  let attempted = 0
  let succeeded = 0
  for (const [locale, ids] of idsByLocale) {
    const t = await getDiscordDmTranslator(locale)
    const payload = await buildPayload(t, locale)
    const result = await sendDiscordDmsToUsers(ids, guildId, payload, categoryFilter)
    attempted += result.attempted
    succeeded += result.succeeded
  }

  return { attempted, succeeded }
}
