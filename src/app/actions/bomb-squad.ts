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
