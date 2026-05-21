'use server'

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import {
  normalizeEventGuestDisplayName,
  type EventGuestProfileValidationError,
} from '@/lib/event-guest-profile'

function errorKeyForName(error: EventGuestProfileValidationError): string {
  if (error === 'name_too_short') return 'nameTooShort'
  if (error === 'name_too_long') return 'nameTooLong'
  return 'nameRequired'
}

export async function saveEventGuestProfile(input: {
  eventId: string
  displayName: string
  locale: string
}): Promise<{ ok?: true; error?: string }> {
  const t = await getTranslations('eventGuestProfile')
  const session = await getSession()
  if (!session?.isGuest || session.eventScope !== input.eventId) {
    return { error: t('unauthorized') }
  }

  const normalized = normalizeEventGuestDisplayName(input.displayName)
  if (normalized.error) return { error: t(errorKeyForName(normalized.error)) }
  if (!isLocale(input.locale)) return { error: t('invalidLanguage') }

  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const nowIso = new Date().toISOString()

  const { data: eventRow, error: eventError } = await db
    .from('events')
    .select('id')
    .eq('guild_id', guildId)
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventError) return { error: eventError.message }
  if (!eventRow) return { error: t('eventNotFound') }

  const { error: guestError } = await db
    .from('guests')
    .upsert(
      {
        guild_id: guildId,
        discord_id: session.discordId,
        username: session.username || normalized.value,
        avatar: session.avatar,
        preferred_language: input.locale,
      },
      { onConflict: 'guild_id,discord_id' },
    )
  if (guestError) return { error: t('saveFailed') }

  const { error: profileError } = await db
    .from('event_guest_profiles')
    .upsert(
      {
        guild_id: guildId,
        event_id: input.eventId,
        discord_id: session.discordId,
        display_name: normalized.value,
        preferred_language: input.locale,
        updated_at: nowIso,
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )
  if (profileError) return { error: t('saveFailed') }

  const { data: partyRows, error: partyError } = await db
    .from('parties')
    .select('id')
    .eq('guild_id', guildId)
    .eq('event_id', input.eventId)
  if (partyError) return { error: partyError.message }
  const partyIds = (partyRows ?? []).map((row) => row.id as string)
  if (partyIds.length > 0) {
    const [{ error: assignedError }, { error: requestedError }] = await Promise.all([
      db
        .from('slots')
        .update({ assigned_username: normalized.value })
        .eq('guild_id', guildId)
        .eq('assigned_discord_id', session.discordId)
        .in('party_id', partyIds),
      db
        .from('slots')
        .update({ requested_username: normalized.value })
        .eq('guild_id', guildId)
        .eq('requested_discord_id', session.discordId)
        .in('party_id', partyIds),
    ])
    if (assignedError) return { error: assignedError.message }
    if (requestedError) return { error: requestedError.message }
  }

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  cookieStore.set(LOCALE_COOKIE, input.locale, localeCookieOptions(headerStore.get('host')))

  revalidatePath(`/events/${input.eventId}`)
  return { ok: true }
}
