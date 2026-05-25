import { getSession, sessionHas, sessionHasAny } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'

// Server-action gate: throws if the caller is not a verified guild admin,
// otherwise returns the service-role client. Use at the top of every admin
// server action so the auth check + client acquisition lives in one place.
export async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
  return getAdminClient()
}

// Capability gate for delegated officer workflows. `isAdmin` remains an
// explicit bypass so existing admin sessions issued before a new capability bit
// was added do not lose access until their next login.
export async function requireCapability(capability: bigint) {
  const session = await getSession()
  if (!session?.isAdmin && !sessionHas(session, capability)) throw new Error('Unauthorized')
  return getAdminClient()
}

export async function requireAnyCapability(capabilities: readonly bigint[]) {
  const session = await getSession()
  if (!session?.isAdmin && !sessionHasAny(session, capabilities)) {
    throw new Error('Unauthorized')
  }
  return getAdminClient()
}

// Event-creation gate: admins plus members carrying one of the configured
// event-creator Discord roles. Used by `createEvent` and other actions that
// don't target a specific existing event (e.g. cloning which produces a new
// event owned by the caller).
export async function requireEventCreator() {
  const session = await getSession()
  if (!session?.canCreateEvents) throw new Error('Unauthorized')
  return getAdminClient()
}

// Stricter gate for actions that mutate a specific event (update, delete,
// party/slot edits, battle recording, etc.). Admins and EVENT_MANAGE officers
// pass for existing events in their guild; non-admin event creators only pass
// when they own the event (events.created_by matches their Discord ID).
// Legacy events with a null created_by remain blocked for plain event creators
// since we can't retroactively attribute ownership.
export async function requireEventCreatorForEvent(eventId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (session.isAdmin) return getAdminClient()
  const canManageAnyEvent = sessionHas(session, CAP.EVENT_MANAGE)
  if (!session.canCreateEvents && !canManageAnyEvent) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select('created_by')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Event not found')
  if (canManageAnyEvent) return db
  if (data.created_by !== session.discordId) throw new Error('Unauthorized')
  return db
}

// Party-scoped gate: admins / event owners pass unconditionally; non-admin
// users who are the assigned caller of `partyId` also pass. Designed for
// actions where a bomb squad caller edits only their own party (slots, gear
// builds, member assignment). Caller edits must never change partyMeta —
// `isAdminOrOwner` lets the action short-circuit meta mutations.
export async function requireEventCreatorOrPartyCaller(
  eventId: string,
  partyId: string | null,
): Promise<{ db: ReturnType<typeof getAdminClient>; isAdminOrOwner: boolean }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const db = getAdminClient()
  if (session.isAdmin) return { db, isAdminOrOwner: true }

  const guildId = await getSessionGuildId(session)
  const { data: event, error: eventError } = await db
    .from('events')
    .select('created_by')
    .eq('guild_id', guildId)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) throw new Error(eventError.message)
  if (!event) throw new Error('Event not found')
  if (
    sessionHas(session, CAP.EVENT_MANAGE) ||
    (session.canCreateEvents && event.created_by && event.created_by === session.discordId)
  ) {
    return { db, isAdminOrOwner: true }
  }

  // 캘러는 반드시 "기존 파티" 의 caller 로 지정돼 있어야 한다. partyId 가
  // null 이면 (새 파티 생성 시도) admin/owner 가 아닌 이상 차단.
  if (!partyId) throw new Error('Unauthorized')
  const { data: party, error: partyError } = await db
    .from('parties')
    .select('event_id, caller_discord_id')
    .eq('guild_id', guildId)
    .eq('id', partyId)
    .maybeSingle()
  if (partyError) throw new Error(partyError.message)
  if (!party || party.event_id !== eventId) throw new Error('Unauthorized')
  if (!party.caller_discord_id || party.caller_discord_id !== session.discordId) {
    throw new Error('Unauthorized')
  }
  return { db, isAdminOrOwner: false }
}

// Slot-scoped variant: resolves slot → party → event and delegates to
// requireEventCreatorForEvent. Used by actions that take a slot id but need
// to gate on the parent event's ownership (admin-side assignment clear, etc).
export async function requireEventCreatorForSlot(slotId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (session.isAdmin) return getAdminClient()
  const canManageAnyEvent = sessionHas(session, CAP.EVENT_MANAGE)
  if (!session.canCreateEvents && !canManageAnyEvent) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select('parties!inner(events!inner(created_by))')
    .eq('guild_id', guildId)
    .eq('id', slotId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  // Supabase returns the joined row as a nested object; normalize whether it
  // arrives as array or single.
  const party = Array.isArray(data?.parties) ? data?.parties[0] : data?.parties
  const event = Array.isArray(party?.events) ? party?.events[0] : party?.events
  if (!event) throw new Error('Unauthorized')
  const createdBy = event?.created_by ?? null
  if (canManageAnyEvent) return db
  if (!createdBy) throw new Error('Unauthorized')
  if (createdBy !== session.discordId) throw new Error('Unauthorized')
  return db
}
