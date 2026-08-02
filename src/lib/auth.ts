import { getSession, sessionHas, sessionHasAny } from '@/lib/session'
import { resolveLiveDiscordAuthorization } from '@/lib/discord-live-authorization'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSessionGuildId } from '@/lib/tenant'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import type { SessionPayload } from '@/lib/session-verify'
import { assertSupportViewMutationAllowed } from '@/lib/support-view'

export async function requireLiveSession(): Promise<SessionPayload> {
  const signedSession = await getSession()
  if (!signedSession) throw new Error('Unauthorized')
  const authorization = await resolveLiveDiscordAuthorization(signedSession)
  if (!authorization) throw new Error('Unauthorized')
  return authorization.session
}

export async function requireLiveMutationSession(): Promise<SessionPayload> {
  const session = await requireLiveSession()
  await assertSupportViewMutationAllowed(session)
  return session
}

// Server-action gate: throws if the caller is not a verified guild admin,
// otherwise returns the service-role client. Use at the top of every admin
// server action so the auth check + client acquisition lives in one place.
export async function requireAdmin() {
  const session = await requireLiveMutationSession()
  if (!session.isAdmin) throw new Error('Unauthorized')
  return getAdminClient()
}

// Capability gate for delegated officer workflows. `isAdmin` remains an
// explicit bypass so existing admin sessions issued before a new capability bit
// was added do not lose access until their next login.
export async function requireCapability(capability: bigint) {
  const session = await requireLiveMutationSession()
  if (!sessionHas(session, capability)) throw new Error('Unauthorized')
  return getAdminClient()
}

export async function requireAnyCapability(capabilities: readonly bigint[]) {
  const session = await requireLiveMutationSession()
  if (!sessionHasAny(session, capabilities)) {
    throw new Error('Unauthorized')
  }
  return getAdminClient()
}

// Event-creation gate: admins plus legacy event-creator role holders and
// delegated EVENT_CREATE_*/EVENT_MANAGE officers. Used by actions that don't
// target a specific existing event (e.g. templates or cloning).
export async function requireEventCreator() {
  const session = await requireLiveMutationSession()
  if (!sessionCanCreateOrManageEvents(session)) throw new Error('Unauthorized')
  return getAdminClient()
}

// Stricter gate for actions that mutate a specific event (update, delete,
// party/slot edits, battle recording, etc.). Admins and EVENT_MANAGE officers
// pass for existing events in their guild; non-admin event creators/create-cap
// officers only pass when they own the event (events.created_by matches them).
// Legacy events with a null created_by remain blocked for plain event creators
// since we can't retroactively attribute ownership.
export async function requireEventCreatorForEvent(eventId: string) {
  const session = await requireLiveMutationSession()
  if (session.isAdmin) return getAdminClient()
  const canManageAnyEvent = sessionHas(session, CAP.EVENT_MANAGE)
  if (!sessionCanCreateOrManageEvents(session)) throw new Error('Unauthorized')
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
  const session = await requireLiveMutationSession()
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
    (sessionCanCreateOrManageEvents(session) &&
      event.created_by &&
      event.created_by === session.discordId)
  ) {
    return { db, isAdminOrOwner: true }
  }

  // 캘러는 반드시 "기존 파티" 의 caller 로 지정돼 있어야 한다. partyId 가
  // null 이면 (새 파티 생성 시도) admin/owner 가 아닌 이상 차단.
  if (!session.isBombSquadCaller) throw new Error('Unauthorized')
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
  const session = await requireLiveMutationSession()
  if (session.isAdmin) return getAdminClient()
  const canManageAnyEvent = sessionHas(session, CAP.EVENT_MANAGE)
  if (!sessionCanCreateOrManageEvents(session)) throw new Error('Unauthorized')
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
