'use server'


import { publicActionError } from '@/lib/public-action-error'
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
  normalizeEventGuestCharacterName,
  normalizeEventGuestDisplayName,
  type EventGuestProfileValidationError,
} from '@/lib/event-guest-profile'
import { resolveEventGuestInviteScope } from '@/lib/event-guest-auth'
import { createAnonymousEventGuestId } from '@/lib/event-guest-identity'
import { getAppSetting } from '@/lib/app-settings'
import {
  isAlbionServer,
  searchPlayers,
  type GameinfoPlayer,
} from '@/lib/albion-gameinfo'
import { consumeEventGuestRequestBudget } from '@/lib/event-guest-security'

function errorKeyForName(error: EventGuestProfileValidationError): string {
  if (error === 'name_too_short') return 'nameTooShort'
  if (error === 'name_too_long') return 'nameTooLong'
  return 'nameRequired'
}

function errorKeyForCharacter(error: EventGuestProfileValidationError): string {
  if (error === 'character_too_long') return 'characterTooLong'
  return 'characterRequired'
}

function exactCharacterMatch(
  rows: readonly GameinfoPlayer[],
  expectedName: string,
): GameinfoPlayer | null {
  const normalized = expectedName.toLocaleLowerCase('en-US')
  return rows.find((row) => row.Name.toLocaleLowerCase('en-US') === normalized) ?? null
}

export async function saveEventGuestProfile(input: {
  eventId: string
  displayName: string
  characterName: string
  locale: string
  inviteToken?: string | null
}): Promise<{ ok?: true; characterVerified?: boolean; error?: string }> {
  const t = await getTranslations('eventGuestProfile')
  const session = await getSession()

  const normalizedCharacter = normalizeEventGuestCharacterName(input.characterName)
  if (normalizedCharacter.error) {
    return { error: t(errorKeyForCharacter(normalizedCharacter.error)) }
  }
  const requestedDisplayName = input.displayName.trim()
  const normalized = requestedDisplayName
    ? normalizeEventGuestDisplayName(requestedDisplayName)
    : { value: normalizedCharacter.value }
  if (normalized.error) return { error: t(errorKeyForName(normalized.error)) }
  if (!isLocale(input.locale)) return { error: t('invalidLanguage') }

  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const inviteScope = !session
    ? await resolveEventGuestInviteScope(db, {
        eventId: input.eventId,
        inviteToken: input.inviteToken,
      })
    : null
  if (
    session &&
    (!session.isGuest || session.eventScope !== input.eventId)
  ) {
    return { error: t('unauthorized') }
  }
  if (!session && !inviteScope) return { error: t('unauthorized') }

  const guildId = session
    ? await getSessionGuildId(session)
    : inviteScope!.guildId
  const guestDiscordId = session?.discordId ?? createAnonymousEventGuestId()
  const guestAvatar = session?.avatar ?? null
  const headerStore = await headers()
  const withinBudget = await consumeEventGuestRequestBudget({
    db,
    headers: headerStore,
    guildId,
    eventId: input.eventId,
    action: 'profile',
    subject: input.inviteToken?.trim() || guestDiscordId,
    bucketSeconds: 300,
    limit: 12,
  }).catch(() => false)
  if (!withinBudget) return { error: t('temporarilyLimited') }

  const { data: eventRow, error: eventError } = await db
    .from('events')
    .select('id, status, battle_started_at, gather_at')
    .eq('guild_id', guildId)
    .eq('id', input.eventId)
    .maybeSingle()
  if (eventError) return { error: await publicActionError(eventError, 'actions/event-guest-profile') }
  if (!eventRow || eventRow.status !== 'published') return { error: t('eventNotFound') }
  if (
    eventRow.battle_started_at ||
    (eventRow.gather_at && Date.parse(eventRow.gather_at) <= Date.now())
  ) {
    return { error: t('recruitmentClosed') }
  }

  if (session) {
    const [{ data: activeGuest }, { data: revokedGuest }] = await Promise.all([
      db
        .from('guests')
        .select('discord_id')
        .eq('guild_id', guildId)
        .eq('discord_id', guestDiscordId)
        .maybeSingle(),
      db
        .from('guest_revocations')
        .select('discord_id')
        .eq('guild_id', guildId)
        .eq('discord_id', guestDiscordId)
        .maybeSingle(),
    ])
    if (!activeGuest || revokedGuest) return { error: t('unauthorized') }
  }

  const serverRaw = await getAppSetting('albion_server', '', guildId)
  if (!isAlbionServer(serverRaw)) return { error: t('albionServerUnavailable') }
  let exactCharacter: GameinfoPlayer | null = null
  try {
    exactCharacter = exactCharacterMatch(
      await searchPlayers(serverRaw, normalizedCharacter.value, 10),
      normalizedCharacter.value,
    )
  } catch {
    // Albion Gameinfo is supporting evidence only. A failed lookup must not
    // turn optional existence verification into an identity/login barrier.
  }
  const characterName = exactCharacter?.Name ?? normalizedCharacter.value
  const nextSession: SessionPayload = session
    ? {
        ...session,
        username: normalized.value,
        issuedAt: Date.now(),
      }
    : {
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
        capabilities: '',
        authenticatedAt: 0,
        issuedAt: Date.now(),
      }

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
        albion_server: serverRaw,
        albion_player_id: exactCharacter?.Id ?? null,
        albion_character_name: characterName,
        albion_guild_name: exactCharacter?.GuildName ?? null,
        character_verified: Boolean(exactCharacter),
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
  if (partyError) return { error: await publicActionError(partyError, 'actions/event-guest-profile') }
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
    if (assignedError) return { error: await publicActionError(assignedError, 'actions/event-guest-profile') }
    if (requestedError) return { error: await publicActionError(requestedError, 'actions/event-guest-profile') }
  }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, input.locale, localeCookieOptions(headerStore.get('host')))
  cookieStore.set(SESSION_COOKIE_NAME, await signSession(nextSession), cookieOptions())

  revalidatePath(`/events/${input.eventId}`)
  return { ok: true, characterVerified: Boolean(exactCharacter) }
}
