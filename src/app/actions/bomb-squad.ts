'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { sessionHas } from '@/lib/session'
import { requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import type { AssignableMember } from '@/lib/member-assign-search'

// Approve / reject sign-ups on a bomb squad party. Authorization passes if the
// caller is an admin, delegated event manager, event owner, or the party's
// caller_discord_id (the designated bomb squad sub-caller).
//
// The RPC trusts its caller — all authorization happens in this action layer,
// mirroring the regear-admin pattern.
async function authorizeBombSquadAction(slotId: string): Promise<
  | {
      ok: true
      db: ReturnType<typeof getAdminClient>
      eventId: string
      guildId: string
      partyNumber: number | null
      requestedDiscordId: string | null
    }
  | { ok: false; error: string }
> {
  const tAction = await getTranslations('slotAction')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { ok: false, error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(
      'id, requested_discord_id, is_solo_bomb, parties!inner(is_bomb_squad, caller_discord_id, party_number, events!inner(id, created_by, battle_started_at))',
    )
    .eq('guild_id', guildId)
    .eq('id', slotId)
    .maybeSingle()
  if (error) return { ok: false, error: await publicActionError(error, 'actions/bomb-squad') }
  if (!data) return { ok: false, error: tAction('slotNotFound') }

  const party = Array.isArray(data.parties) ? data.parties[0] : data.parties
  const event = party
    ? Array.isArray(party.events)
      ? party.events[0]
      : party.events
    : null
  if (!party?.is_bomb_squad) return { ok: false, error: tAction('notBombSquad') }
  if (!event) return { ok: false, error: tAction('slotNotFound') }
  if (event.battle_started_at) {
    return { ok: false, error: tAction('battleAlreadyStarted') }
  }

  // 솔로밤 슬롯은 콜러를 제외한다. "콜러 없이 운영" 가능한 역할이므로 승인
  // 권한은 관리자/이벤트 관리자/작성자에 한정한다.
  const isEventOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!event.created_by &&
    event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  const isSoloBomb = !!data.is_solo_bomb
  const isCaller = !isSoloBomb && !!party.caller_discord_id && party.caller_discord_id === session.discordId
  if (!session.isAdmin && !isEventManager && !isEventOwner && !isCaller) {
    return { ok: false, error: tAction('bombSquadNotAuthorized') }
  }
  return {
    ok: true,
    db,
    eventId: event.id,
    guildId,
    partyNumber: (party.party_number as number | null | undefined) ?? null,
    requestedDiscordId: (data.requested_discord_id as string | null) ?? null,
  }
}

async function authorizeDirectAssignAction(slotId: string): Promise<
  | {
      ok: true
      db: ReturnType<typeof getAdminClient>
      eventId: string
      guildId: string
      partyNumber: number | null
    }
  | { ok: false; error: string }
> {
  const tAction = await getTranslations('slotAction')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { ok: false, error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(
      'id, is_solo_bomb, parties!inner(is_bomb_squad, caller_discord_id, party_number, events!inner(id, created_by, battle_started_at))',
    )
    .eq('guild_id', guildId)
    .eq('id', slotId)
    .maybeSingle()
  if (error) return { ok: false, error: await publicActionError(error, 'actions/bomb-squad') }
  if (!data) return { ok: false, error: tAction('slotNotFound') }

  const party = Array.isArray(data.parties) ? data.parties[0] : data.parties
  const event = party
    ? Array.isArray(party.events)
      ? party.events[0]
      : party.events
    : null
  if (!event) return { ok: false, error: tAction('slotNotFound') }
  if (event.battle_started_at) {
    return { ok: false, error: tAction('battleAlreadyStarted') }
  }

  const isEventOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!event.created_by &&
    event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  const isCaller =
    !data.is_solo_bomb &&
    !!party?.is_bomb_squad &&
    !!party.caller_discord_id &&
    party.caller_discord_id === session.discordId
  if (!session.isAdmin && !isEventManager && !isEventOwner && !isCaller) {
    return { ok: false, error: tAction('slotAssignNotAuthorized') }
  }
  return {
    ok: true,
    db,
    eventId: event.id,
    guildId,
    partyNumber: (party?.party_number as number | null | undefined) ?? null,
  }
}

function revalidateSlotAssignmentSurfaces(
  eventId: string,
  partyNumber: number | null,
  discordId: string | null,
): void {
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  if (partyNumber) revalidatePath(`/events/${eventId}/party/${partyNumber}`)
  revalidatePath('/')
  revalidatePath('/me')
  revalidatePath('/members')
  revalidatePath('/admin/dashboard/stats')
  if (discordId) revalidatePath(`/members/${discordId}`)
}

export async function approveSlotRequest(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const auth = await authorizeBombSquadAction(slotId)
  if (!auth.ok) return { error: auth.error }
  const { db, eventId, partyNumber, requestedDiscordId } = auth

  const { error } = await db.rpc('approve_slot_request', { p_slot_id: slotId })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('NO_PENDING_REQUEST')) return { error: tAction('noPendingRequest') }
    if (message.includes('SLOT_TAKEN')) return { error: tAction('slotTaken') }
    return { error: message || tAction('serverError') }
  }

  revalidateSlotAssignmentSurfaces(eventId, partyNumber, requestedDiscordId)
  return {}
}

export async function rejectSlotRequest(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const auth = await authorizeBombSquadAction(slotId)
  if (!auth.ok) return { error: auth.error }
  const { db, eventId, partyNumber, requestedDiscordId } = auth

  const { error } = await db.rpc('reject_slot_request', { p_slot_id: slotId })
  if (error) return { error: await publicActionError(error, 'actions/bomb-squad') || tAction('serverError') }

  revalidateSlotAssignmentSurfaces(eventId, partyNumber, requestedDiscordId)
  return {}
}

// Caller 가 본인 파티의 빈 슬롯에 멤버를 직접 "지정" 한다. 신청 → 승인 플로우를
// 우회하므로 권한은 관리자 / 위임 이벤트 관리자 / 이벤트 소유자 / 파티 콜러로
// 제한한다. RPC 가 is_bomb_squad + 빈 슬롯 + cross-party 중복 체크까지 한다.
export async function directAssignMember(
  slotId: string,
  memberDiscordId: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const auth = await authorizeDirectAssignAction(slotId)
  if (!auth.ok) return { error: auth.error }
  const { db, eventId, guildId, partyNumber } = auth

  // guild_avatars 는 service-role 로만 읽을 수 있어 auth 에서 받은 admin db 를
  // 그대로 재사용한다. withdrawn 된 멤버는 명단에 뜨지도 않지만 방어적으로 체크.
  const { data: member, error: memberError } = await db
    .from('guild_avatars')
    .select('username, withdrawn_at')
    .eq('guild_id', guildId)
    .eq('discord_id', memberDiscordId)
    .maybeSingle()
  if (memberError) return { error: await publicActionError(memberError, 'actions/bomb-squad') }
  if (!member) return { error: tAction('memberNotFound') }
  if (member.withdrawn_at) return { error: tAction('memberWithdrawn') }

  const { error } = await db.rpc('direct_assign_slot', {
    p_slot_id: slotId,
    p_discord_id: memberDiscordId,
    p_username: member.username,
  })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('SLOT_NOT_FOUND')) return { error: tAction('slotNotFound') }
    if (message.includes('SOLO_BOMB_REQUIRES_REQUEST')) return { error: tAction('soloBombRequiresRequest') }
    if (message.includes('SLOT_TAKEN')) return { error: tAction('slotTaken') }
    if (message.includes('SLOT_PENDING')) return { error: tAction('slotPending') }
    if (message.includes('ALREADY_IN_EVENT')) return { error: tAction('alreadyInEvent') }
    return { error: message || tAction('serverError') }
  }

  revalidateSlotAssignmentSurfaces(eventId, partyNumber, memberDiscordId)
  return {}
}

// 콜러 지정 모달이 쓰는 멤버 목록. 현재 이벤트에 이미 속한 멤버에는
// `alreadyInEvent=true` 플래그를 붙여 모달에서 비활성화 표시한다.
// 권한: 관리자 / 위임 이벤트 관리자 / 이벤트 소유자 / 이 이벤트 내 "어떤 파티" 콜러.
export async function listAssignableMembers(
  eventId: string,
): Promise<{
  members?: AssignableMember[]
  error?: string
}> {
  const tAction = await getTranslations('slotAction')
  const session = await requireLiveSession().catch(() => null)
  if (!session) return { error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: eventRow, error: eventError } = await db
    .from('events')
    .select('id, created_by, parties(caller_discord_id)')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return { error: await publicActionError(eventError, 'actions/bomb-squad') }
  if (!eventRow) return { error: tAction('eventNotFound') }
  const isOwner =
    sessionCanCreateOrManageEvents(session) &&
    !!eventRow.created_by &&
    eventRow.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  const parties = (eventRow.parties ?? []) as { caller_discord_id: string | null }[]
  const isAnyCaller = parties.some((p) => p.caller_discord_id === session.discordId)
  if (!session.isAdmin && !isEventManager && !isOwner && !isAnyCaller) {
    return { error: tAction('slotAssignNotAuthorized') }
  }

  const { data: members, error: membersError } = await db
    .from('guild_avatars')
    .select('discord_id, username, albion_nickname, avatar, withdrawn_at')
    .eq('guild_id', guildId)
    .is('withdrawn_at', null)
    .order('username', { ascending: true })
  if (membersError) return { error: await publicActionError(membersError, 'actions/bomb-squad') }

  // 같은 이벤트에서 이미 slot 을 점유(assigned) 하거나 pending(requested) 상태인
  // discord_id 를 모아 차단 집합을 만든다. inner join 으로 이 이벤트 것만 로드.
  const { data: assignments, error: assignError } = await db
    .from('slots')
    .select('assigned_discord_id, requested_discord_id, parties!inner(event_id)')
    .eq('guild_id', guildId)
    .eq('parties.event_id', eventId)
  if (assignError) return { error: await publicActionError(assignError, 'actions/bomb-squad') }

  const blocked = new Set<string>()
  for (const row of assignments ?? []) {
    if (row.assigned_discord_id) blocked.add(row.assigned_discord_id as string)
    if (row.requested_discord_id) blocked.add(row.requested_discord_id as string)
  }

  return {
    members: (members ?? [])
      .map((m) => ({
        discordId: m.discord_id as string,
        username: m.username as string,
        albionNickname: (m.albion_nickname as string | null) ?? null,
        avatar: (m.avatar as string | null) ?? null,
        alreadyInEvent: blocked.has(m.discord_id as string),
      })),
  }
}
