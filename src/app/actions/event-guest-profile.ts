'use server'

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import {
  SESSION_COOKIE_NAME,
  cookieOptions,
  getSession,
  signSession,
  type SessionPayload,
} from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import {
  normalizeEventGuestDisplayName,
  type EventGuestProfileValidationError,
} from '@/lib/event-guest-profile'
import { resolveEventGuestInviteScope } from '@/lib/event-guest-auth'
import { createAnonymousEventGuestId } from '@/lib/event-guest-identity'

function errorKeyForName(error: EventGuestProfileValidationError): string {
  if (error === 'name_too_short') return 'nameTooShort'
  if (error === 'name_too_long') return 'nameTooLong'
  return 'nameRequired'
}

export async function saveEventGuestProfile(input: {
  eventId: string
  displayName: string
  locale: string
  inviteToken?: string | null
}): Promise<{ ok?: true; error?: string }> {
  const t = await getTranslations('eventGuestProfile')
  const session = await getSession()

  const normalized = normalizeEventGuestDisplayName(input.displayName)
  if (normalized.error) return { error: t(errorKeyForName(normalized.error)) }
  if (!isLocale(input.locale)) return { error: t('invalidLanguage') }

  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  let guildId: string
  let guestDiscordId: string
  let guestAvatar: string | null = null
  let nextSession: SessionPayload | null = null

  if (session?.isGuest && session.eventScope === input.eventId) {
    guildId = await getSessionGuildId(session)
    guestDiscordId = session.discordId
    guestAvatar = session.avatar
    nextSession = {
      ...session,
      username: normalized.value,
      avatar: session.avatar,
      issuedAt: Date.now(),
    }
  } else {
    const inviteScope = await resolveEventGuestInviteScope(db, {
      inviteToken: input.inviteToken,
      eventId: input.eventId,
    })
    if (!inviteScope || inviteScope.eventId !== input.eventId) {
      return { error: t('unauthorized') }
    }
    if (session?.isMember || session?.isAdmin || session?.isBombSquadCaller) {
      const sessionGuildId = await getSessionGuildId(session)
      if (sessionGuildId === inviteScope.guildId) return { error: t('unauthorized') }
    }
    guildId = inviteScope.guildId
    guestDiscordId = createAnonymousEventGuestId()
    nextSession = {
      discordId: guestDiscordId,
      username: normalized.value,
      avatar: null,
      isMember: false,
      isAdmin: false,
      isGuest: true,
      isBombSquadCaller: false,
      isLocalGuildAccount: false,
      isAllianceCandidate: false,
      canCreateEvents: false,
      eventCreatorCategories: [],
      eventScope: input.eventId,
      guildId,
      capabilities: '0',
      issuedAt: Date.now(),
    }
  }

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
        discord_id: guestDiscordId,
        username: normalized.value,
        avatar: guestAvatar,
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
        discord_id: guestDiscordId,
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
        .eq('assigned_discord_id', guestDiscordId)
        .in('party_id', partyIds),
      db
        .from('slots')
        .update({ requested_username: normalized.value })
        .eq('guild_id', guildId)
        .eq('requested_discord_id', guestDiscordId)
        .in('party_id', partyIds),
    ])
    if (assignedError) return { error: assignedError.message }
    if (requestedError) return { error: requestedError.message }
  }

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  cookieStore.set(LOCALE_COOKIE, input.locale, localeCookieOptions(headerStore.get('host')))
  if (nextSession) {
    cookieStore.set(SESSION_COOKIE_NAME, await signSession(nextSession), cookieOptions())
  }

  revalidatePath(`/events/${input.eventId}`)
  return { ok: true }
}
