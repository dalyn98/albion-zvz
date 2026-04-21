import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'

// Server-action gate: throws if the caller is not a verified guild admin,
// otherwise returns the service-role client. Use at the top of every admin
// server action so the auth check + client acquisition lives in one place.
export async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
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
// party/slot edits, battle recording, etc.). Admins pass unconditionally;
// non-admin event creators only pass when they own the event (events.created_by
// matches their Discord ID). Legacy events with a null created_by remain
// admin-only since we can't retroactively attribute ownership.
export async function requireEventCreatorForEvent(eventId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (session.isAdmin) return getAdminClient()
  if (!session.canCreateEvents) throw new Error('Unauthorized')
  const db = getAdminClient()
  const { data, error } = await db
    .from('events')
    .select('created_by')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Event not found')
  if (data.created_by !== session.discordId) throw new Error('Unauthorized')
  return db
}

// Slot-scoped variant: resolves slot → party → event and delegates to
// requireEventCreatorForEvent. Used by actions that take a slot id but need
// to gate on the parent event's ownership (admin-side assignment clear, etc).
export async function requireEventCreatorForSlot(slotId: string) {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (session.isAdmin) return getAdminClient()
  if (!session.canCreateEvents) throw new Error('Unauthorized')
  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select('parties!inner(events!inner(created_by))')
    .eq('id', slotId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  // Supabase returns the joined row as a nested object; normalize whether it
  // arrives as array or single.
  const party = Array.isArray(data?.parties) ? data?.parties[0] : data?.parties
  const event = Array.isArray(party?.events) ? party?.events[0] : party?.events
  const createdBy = event?.created_by ?? null
  if (!createdBy) throw new Error('Unauthorized')
  if (createdBy !== session.discordId) throw new Error('Unauthorized')
  return db
}
