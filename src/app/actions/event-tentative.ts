'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { requireCurrentMutationSession, requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { getAlbionEventAccessGateState } from '@/lib/albion-identity'
import {
  listTentativeSignupsForGuild,
  sanitizeTentativeRoles,
  type TentativeSignupRow,
} from '@/lib/event-tentative-signups'
export type { TentativeSignupRow } from '@/lib/event-tentative-signups'

async function ensureEventBelongsToGuild(
  eventId: string,
  guildId: string,
): Promise<
  | {
      ok: true
      event: {
        id: string
        created_by: string | null
      }
    }
  | { ok: false; error: string }
> {
  const tAction = await getTranslations('eventTentativeAction')
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select(
      'id, created_by, status, battle_started_at, tentative_snapshot_version_id',
    )
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (error) return { ok: false, error: await publicActionError(error, 'actions/event-tentative') }
  if (!data) return { ok: false, error: tAction('eventNotFound') }
  if (
    data.status !== 'published' ||
    data.battle_started_at ||
    data.tentative_snapshot_version_id
  ) {
    return { ok: false, error: tAction('recruitmentClosed') }
  }
  return {
    ok: true,
    event: {
      id: data.id,
      created_by: data.created_by ?? null,
    },
  }
}

// 멤버 본인이 자기 참가예정을 등록·갱신. 같은 (event_id, discord_id) 조합은
// 단일 행이라 upsert 로 처리. 가능 역할군은 SLOT_ROLES 화이트리스트로 검증.
export async function submitMyTentativeSignup(
  eventId: string,
  rawRoles: unknown,
  notes?: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('eventTentativeAction')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }
  // 게스트는 참가예정 등록 불가 — 본인 식별이 단편적이라 잘못된 데이터가 쌓이기 쉬움.
  if (session.isGuest) return { error: tAction('guestNotAllowed') }
  const guildId = await getSessionGuildId(session)
  const albionEventGate = await getAlbionEventAccessGateState({
    discordId: session.discordId,
    guildId,
    isMember: session.isMember === true,
    isAdmin: session.isAdmin === true,
  })
  if (albionEventGate.memberOnboardingRequired || albionEventGate.memberEventVerificationRequired) {
    return { error: tAction('albionVerificationRequired') }
  }
  const canSignUpAsAlliance =
    !session.isMember &&
    albionEventGate.allianceEventAllowed
  if (!session.isMember && !canSignUpAsAlliance) return { error: tAction('memberOnly') }

  const guard = await ensureEventBelongsToGuild(eventId, guildId)
  if (!guard.ok) return { error: guard.error }

  const roles = sanitizeTentativeRoles(rawRoles)
  if (roles.length === 0) return { error: tAction('rolesRequired') }

  const trimmedNotes = (notes ?? '').trim().slice(0, 500) || null

  const db = getAdminClient()
  const { error } = await db
    .from('event_tentative_signups')
    .upsert(
      {
        guild_id: guildId,
        event_id: eventId,
        discord_id: session.discordId,
        username: session.username,
        possible_roles: roles,
        notes: trimmedNotes,
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )
  if (error) return { error: await publicActionError(error, 'actions/event-tentative') }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  return {}
}

// 멤버가 자기 행을 취소하거나, 어드민/이벤트 작성자가 다른 멤버 행을 정리할 때.
export async function removeTentativeSignup(
  eventId: string,
  discordId: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('eventTentativeAction')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }
  const isSelf = session.discordId === discordId
  const guildId = await getSessionGuildId(session)

  const guard = await ensureEventBelongsToGuild(eventId, guildId)
  if (!guard.ok) return { error: guard.error }
  const event = guard.event

  const isEventOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!event.created_by &&
    event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  if (!isSelf && !session.isAdmin && !isEventManager && !isEventOwner) {
    return { error: tAction('notAuthorized') }
  }

  const db = getAdminClient()
  const { error } = await db
    .from('event_tentative_signups')
    .delete()
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('discord_id', discordId)
  if (error) return { error: await publicActionError(error, 'actions/event-tentative') }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  return {}
}

// 어드민/이벤트 작성자가 다른 멤버를 대신 등록 (멤버가 디스코드로만 의향 전달한
// 경우 등). discord_id + username 을 명시적으로 받는다.
export async function adminUpsertTentativeSignup(
  eventId: string,
  discordId: string,
  username: string,
  rawRoles: unknown,
  notes?: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('eventTentativeAction')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const guard = await ensureEventBelongsToGuild(eventId, guildId)
  if (!guard.ok) return { error: guard.error }
  const event = guard.event

  const isEventOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!event.created_by &&
    event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  if (!session.isAdmin && !isEventManager && !isEventOwner) {
    return { error: tAction('notAuthorized') }
  }

  const trimmedDiscordId = discordId.trim()
  const trimmedUsername = username.trim()
  if (!trimmedDiscordId || !trimmedUsername) {
    return { error: tAction('memberRequired') }
  }

  const roles = sanitizeTentativeRoles(rawRoles)
  if (roles.length === 0) return { error: tAction('rolesRequired') }

  const trimmedNotes = (notes ?? '').trim().slice(0, 500) || null

  const db = getAdminClient()
  const { error } = await db
    .from('event_tentative_signups')
    .upsert(
      {
        guild_id: guildId,
        event_id: eventId,
        discord_id: trimmedDiscordId,
        username: trimmedUsername,
        possible_roles: roles,
        notes: trimmedNotes,
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )
  if (error) return { error: await publicActionError(error, 'actions/event-tentative') }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  return {}
}

// RSC 에서 호출하는 read-only 헬퍼. 슬롯에 이미 배정된 멤버는 트리거가 자동으로
// 행을 지우므로 여기서 추가 필터는 불필요. created_at asc — 먼저 등록한 사람이
// 위에 보이게 (전체 신청 현황과 동일한 정렬 감각).
export async function listTentativeSignups(
  eventId: string,
): Promise<{ rows: TentativeSignupRow[]; error?: string }> {
  const session = await getSession()
  if (!session) return { rows: [], error: 'unauthorized' }
  const guildId = await getSessionGuildId(session)

  return listTentativeSignupsForGuild(eventId, guildId)
}
