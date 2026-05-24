'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import { SLOT_ROLES, type SlotRole } from '@/types'

export interface TentativeSignupRow {
  id: string
  event_id: string
  discord_id: string
  username: string
  possible_roles: SlotRole[]
  notes: string | null
  created_at: string
  updated_at: string
}

const slotRoleSet: ReadonlySet<string> = new Set(SLOT_ROLES)

function sanitizeRoles(input: unknown): SlotRole[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<SlotRole>()
  const out: SlotRole[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    if (!slotRoleSet.has(v)) continue
    const role = v as SlotRole
    if (seen.has(role)) continue
    seen.add(role)
    out.push(role)
  }
  return out
}

async function ensureEventBelongsToGuild(
  eventId: string,
  guildId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tAction = await getTranslations('eventTentativeAction')
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select('id, status')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: tAction('eventNotFound') }
  // draft 이벤트도 어드민 편집기에서 관리 가능 — 조회 여부는 호출자 권한이 결정.
  return { ok: true }
}

// 멤버 본인이 자기 참가예정을 등록·갱신. 같은 (event_id, discord_id) 조합은
// 단일 행이라 upsert 로 처리. 가능 역할군은 SLOT_ROLES 화이트리스트로 검증.
export async function submitMyTentativeSignup(
  eventId: string,
  rawRoles: unknown,
  notes?: string,
): Promise<{ error?: string }> {
  const tAction = await getTranslations('eventTentativeAction')
  const session = await getSession()
  if (!session) return { error: tAction('loginRequired') }
  // 게스트는 참가예정 등록 불가 — 본인 식별이 단편적이라 잘못된 데이터가 쌓이기 쉬움.
  if (session.isGuest) return { error: tAction('guestNotAllowed') }
  const guildId = await getSessionGuildId(session)

  const guard = await ensureEventBelongsToGuild(eventId, guildId)
  if (!guard.ok) return { error: guard.error }

  const roles = sanitizeRoles(rawRoles)
  if (roles.length === 0) return { error: tAction('rolesRequired') }

  const trimmedNotes = (notes ?? '').trim() || null

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
  if (error) return { error: error.message }

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
  const session = await getSession()
  if (!session) return { error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: event, error: eventErr } = await db
    .from('events')
    .select('id, created_by')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventErr) return { error: eventErr.message }
  if (!event) return { error: tAction('eventNotFound') }

  const isSelf = session.discordId === discordId
  const isEventOwner = !!event.created_by && event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  if (!isSelf && !session.isAdmin && !isEventManager && !isEventOwner) {
    return { error: tAction('notAuthorized') }
  }

  const { error } = await db
    .from('event_tentative_signups')
    .delete()
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .eq('discord_id', discordId)
  if (error) return { error: error.message }

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
  const session = await getSession()
  if (!session) return { error: tAction('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data: event, error: eventErr } = await db
    .from('events')
    .select('id, created_by')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventErr) return { error: eventErr.message }
  if (!event) return { error: tAction('eventNotFound') }

  const isEventOwner = !!event.created_by && event.created_by === session.discordId
  const isEventManager = sessionHas(session, CAP.EVENT_MANAGE)
  if (!session.isAdmin && !isEventManager && !isEventOwner) {
    return { error: tAction('notAuthorized') }
  }

  const trimmedDiscordId = discordId.trim()
  const trimmedUsername = username.trim()
  if (!trimmedDiscordId || !trimmedUsername) {
    return { error: tAction('memberRequired') }
  }

  const roles = sanitizeRoles(rawRoles)
  if (roles.length === 0) return { error: tAction('rolesRequired') }

  const trimmedNotes = (notes ?? '').trim() || null

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
  if (error) return { error: error.message }

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

  const db = getAdminClient()
  const { data, error } = await db
    .from('event_tentative_signups')
    .select('id, event_id, discord_id, username, possible_roles, notes, created_at, updated_at')
    .eq('guild_id', guildId)
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
  if (error) return { rows: [], error: error.message }

  const rows = (data ?? []).map((r) => ({
    ...r,
    possible_roles: sanitizeRoles(r.possible_roles),
  })) as TentativeSignupRow[]
  return { rows }
}
