'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'
import {
  sanitizeEventRegearParticipantRole,
  type EventRegearParticipantRow,
} from '@/lib/event-regear-participants'
import { addLateEventRegearParticipant } from '@/lib/regear-effective-policy-server'

export type { EventRegearParticipantRow } from '@/lib/event-regear-participants'

async function authorizeEventRegearParticipantManage(eventId: string): Promise<
  | {
      ok: true
      db: ReturnType<typeof getAdminClient>
      guildId: string
      session: NonNullable<Awaited<ReturnType<typeof requireLiveSession>>>
      event: {
        category: EventCategory
        battleStartedAt: string | null
        policyVersionId: string | null
      }
    }
  | { ok: false; error: string }
> {
  const tAction = await getTranslations('eventRegearParticipantsAction')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { ok: false, error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data: event, error } = await db
    .from('events')
    .select('id, category, created_by, battle_started_at, regear_policy_version_id')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()

  if (error) return { ok: false, error: await publicActionError(error, 'actions/event-regear-participants') }
  if (!event) return { ok: false, error: tAction('eventNotFound') }

  const category: EventCategory = EVENT_CATEGORIES.includes(event.category as EventCategory)
    ? (event.category as EventCategory)
    : '전투'
  if (category === '전투' && !event.regear_policy_version_id) {
    return { ok: false, error: tAction('combatNotAllowed') }
  }

  const isEventOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!event.created_by &&
    event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  if (!session.isAdmin && !isEventManager && !isEventOwner) {
    return { ok: false, error: tAction('notAuthorized') }
  }

  return {
    ok: true,
    db,
    guildId,
    session,
    event: {
      category,
      battleStartedAt: event.battle_started_at ?? null,
      policyVersionId: event.regear_policy_version_id ?? null,
    },
  }
}

function revalidateEventRegearParticipantSurfaces(eventId: string, discordId?: string): void {
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath('/regear')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  if (discordId) revalidatePath(`/members/${discordId}`)
}

export async function upsertEventRegearParticipant(
  eventId: string,
  discordId: string,
  roleName: unknown,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('eventRegearParticipantsAction')
  const auth = await authorizeEventRegearParticipantManage(eventId)
  if (!auth.ok) return { error: auth.error }
  const { db, guildId, session } = auth

  const trimmedDiscordId = discordId.trim()
  if (!trimmedDiscordId) return { error: tAction('memberRequired') }

  const role = sanitizeEventRegearParticipantRole(roleName)
  if (!role) return { error: tAction('roleRequired') }

  const { data: member, error: memberError } = await db
    .from('guild_avatars')
    .select('discord_id, username, withdrawn_at')
    .eq('guild_id', guildId)
    .eq('discord_id', trimmedDiscordId)
    .maybeSingle()
  if (memberError) return { error: await publicActionError(memberError, 'actions/event-regear-participants') }
  if (!member) return { error: tAction('memberNotFound') }
  if (member.withdrawn_at) return { error: tAction('memberWithdrawn') }

  if (auth.event.policyVersionId) {
    if (!auth.event.battleStartedAt) return { error: tAction('policyLocked') }
    const { data: existing, error: existingError } = await db
      .from('event_regear_participants')
      .select('id')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .eq('discord_id', member.discord_id)
      .maybeSingle()
    if (existingError) {
      return {
        error: await publicActionError(existingError, 'actions/event-regear-participants'),
      }
    }
    if (existing) return { error: tAction('policyLocked') }
    try {
      await addLateEventRegearParticipant({
        db,
        guildId,
        eventId,
        discordId: member.discord_id,
        username: member.username,
        roleName: role,
        addedBy: session.discordId,
        addedByUsername: session.username,
      })
    } catch (error) {
      return {
        error: await publicActionError(error, 'actions/event-regear-participants'),
      }
    }
    revalidateEventRegearParticipantSurfaces(eventId, member.discord_id)
    return {}
  }

  const { error } = await db
    .from('event_regear_participants')
    .upsert(
      {
        guild_id: guildId,
        event_id: eventId,
        discord_id: member.discord_id,
        username: member.username,
        role_name: role,
        added_by: session.discordId,
        added_by_username: session.username,
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )

  if (error) return { error: await publicActionError(error, 'actions/event-regear-participants') }

  revalidateEventRegearParticipantSurfaces(eventId, member.discord_id)
  return {}
}

export async function removeEventRegearParticipant(
  eventId: string,
  discordId: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('eventRegearParticipantsAction')
  const auth = await authorizeEventRegearParticipantManage(eventId)
  if (!auth.ok) return { error: auth.error }
  if (auth.event.policyVersionId) return { error: tAction('policyLocked') }
  const trimmedDiscordId = discordId.trim()
  if (!trimmedDiscordId) return { error: tAction('memberRequired') }

  const { error } = await auth.db
    .from('event_regear_participants')
    .delete()
    .eq('guild_id', auth.guildId)
    .eq('event_id', eventId)
    .eq('discord_id', trimmedDiscordId)

  if (error) return { error: await publicActionError(error, 'actions/event-regear-participants') }

  revalidateEventRegearParticipantSurfaces(eventId, trimmedDiscordId)
  return {}
}

export async function listEventRegearParticipants(
  eventId: string,
): Promise<{ rows: EventRegearParticipantRow[]; error?: string }> {
  const tAction = await getTranslations('eventRegearParticipantsAction')
  const session = await getSession()
  if (!session) return { rows: [], error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data, error } = await db
    .from('event_regear_participants')
    .select('id, event_id, discord_id, username, role_name, added_by, added_by_username, created_at, updated_at')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) return { rows: [], error: await publicActionError(error, 'actions/event-regear-participants') }

  const rows: EventRegearParticipantRow[] = (data ?? [])
    .map((row) => {
      const role = sanitizeEventRegearParticipantRole(row.role_name)
      if (!role) return null
      return {
        id: row.id,
        event_id: row.event_id,
        discord_id: row.discord_id,
        username: row.username,
        role_name: role,
        added_by: row.added_by ?? null,
        added_by_username: row.added_by_username ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }
    })
    .filter((row): row is EventRegearParticipantRow => row !== null)

  return { rows }
}
