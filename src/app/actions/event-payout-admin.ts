'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sendLocalizedDiscordDmsToUsers } from '@/lib/discord-dm-localized'
import { formatSilver } from '@/lib/silver'
import { isEnded } from '@/lib/gather-time'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { syncDiscordAdminApprovalNotification } from '@/lib/discord-admin-approvals'
import { isPostgresPositiveInt } from '@/lib/postgres-int'

const MEMO_MAX = 500
const EVENT_PAYOUT_CAPS = [CAP.EVENT_MANAGE] as const

interface PayoutParticipant {
  discord_id: string
  username: string
}

export interface EventPayoutEligibleParticipant {
  discord_id: string
  username: string
}

export interface AdminEventPayoutRequest {
  id: string
  event_id: string
  event_title: string
  silver_per_member: number
  participant_count: number
  total_silver: number
  participants: PayoutParticipant[]
  memo: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  created_by: string
  created_by_username: string
  handled_by: string | null
  handled_by_username: string | null
  created_at: string
  resolved_at: string | null
}

interface CreateEventPayoutInput {
  eventId: string
  silverPerMember: number
  memo?: string
}

// 종료된 이벤트의 슬롯 배정자 목록을 반환. 한 사람이 여러 슬롯에 배정돼 있어도
// discord_id 기준 unique 한 명단이 나오도록 dedupe 한다 — 일괄 지급은 1인 1회.
export async function listEventPayoutEligibleParticipants(
  eventId: string,
): Promise<{ participants: EventPayoutEligibleParticipant[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(EVENT_PAYOUT_CAPS)
    const session = await getSession()
    if (!session) return { participants: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: parties, error } = await db
      .from('parties')
      .select('id, slots(assigned_discord_id, assigned_username)')
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    if (error) return { participants: [], error: await publicActionError(error, 'actions/event-payout-admin') }

    const seen = new Map<string, string>()
    for (const party of (parties ?? []) as {
      id: string
      slots: { assigned_discord_id: string | null; assigned_username: string | null }[] | null
    }[]) {
      for (const slot of party.slots ?? []) {
        if (!slot.assigned_discord_id) continue
        if (seen.has(slot.assigned_discord_id)) continue
        seen.set(slot.assigned_discord_id, slot.assigned_username ?? slot.assigned_discord_id)
      }
    }

    const participants = Array.from(seen.entries())
      .map(([discord_id, username]) => ({ discord_id, username }))
      .sort((a, b) => a.username.localeCompare(b.username))
    return { participants }
  } catch (e) {
    return { participants: [], error: await publicActionError(e, 'actions/event-payout-admin') }
  }
}

// 발의는 단순 INSERT 한 번. 명단/카운트/총액은 발의 시점에 모두 스냅샷한다 —
// 승인 시점까지 슬롯이 흔들려도 지급 대상은 동결된다.
export async function createEventPayoutRequest(
  input: CreateEventPayoutInput,
): Promise<{ error?: string; id?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!isPostgresPositiveInt(input.silverPerMember)) {
      return { error: tErr('invalidAmount') }
    }
    const memo = (input.memo ?? '').trim() || null
    if (memo && memo.length > MEMO_MAX) {
      return { error: tErr('memoTooLong', { max: MEMO_MAX }) }
    }

    const db = await requireAnyCapability(EVENT_PAYOUT_CAPS)
    const session = await getSession()
    const tAdminNotify = await getTranslations('adminNotificationMessages')
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: event, error: eventError } = await db
      .from('events')
      .select('id, title, battle_started_at')
      .eq('guild_id', guildId)
      .eq('id', input.eventId)
      .maybeSingle()
    if (eventError) return { error: await publicActionError(eventError, 'actions/event-payout-admin') }
    if (!event) return { error: tErr('eventNotFound') }
    if (!event.battle_started_at || !isEnded(event.battle_started_at)) {
      return { error: tErr('eventPayoutEventNotEnded') }
    }

    const { participants, error: participantsError } =
      await listEventPayoutEligibleParticipants(input.eventId)
    if (participantsError) return { error: participantsError }
    if (participants.length === 0) {
      return { error: tErr('eventPayoutNoParticipants') }
    }

    const totalSilver = participants.length * input.silverPerMember

    const { data: inserted, error: insertError } = await db
      .from('event_payout_requests')
      .insert({
        guild_id: guildId,
        event_id: input.eventId,
        silver_per_member: input.silverPerMember,
        participant_count: participants.length,
        total_silver: totalSilver,
        participants,
        memo,
        created_by: session.discordId,
        created_by_username: session.username,
      })
      .select('id')
      .single()
    if (insertError) return { error: await publicActionError(insertError, 'actions/event-payout-admin') }

    revalidatePath('/admin/dashboard/approvals')
    revalidatePath(`/admin/dashboard/events/${input.eventId}`)
    revalidatePath('/', 'layout')
    void sendAdminNotification({
      guildId,
      topic: 'event_payout',
      sourceTable: 'event_payout_requests',
      sourceId: inserted.id as string,
      title: tAdminNotify('eventPayoutTitle'),
      body: tAdminNotify('eventPayoutBody', {
        event: event.title,
        count: participants.length.toLocaleString('en-US'),
        silver: totalSilver.toLocaleString('en-US'),
      }),
      url: '/admin/dashboard/approvals?tab=event_payout',
    })
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.payout.create',
      targetId: inserted.id as string,
      targetKind: 'event',
      details: {
        eventId: input.eventId,
        eventTitle: event.title,
        silverPerMember: input.silverPerMember,
        participantCount: participants.length,
        totalSilver,
      },
    })
    return { id: inserted.id as string }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/event-payout-admin') }
  }
}

export async function listEventPayoutRequests(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ requests: AdminEventPayoutRequest[]; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { requests: [], error: tErr('unauthorized') }
    const db = await requireAnyCapability(EVENT_PAYOUT_CAPS)
    const guildId = await getSessionGuildId(session)
    let query = db
      .from('event_payout_requests')
      .select(
        'id, event_id, silver_per_member, participant_count, total_silver, participants, memo, status, admin_notes, created_by, created_by_username, handled_by, handled_by_username, created_at, resolved_at, events(title)',
      )
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (scope === 'pending') query = query.eq('status', 'pending')
    const { data, error } = await query
    if (error) return { requests: [], error: await publicActionError(error, 'actions/event-payout-admin') }

    const tFallback = await getTranslations('adminActionError')
    const requests: AdminEventPayoutRequest[] = (data ?? []).map((row) => {
      const event = row.events as { title?: string } | { title?: string }[] | null
      const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
      return {
        id: row.id,
        event_id: row.event_id,
        event_title: liveTitle || tFallback('deletedEvent'),
        silver_per_member: row.silver_per_member,
        participant_count: row.participant_count,
        total_silver: Number(row.total_silver),
        participants: (row.participants ?? []) as PayoutParticipant[],
        memo: row.memo,
        status: row.status as AdminEventPayoutRequest['status'],
        admin_notes: row.admin_notes,
        created_by: row.created_by,
        created_by_username: row.created_by_username,
        handled_by: row.handled_by ?? null,
        handled_by_username: row.handled_by_username ?? null,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      }
    })
    return { requests }
  } catch (e) {
    return { requests: [], error: await publicActionError(e, 'actions/event-payout-admin') }
  }
}

export async function approveEventPayoutRequest(
  id: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(EVENT_PAYOUT_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('approve_event_payout_request', {
      p_id: id,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('EVENT_PAYOUT_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: await publicActionError(error, 'actions/event-payout-admin') }
    }
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/me')
    revalidatePath('/', 'layout')

    // DM all participants — non-blocking. 신청자가 많을 수 있으니 fire-and-forget.
    const { data: row } = await db
      .from('event_payout_requests')
      .select('silver_per_member, participants, events(title)')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    const participants = (row?.participants ?? []) as PayoutParticipant[]
    const event = row?.events as { title?: string } | { title?: string }[] | null
    const liveTitle = Array.isArray(event) ? event[0]?.title ?? '' : event?.title ?? ''
    const eventTitle = liveTitle || tErr('deletedEvent')
    const silver = row?.silver_per_member ?? 0
    const discordIds = participants
      .map((member) => member.discord_id)
      .filter((discordId): discordId is string => Boolean(discordId))
    void sendLocalizedDiscordDmsToUsers(discordIds, guildId, (tDm) => ({
      title: tDm('eventPayoutApprovedTitle'),
      body: tDm('eventPayoutApprovedBody', {
        event: eventTitle,
        silver: formatSilver(silver),
      }),
      url: '/me',
    }))
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.payout.approve',
      targetId: id,
      targetKind: 'event',
      details: { silverPerMember: silver, participantCount: participants.length, eventTitle },
    })
    await syncDiscordAdminApprovalNotification({
      actor: { guildId, discordId: session.discordId, username: session.username },
      kind: 'event_payout',
      sourceId: id,
      resolution: 'approved',
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/event-payout-admin') }
  }
}

export async function rejectEventPayoutRequest(
  id: string,
  notes: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(EVENT_PAYOUT_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('reject_event_payout_request', {
      p_id: id,
      p_notes: notes.trim() || null,
      p_admin_id: session.discordId,
      p_admin_username: session.username,
      p_guild_id: guildId,
    })
    if (error) {
      if (error.message.includes('EVENT_PAYOUT_NOT_PENDING')) {
        return { error: tErr('alreadyHandled') }
      }
      return { error: await publicActionError(error, 'actions/event-payout-admin') }
    }
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.payout.reject',
      targetId: id,
      targetKind: 'event',
      details: { notes: notes.trim() || null },
    })
    await syncDiscordAdminApprovalNotification({
      actor: { guildId, discordId: session.discordId, username: session.username },
      kind: 'event_payout',
      sourceId: id,
      resolution: 'rejected',
    })
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/event-payout-admin') }
  }
}
