'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { sendEventNotification } from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import type { SlotKey, SlotSpells, GearOption } from '@/types'
import { SLOT_KEYS } from '@/types'

const DEFAULT_EVENT_NOTIFICATION_MESSAGE = '새 이벤트가 등록되었습니다.'

const MAX_PARTIES = 4
const MAX_SLOTS_PER_PARTY = 20

type AdminErrorTranslator = Awaited<ReturnType<typeof getTranslations<'adminActionError'>>>

// --- Event actions ---

interface EventPayload {
  title: string
  gather_at: string
  gather_time: string
  gather_location: string
  special_notes: string | null
}

// Final check in case the client bypassed validation — a bad ISO string would
// otherwise surface as an obscure Postgres error on insert.
function validateEventPayload(payload: EventPayload, tErr: AdminErrorTranslator): string | null {
  if (!payload.title.trim()) return tErr('missingTitle')
  if (!payload.gather_location.trim()) return tErr('missingLocation')
  const dt = new Date(payload.gather_at)
  if (Number.isNaN(dt.getTime())) return tErr('invalidGatherTime')
  return null
}

export async function createEvent(payload: EventPayload): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const invalid = validateEventPayload(payload, tErr)
    if (invalid) return { error: invalid }
    const db = await requireAdmin()
    const { data, error } = await db.from('events').insert(payload).select('id').single()
    if (error) return { error: error.message }
    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateEvent(id: string, payload: EventPayload): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const invalid = validateEventPayload(payload, tErr)
    if (invalid) return { error: invalid }
    const db = await requireAdmin()
    const { error } = await db.from('events').update(payload).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function notifyEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const { data, error } = await db
      .from('events')
      .select('id, title, gather_at, gather_time, gather_location, special_notes')
      .eq('id', id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('eventNotFound') }
    const content = await getAppSetting(
      'event_notification_message',
      DEFAULT_EVENT_NOTIFICATION_MESSAGE,
    )
    await sendEventNotification(data, { content })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    // event_battles cascades (migration 023); regear_requests keeps history via SET NULL (migration 005).
    const { error } = await db.from('events').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    revalidatePath('/me')
    revalidatePath('/members')
    revalidatePath('/members/[discordId]', 'page')
    revalidatePath('/battle-records')
    revalidatePath('/battle-records/[id]', 'page')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function startBattle(id: string): Promise<{ startedAt?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const startedAt = new Date().toISOString()
    const { error } = await db
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    return { startedAt }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function resetBattleStart(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const { error } = await db.from('events').update({ battle_started_at: null }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// --- Event outcome (win/loss) actions ---

interface BattlePayload {
  battle_number: number
  opponent_guild: string
  // Migration 024: FK to opponent_guilds. When set, the saved row links to a
  // canonical guild entity; the text stays as a snapshot for historical
  // display. Nullable so legacy/ad-hoc battles without a canonical guild
  // still work.
  opponent_guild_id: string | null
  outcome: 'win' | 'loss'
}

const MAX_BATTLES_PER_EVENT = 50
const MAX_OPPONENT_GUILD_LENGTH = 100

// Event outcome is determined by majority of battle results. A tie leaves
// outcome null so the event stays in "미확정/예정" tab until the admin edits
// further battles to break the tie.
function computeMajorityOutcome(battles: BattlePayload[]): 'win' | 'loss' | null {
  const wins = battles.filter((b) => b.outcome === 'win').length
  const losses = battles.length - wins
  if (wins > losses) return 'win'
  if (losses > wins) return 'loss'
  return null
}

function validateBattles(battles: BattlePayload[], tErr: AdminErrorTranslator): string | null {
  if (battles.length === 0) return tErr('emptyBattles')
  if (battles.length > MAX_BATTLES_PER_EVENT) return tErr('tooManyBattles', { max: MAX_BATTLES_PER_EVENT })
  const seen = new Set<number>()
  for (const b of battles) {
    if (!Number.isInteger(b.battle_number) || b.battle_number < 1) return tErr('invalidBattleNumber')
    if (seen.has(b.battle_number)) return tErr('duplicateBattleNumber')
    seen.add(b.battle_number)
    const guild = b.opponent_guild.trim()
    if (!guild) return tErr('missingOpponentGuild')
    if (guild.length > MAX_OPPONENT_GUILD_LENGTH) {
      return tErr('opponentGuildTooLong', { max: MAX_OPPONENT_GUILD_LENGTH })
    }
    if (b.outcome !== 'win' && b.outcome !== 'loss') return tErr('invalidBattleOutcome')
  }
  return null
}

export async function saveEventBattles(
  eventId: string,
  battles: BattlePayload[],
): Promise<{ error?: string; outcome?: 'win' | 'loss' | null }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const invalid = validateBattles(battles, tErr)
    if (invalid) return { error: invalid }

    const db = await requireAdmin()

    const { data: eventRow, error: eventErr } = await db
      .from('events')
      .select('id, battle_started_at')
      .eq('id', eventId)
      .maybeSingle()
    if (eventErr) return { error: eventErr.message }
    if (!eventRow) return { error: tErr('eventNotFound') }
    if (!eventRow.battle_started_at) return { error: tErr('battleNotStarted') }

    // Replace-all semantics — simpler than diffing and matches how the admin
    // edits the battle list as a single form.
    const { error: delErr } = await db.from('event_battles').delete().eq('event_id', eventId)
    if (delErr) return { error: delErr.message }

    const rows = battles.map((b) => ({
      event_id: eventId,
      battle_number: b.battle_number,
      opponent_guild: b.opponent_guild.trim(),
      opponent_guild_id: b.opponent_guild_id,
      outcome: b.outcome,
    }))
    const { error: insErr } = await db.from('event_battles').insert(rows)
    if (insErr) return { error: insErr.message }

    const outcome = computeMajorityOutcome(battles)
    const { error: updErr } = await db
      .from('events')
      .update({ outcome, finalized_at: new Date().toISOString() })
      .eq('id', eventId)
    if (updErr) return { error: updErr.message }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/')
    revalidatePath('/me')
    return { outcome }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function resetEventOutcome(eventId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()

    const { error: delErr } = await db.from('event_battles').delete().eq('event_id', eventId)
    if (delErr) return { error: delErr.message }

    const { error: updErr } = await db
      .from('events')
      .update({ outcome: null, finalized_at: null })
      .eq('id', eventId)
    if (updErr) return { error: updErr.message }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/')
    revalidatePath('/me')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// --- Party / slot actions ---

interface SlotPayload {
  id?: string
  slot_number: number
  is_hidden: boolean
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  options: Record<SlotKey, GearOption[]>
  spells: SlotSpells
}

function sanitizeGearOptions(opts: GearOption[]): GearOption[] | null {
  const clean = opts
    .filter((o) => o && typeof o.id === 'string' && typeof o.name === 'string' && o.id && o.name)
    .map((o) => ({ name: o.name, id: o.id }))
  // Dedupe by id, preserving order.
  const seen = new Set<string>()
  const deduped = clean.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
  return deduped.length > 0 ? deduped : null
}

// Drops non-string entries, dedupes within each kind, and strips empty
// buckets so the stored JSONB stays minimal. Returns null when no bucket
// has any spells — NULL in the column conveys "not configured".
function sanitizeSpells(spells: SlotSpells | null | undefined): SlotSpells | null {
  if (!spells || typeof spells !== 'object') return null
  const out: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const raw = spells[key]
    if (!Array.isArray(raw)) continue
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const v of raw) {
      if (typeof v !== 'string') continue
      const trimmed = v.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      cleaned.push(trimmed)
    }
    if (cleaned.length > 0) out[key] = cleaned
  }
  return Object.keys(out).length > 0 ? out : null
}

function slotToRow(partyId: string, slot: SlotPayload) {
  const cleanedOptions = SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: sanitizeGearOptions(slot.options[k] ?? []) }),
    {} as Record<SlotKey, GearOption[] | null>,
  )
  // When a slot kind has multi-options, the fixed {kind}_name/id columns must
  // be cleared — the member's pick lands in assigned_{kind}_* at assign time.
  // Holding both a fixed item and an option list would let stale fixed data
  // survive a mode switch.
  return {
    party_id: partyId,
    slot_number: slot.slot_number,
    is_hidden: slot.is_hidden,
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    spells: sanitizeSpells(slot.spells),
    ...SLOT_KEYS.reduce((acc, k) => {
      const hasOptions = cleanedOptions[k] !== null
      return {
        ...acc,
        [`${k}_options`]: cleanedOptions[k],
        [`${k}_name`]: hasOptions ? null : slot.items[k].name || null,
        [`${k}_id`]: hasOptions ? null : slot.items[k].id || null,
      }
    }, {}),
  }
}

export async function savePartySlots(
  eventId: string,
  partyNumber: number,
  partyId: string | null,
  slots: SlotPayload[],
  originalSlotIds: string[],
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (partyNumber < 1 || partyNumber > MAX_PARTIES) return { error: tErr('invalidPartyNumber') }
    if (slots.length > MAX_SLOTS_PER_PARTY) return { error: tErr('tooManySlots', { max: MAX_SLOTS_PER_PARTY }) }

    const db = await requireAdmin()

    // Validate event exists first — otherwise FK violation is obscure to the admin.
    const { data: eventRow, error: eventCheckError } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle()
    if (eventCheckError) return { error: eventCheckError.message }
    if (!eventRow) {
      return { error: tErr('eventMissing') }
    }

    // Saving a never-created party with zero slots should be a no-op — otherwise
    // a single click on an empty panel creates a phantom party row that blocks
    // template loading and can't be removed via the UI.
    if (!partyId && slots.length === 0) {
      revalidatePath(`/admin/dashboard/events/${eventId}`)
      return {}
    }

    let resolvedPartyId: string
    if (partyId) {
      resolvedPartyId = partyId
    } else {
      const { data, error } = await db
        .from('parties')
        .insert({ event_id: eventId, party_number: partyNumber })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23503') {
          return { error: tErr('eventMissingForParty') }
        }
        return { error: error.message }
      }
      resolvedPartyId = data.id
    }

    const keptIds = new Set(slots.map((s) => s.id).filter(Boolean) as string[])
    const removedIds = originalSlotIds.filter((id) => !keptIds.has(id))

    // Delete removed slots first so their slot_numbers free up before we renumber kept ones
    if (removedIds.length > 0) {
      const { error } = await db.from('slots').delete().in('id', removedIds)
      if (error) return { error: error.message }
    }

    // A plain ascending-order UPDATE is not enough for arbitrary reorders
    // (swaps and permutations always collide on UNIQUE(party_id, slot_number)).
    // Park kept slots at temp numbers >20 first, then write the final values.
    // Migration 022 widens the slot_number CHECK to permit this transient range.
    const kept = slots.filter((s) => s.id)
    const TEMP_OFFSET = 1000
    for (let i = 0; i < kept.length; i++) {
      const { error } = await db
        .from('slots')
        .update({ slot_number: TEMP_OFFSET + i + 1 })
        .eq('id', kept[i].id!)
      if (error) return { error: error.message }
    }

    for (const slot of kept) {
      const { error } = await db
        .from('slots')
        .update(slotToRow(resolvedPartyId, slot))
        .eq('id', slot.id!)
      if (error) return { error: error.message }
    }

    // Insert new slots last
    const newSlots = slots.filter((s) => !s.id)
    if (newSlots.length > 0) {
      const { error } = await db
        .from('slots')
        .insert(newSlots.map((s) => slotToRow(resolvedPartyId, s)))
      if (error) return { error: error.message }
    }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearSlotAssignment(slotId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const { error } = await db
      .from('slots')
      .update({ assigned_discord_id: null, assigned_username: null })
      .eq('id', slotId)
    if (error) return { error: error.message }
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
