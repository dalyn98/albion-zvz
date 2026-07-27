'use server'


import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { logAdminAction } from '@/lib/admin-audit'
import { requireCapability } from '@/lib/auth'
import { publicActionError } from '@/lib/public-action-error'
import { isDiscordId } from '@/lib/discord-id'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { isLocalAccountSubject } from '@/lib/local-guild-account'
import {
  normalizeMemberAbsence,
  normalizeMemberTrial,
  type EventMemberAbsenceConflict,
  type MemberTrialStatus,
} from '@/lib/member-operations'
import { listMemberAbsencesForDate } from '@/lib/member-operations-server'
import { CAP } from '@/lib/permissions'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { tenantDateKey } from '@/lib/timezone'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getAdminClient } from '@/lib/supabase-admin'

interface ActionResult {
  error?: string
}

interface SaveMemberTrialInput {
  discordId: string
  status: MemberTrialStatus
  startedOn: string
  reviewDueOn: string
  notes: string
}

interface CreateMemberAbsenceInput {
  startsOn: string
  endsOn: string
  reason: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function isMemberSubject(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 128 &&
    (isDiscordId(value) || isLocalAccountSubject(value))
  )
}

function absenceRpcError(message: string, t: Awaited<ReturnType<typeof getTranslations>>): string {
  if (message.includes('ABSENCE_LIMIT')) return t('absenceLimit')
  if (message.includes('ABSENCE_OVERLAP')) return t('absenceOverlap')
  if (message.includes('ABSENCE_RANGE')) return t('error.pastRange')
  if (message.includes('MEMBER_NOT_FOUND')) return t('memberNotFound')
  return t('serverError')
}

function revalidateMemberOperations(discordId: string): void {
  revalidatePath('/members')
  revalidatePath(`/members/${discordId}`)
  revalidatePath('/me/settings')
  revalidatePath('/events')
  revalidatePath('/admin/dashboard/events')
}

export async function saveMemberTrial(
  input: SaveMemberTrialInput,
): Promise<ActionResult> {
  const t = await getTranslations('memberOperations')
  try {
    const session = await getSession()
    if (!session) return { error: t('unauthorized') }
    const db = await requireCapability(CAP.MEMBERS_MANAGE)
    const guildId = await getSessionGuildId(session)
    if (!isMemberSubject(input.discordId)) return { error: t('memberNotFound') }
    const normalized = normalizeMemberTrial(input)
    if (!normalized.ok) return { error: t(`error.${normalized.code}`) }

    const value = normalized.value
    const { error } = await db.rpc('save_member_trial', {
      p_guild_id: guildId,
      p_discord_id: input.discordId,
      p_status: value.status,
      p_started_on: value.startedOn,
      p_review_due_on: value.reviewDueOn,
      p_notes: value.notes,
      p_actor: session.discordId,
    })
    if (error) {
      if (error.message.includes('MEMBER_NOT_FOUND')) {
        return { error: t('memberNotFound') }
      }
      return { error: await publicActionError(error, 'actions/member-operations') }
    }

    revalidateMemberOperations(input.discordId)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'member.trial.update',
      targetKind: 'member',
      targetDiscordId: input.discordId,
      details: {
        status: value.status,
        startedOn: value.startedOn,
        reviewDueOn: value.reviewDueOn,
      },
    })
    return {}
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return { error: t('unauthorized') }
    }
    return { error: await publicActionError(error, 'actions/member-operations') }
  }
}

export async function reviewEventMemberAbsences(
  eventId: string,
): Promise<{ conflicts: EventMemberAbsenceConflict[]; error?: string }> {
  const t = await getTranslations('memberOperations')
  try {
    if (!isUuid(eventId)) return { conflicts: [], error: t('serverError') }
    const session = await getSession()
    if (!session) return { conflicts: [], error: t('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { data: event, error: eventError } = await db
      .from('events')
      .select('created_by, gather_at')
      .eq('guild_id', guildId)
      .eq('id', eventId)
      .maybeSingle()
    if (eventError) return { conflicts: [], error: t('serverError') }
    if (!event) return { conflicts: [], error: t('memberNotFound') }

    const canManageEvent =
      session.isAdmin ||
      sessionHas(session, CAP.EVENT_MANAGE) ||
      (sessionCanCreateOrManageEvents(session) && event.created_by === session.discordId)
    if (!canManageEvent) return { conflicts: [], error: t('unauthorized') }
    if (!event.gather_at) return { conflicts: [] }

    const { data: slots, error: slotsError } = await db
      .from('slots')
      .select('assigned_discord_id, assigned_username, parties!inner(event_id)')
      .eq('guild_id', guildId)
      .eq('parties.event_id', eventId)
      .not('assigned_discord_id', 'is', null)
    if (slotsError) return { conflicts: [], error: t('serverError') }

    const names = new Map<string, string>()
    for (const slot of slots ?? []) {
      if (!slot.assigned_discord_id) continue
      names.set(
        slot.assigned_discord_id,
        slot.assigned_username?.trim() || slot.assigned_discord_id,
      )
    }
    const timezone = await getTenantTimezone(guildId)
    const dateIso = tenantDateKey(event.gather_at, timezone)
    const absences = await listMemberAbsencesForDate(
      guildId,
      [...names.keys()],
      dateIso,
    )
    return {
      conflicts: absences.map((absence) => ({
        id: absence.id,
        discordId: absence.discordId,
        displayName: names.get(absence.discordId) ?? absence.discordId,
        startsOn: absence.startsOn,
        endsOn: absence.endsOn,
        reason: absence.reason,
      })),
    }
  } catch {
    return { conflicts: [], error: t('serverError') }
  }
}

export async function createMyMemberAbsence(
  input: CreateMemberAbsenceInput,
): Promise<ActionResult> {
  const t = await getTranslations('memberOperations')
  try {
    const session = await getSession()
    if (!session || (!session.isMember && !session.isAdmin)) {
      return { error: t('unauthorized') }
    }
    const guildId = await getSessionGuildId(session)
    const timezone = await getTenantTimezone(guildId)
    const todayIso = tenantDateKey(new Date(), timezone)
    const normalized = normalizeMemberAbsence(input, todayIso)
    if (!normalized.ok) return { error: t(`error.${normalized.code}`) }
    const db = getAdminClient()
    const value = normalized.value
    const { error } = await db.rpc('create_member_absence', {
      p_guild_id: guildId,
      p_discord_id: session.discordId,
      p_starts_on: value.startsOn,
      p_ends_on: value.endsOn,
      p_reason: value.reason,
      p_today: todayIso,
    })
    if (error) return { error: absenceRpcError(error.message, t) }
    revalidateMemberOperations(session.discordId)
    return {}
  } catch {
    return { error: t('serverError') }
  }
}

export async function deleteMyMemberAbsence(absenceId: string): Promise<ActionResult> {
  const t = await getTranslations('memberOperations')
  try {
    const session = await getSession()
    if (!session || (!session.isMember && !session.isAdmin)) {
      return { error: t('unauthorized') }
    }
    if (!isUuid(absenceId)) return { error: t('serverError') }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { error } = await db
      .from('member_absences')
      .delete()
      .eq('guild_id', guildId)
      .eq('discord_id', session.discordId)
      .eq('id', absenceId)
    if (error) return { error: t('serverError') }
    revalidateMemberOperations(session.discordId)
    return {}
  } catch {
    return { error: t('serverError') }
  }
}
