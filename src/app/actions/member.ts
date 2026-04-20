'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import type { EventOutcome, GearOption, SlotKey } from '@/types'

export type SlotPicks = Partial<Record<SlotKey, GearOption>>

type SlotActionTranslator = Awaited<ReturnType<typeof getTranslations<'slotAction'>>>
type GearTranslator = Awaited<ReturnType<typeof getTranslations<'gear'>>>

type RpcCodeKey =
  | 'slotNotFound'
  | 'slotTaken'
  | 'alreadyInEvent'
  | 'slotEmpty'
  | 'notOwner'

const RPC_CODE_KEYS: Record<string, RpcCodeKey> = {
  SLOT_NOT_FOUND: 'slotNotFound',
  SLOT_TAKEN: 'slotTaken',
  ALREADY_IN_EVENT: 'alreadyInEvent',
  SLOT_EMPTY: 'slotEmpty',
  NOT_OWNER: 'notOwner',
}

function mapRpcError(
  message: string,
  tAction: SlotActionTranslator,
  tGear: GearTranslator,
): string {
  const required = message.match(/GEAR_CHOICE_REQUIRED:(\w+)/)
  if (required) {
    const slotKey = required[1] as SlotKey
    const label = safeGearLabel(slotKey, tGear)
    return tAction('gearChoiceRequired', { label })
  }
  const notInOptions = message.match(/GEAR_NOT_IN_OPTIONS:(\w+)/)
  if (notInOptions) {
    const slotKey = notInOptions[1] as SlotKey
    const label = safeGearLabel(slotKey, tGear)
    return tAction('gearNotInOptions', { label })
  }
  for (const [code, key] of Object.entries(RPC_CODE_KEYS)) {
    if (message.includes(code)) return tAction(key)
  }
  return message
}

function safeGearLabel(slotKey: SlotKey, tGear: GearTranslator): string {
  try {
    return tGear(slotKey)
  } catch {
    return slotKey
  }
}

export async function assignSlot(
  slotId: string,
  picks: SlotPicks = {},
): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const tGear = await getTranslations('gear')
  const session = await getSession()
  if (!session) return { error: tAction('loginRequired') }
  if (!session.isMember) return { error: tAction('noMemberRole') }

  // Filter out empty picks before sending — the RPC treats a missing kind the
  // same as an explicit null, so trimming keeps the payload minimal.
  const cleanPicks: Record<string, GearOption> = {}
  for (const key of Object.keys(picks) as SlotKey[]) {
    const pick = picks[key]
    if (pick && pick.id && pick.name) {
      cleanPicks[key] = { name: pick.name, id: pick.id }
    }
  }
  const payload = Object.keys(cleanPicks).length > 0 ? cleanPicks : null

  const db = getAdminClient()

  // Hidden slots are intentionally invisible to members — guard the action so
  // a crafted request with a stale slot id can't silently bypass the UI hide.
  // Also pull the parent event's finalized_at so we can refuse assignment to
  // events that already have a recorded outcome (event ended).
  const { data: slotCheck, error: slotLookupError } = await db
    .from('slots')
    .select('is_hidden, parties!inner(events!inner(finalized_at))')
    .eq('id', slotId)
    .maybeSingle()
  if (slotLookupError) return { error: slotLookupError.message }
  if (!slotCheck) return { error: tAction('slotNotFound') }
  if (slotCheck.is_hidden) return { error: tAction('slotNotFound') }
  const partyJoin = slotCheck.parties as
    | { events: { finalized_at: string | null } | { finalized_at: string | null }[] }
    | { events: { finalized_at: string | null } | { finalized_at: string | null }[] }[]
    | null
  const partyObj = Array.isArray(partyJoin) ? partyJoin[0] : partyJoin
  const eventObj = partyObj
    ? Array.isArray(partyObj.events)
      ? partyObj.events[0]
      : partyObj.events
    : null
  if (eventObj?.finalized_at) {
    return { error: tAction('eventFinalized') }
  }

  const { error } = await db.rpc('assign_slot', {
    p_slot_id: slotId,
    p_discord_id: session.discordId,
    p_username: session.username,
    p_picks: payload,
  })
  if (error) return { error: mapRpcError(error.message, tAction, tGear) }

  revalidatePath('/')
  return {}
}

export async function cancelSlot(slotId: string): Promise<{ error?: string }> {
  const tAction = await getTranslations('slotAction')
  const tGear = await getTranslations('gear')
  const session = await getSession()
  if (!session) return { error: tAction('loginRequired') }

  const db = getAdminClient()

  // Once the admin starts the battle, assignments are locked in — members
  // cannot cancel. UI also disables the button but the server guard is what
  // actually matters if someone crafts the request by hand.
  const { data: slotRow, error: slotLookupError } = await db
    .from('slots')
    .select('party_id')
    .eq('id', slotId)
    .maybeSingle()
  if (slotLookupError) return { error: slotLookupError.message }
  if (!slotRow) return { error: tAction('slotNotFound') }

  const { data: partyRow, error: partyLookupError } = await db
    .from('parties')
    .select('events(battle_started_at, finalized_at)')
    .eq('id', slotRow.party_id)
    .maybeSingle()
  if (partyLookupError) return { error: partyLookupError.message }
  const eventJoin = partyRow?.events as
    | { battle_started_at: string | null; finalized_at: string | null }
    | { battle_started_at: string | null; finalized_at: string | null }[]
    | null
  const eventState = Array.isArray(eventJoin) ? eventJoin[0] : eventJoin
  if (eventState?.finalized_at) {
    return { error: tAction('eventFinalized') }
  }
  if (eventState?.battle_started_at) {
    return { error: tAction('battleAlreadyStarted') }
  }

  const { error } = await db.rpc('cancel_slot', {
    p_slot_id: slotId,
    p_discord_id: session.discordId,
  })
  if (error) return { error: mapRpcError(error.message, tAction, tGear) }

  revalidatePath('/')
  return {}
}

export interface MyParticipationEntry {
  event_id: string
  event_title: string
  gather_at: string | null
  gather_time: string
  role_name: string | null
  outcome: EventOutcome | null
  battle_started_at: string | null
}

// Events the signed-in member actually participated in — defined as events
// where the admin pressed "battle start" AND one of their slots was assigned
// to the member. Events still awaiting an admin outcome appear with outcome
// = null so the member can see they participated but the result is pending.
export async function listMyParticipation(): Promise<{
  entries: MyParticipationEntry[]
}> {
  const session = await getSession()
  if (!session) return { entries: [] }

  const db = getAdminClient()
  const { data, error } = await db
    .from('slots')
    .select(
      'role_name, parties!inner(events!inner(id, title, gather_at, gather_time, battle_started_at, outcome))',
    )
    .eq('assigned_discord_id', session.discordId)

  if (error) return { entries: [] }

  type JoinedEvent = {
    id: string
    title: string
    gather_at: string | null
    gather_time: string
    battle_started_at: string | null
    outcome: EventOutcome | null
  }
  type Row = {
    role_name: string | null
    parties: { events: JoinedEvent | JoinedEvent[] } | { events: JoinedEvent | JoinedEvent[] }[]
  }

  // Dedupe by event_id — a member might fill multiple slots in the same event
  // (edge case, but possible with admin-assisted moves). Keep the first entry.
  const byEventId = new Map<string, MyParticipationEntry>()
  for (const row of (data ?? []) as Row[]) {
    const parties = Array.isArray(row.parties) ? row.parties[0] : row.parties
    if (!parties) continue
    const event = Array.isArray(parties.events) ? parties.events[0] : parties.events
    if (!event) continue
    if (!event.battle_started_at) continue
    if (byEventId.has(event.id)) continue
    byEventId.set(event.id, {
      event_id: event.id,
      event_title: event.title,
      gather_at: event.gather_at,
      gather_time: event.gather_time,
      role_name: row.role_name,
      outcome: event.outcome,
      battle_started_at: event.battle_started_at,
    })
  }

  const entries = Array.from(byEventId.values()).sort((a, b) => {
    const at = a.gather_at ? new Date(a.gather_at).getTime() : 0
    const bt = b.gather_at ? new Date(b.gather_at).getTime() : 0
    return bt - at
  })
  return { entries }
}
