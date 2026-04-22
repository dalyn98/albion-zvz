'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'

// Approve / reject sign-ups on a bomb squad party. Authorization passes if the
// caller is either:
//   - a verified event creator (admins + event owner), OR
//   - the party's caller_discord_id (the designated bomb squad sub-caller).
//
// The RPC trusts its caller — all authorization happens in this action layer,
// mirroring the regear-admin pattern.
async function authorizeBombSquadAction(slotId: string): Promise<
  | { ok: true; db: ReturnType<typeof getAdminClient>; eventId: string }
  | { ok: false; error: string }
> {
  const tAction = await getTranslations('slotAction')
  const session = await getSession()
  if (!session) return { ok: false, error: tAction('loginRequired') }

  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(
      'id, requested_discord_id, parties!inner(is_bomb_squad, caller_discord_id, events!inner(id, created_by, battle_started_at))',
    )
    .eq('id', slotId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: tAction('slotNotFound') }

  const party = Array.isArray(data.parties) ? data.parties[0] : data.parties
  const event = party
    ? Array.isArray(party.events)
      ? party.events[0]
      : party.events
    : null
  if (!party?.is_bomb_squad) return { ok: false, error: tAction('notBombSquad') }
  if (!event) return { ok: false, error: tAction('slotNotFound') }
  if (event.battle_started_at) return { ok: false, error: tAction('battleAlreadyStarted') }

  const isEventOwner = !!event.created_by && event.created_by === session.discordId
  const isCaller = !!party.caller_discord_id && party.caller_discord_id === session.discordId
  if (!session.isAdmin && !isEventOwner && !isCaller) {
    return { ok: false, error: tAction('bombSquadNotAuthorized') }
  }
  return { ok: true, db, eventId: event.id }
}

export async function approveSlotRequest(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const auth = await authorizeBombSquadAction(slotId)
  if (!auth.ok) return { error: auth.error }
  const { db, eventId } = auth

  const { error } = await db.rpc('approve_slot_request', { p_slot_id: slotId })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('NO_PENDING_REQUEST')) return { error: tAction('noPendingRequest') }
    if (message.includes('SLOT_TAKEN')) return { error: tAction('slotTaken') }
    return { error: message || tAction('serverError') }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath('/')
  return {}
}

export async function rejectSlotRequest(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const auth = await authorizeBombSquadAction(slotId)
  if (!auth.ok) return { error: auth.error }
  const { db, eventId } = auth

  const { error } = await db.rpc('reject_slot_request', { p_slot_id: slotId })
  if (error) return { error: error.message || tAction('serverError') }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath('/')
  return {}
}

// Caller 가 본인 파티의 빈 슬롯에 멤버를 직접 "지정" 한다. 신청 → 승인 플로우를
// 우회하므로 권한은 authorizeBombSquadAction 과 동일 (관리자 / 이벤트 소유자 /
// 파티 콜러). RPC 가 is_bomb_squad + 빈 슬롯 + cross-party 중복 체크까지 한다.
export async function directAssignMember(
  slotId: string,
  memberDiscordId: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const auth = await authorizeBombSquadAction(slotId)
  if (!auth.ok) return { error: auth.error }
  const { db, eventId } = auth

  // guild_avatars 는 service-role 로만 읽을 수 있어 auth 에서 받은 admin db 를
  // 그대로 재사용한다. withdrawn 된 멤버는 명단에 뜨지도 않지만 방어적으로 체크.
  const { data: member, error: memberError } = await db
    .from('guild_avatars')
    .select('username, withdrawn_at')
    .eq('discord_id', memberDiscordId)
    .maybeSingle()
  if (memberError) return { error: memberError.message }
  if (!member) return { error: tAction('memberNotFound') }
  if (member.withdrawn_at) return { error: tAction('memberWithdrawn') }

  const { error } = await db.rpc('caller_assign_slot', {
    p_slot_id: slotId,
    p_discord_id: memberDiscordId,
    p_username: member.username,
  })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('SLOT_NOT_FOUND')) return { error: tAction('slotNotFound') }
    if (message.includes('NOT_BOMB_SQUAD')) return { error: tAction('notBombSquad') }
    if (message.includes('SLOT_TAKEN')) return { error: tAction('slotTaken') }
    if (message.includes('SLOT_PENDING')) return { error: tAction('slotPending') }
    if (message.includes('ALREADY_IN_EVENT')) return { error: tAction('alreadyInEvent') }
    return { error: message || tAction('serverError') }
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath('/')
  return {}
}

// 콜러 지정 모달이 쓰는 멤버 목록. 현재 이벤트에 이미 속한 멤버에는
// `alreadyInEvent=true` 플래그를 붙여 모달에서 비활성화 표시한다.
// 권한: 관리자 / 이벤트 소유자 / 이 이벤트 내 "어떤 파티" 콜러.
export async function listAssignableMembers(
  eventId: string,
): Promise<{
  members?: Array<{ discordId: string; username: string; alreadyInEvent: boolean }>
  error?: string
}> {
  const tAction = await getTranslations('slotAction')
  const session = await getSession()
  if (!session) return { error: tAction('loginRequired') }

  const db = getAdminClient()
  const { data: eventRow, error: eventError } = await db
    .from('events')
    .select('id, created_by, parties(caller_discord_id)')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return { error: eventError.message }
  if (!eventRow) return { error: tAction('eventNotFound') }
  const isOwner = !!eventRow.created_by && eventRow.created_by === session.discordId
  const parties = (eventRow.parties ?? []) as { caller_discord_id: string | null }[]
  const isAnyCaller = parties.some((p) => p.caller_discord_id === session.discordId)
  if (!session.isAdmin && !isOwner && !isAnyCaller) {
    return { error: tAction('bombSquadNotAuthorized') }
  }

  const { data: members, error: membersError } = await db
    .from('guild_avatars')
    .select('discord_id, username, withdrawn_at')
    .order('username', { ascending: true })
  if (membersError) return { error: membersError.message }

  // 같은 이벤트에서 이미 slot 을 점유(assigned) 하거나 pending(requested) 상태인
  // discord_id 를 모아 차단 집합을 만든다. inner join 으로 이 이벤트 것만 로드.
  const { data: assignments, error: assignError } = await db
    .from('slots')
    .select('assigned_discord_id, requested_discord_id, parties!inner(event_id)')
    .eq('parties.event_id', eventId)
  if (assignError) return { error: assignError.message }

  const blocked = new Set<string>()
  for (const row of assignments ?? []) {
    if (row.assigned_discord_id) blocked.add(row.assigned_discord_id as string)
    if (row.requested_discord_id) blocked.add(row.requested_discord_id as string)
  }

  return {
    members: (members ?? [])
      .filter((m) => !m.withdrawn_at)
      .map((m) => ({
        discordId: m.discord_id as string,
        username: m.username as string,
        alreadyInEvent: blocked.has(m.discord_id as string),
      })),
  }
}
