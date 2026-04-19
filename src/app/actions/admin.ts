'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { sendEventNotification } from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import type { SlotKey, SlotSpells, WeaponOption } from '@/types'
import { SLOT_KEYS } from '@/types'

const DEFAULT_EVENT_NOTIFICATION_MESSAGE = '새 이벤트가 등록되었습니다.'

const MAX_PARTIES = 4
const MAX_SLOTS_PER_PARTY = 20

async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
  return getAdminClient()
}

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
function validateEventPayload(payload: EventPayload): string | null {
  if (!payload.title.trim()) return '이벤트 제목이 비어 있습니다.'
  if (!payload.gather_location.trim()) return '집결 장소가 비어 있습니다.'
  const dt = new Date(payload.gather_at)
  if (Number.isNaN(dt.getTime())) return '집결 시간이 올바르지 않습니다.'
  return null
}

export async function createEvent(payload: EventPayload): Promise<{ id: string } | { error: string }> {
  try {
    const invalid = validateEventPayload(payload)
    if (invalid) return { error: invalid }
    const db = await requireAdmin()
    const { data, error } = await db.from('events').insert(payload).select('id').single()
    if (error) return { error: error.message }

    // Notify Discord — do not fail the event creation if the bot call errors.
    try {
      const content = await getAppSetting(
        'event_notification_message',
        DEFAULT_EVENT_NOTIFICATION_MESSAGE,
      )
      await sendEventNotification({ id: data.id, ...payload }, { content })
    } catch (notifyError) {
      console.error('[createEvent] discord notify failed', notifyError)
    }

    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

export async function updateEvent(id: string, payload: EventPayload): Promise<{ error?: string }> {
  try {
    const invalid = validateEventPayload(payload)
    if (invalid) return { error: invalid }
    const db = await requireAdmin()
    const { error } = await db.from('events').update(payload).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

export async function notifyEvent(id: string): Promise<{ error?: string }> {
  try {
    const db = await requireAdmin()
    const { data, error } = await db
      .from('events')
      .select('id, title, gather_at, gather_time, gather_location, special_notes')
      .eq('id', id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: '이벤트를 찾을 수 없습니다.' }
    const content = await getAppSetting(
      'event_notification_message',
      DEFAULT_EVENT_NOTIFICATION_MESSAGE,
    )
    await sendEventNotification(data, { content })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  try {
    const db = await requireAdmin()
    const { error } = await db.from('events').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

export async function startBattle(id: string): Promise<{ startedAt?: string; error?: string }> {
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
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

export async function resetBattleStart(id: string): Promise<{ error?: string }> {
  try {
    const db = await requireAdmin()
    const { error } = await db.from('events').update({ battle_started_at: null }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

// --- Party / slot actions ---

interface SlotPayload {
  id?: string
  slot_number: number
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  weapon_options: WeaponOption[]
  spells: SlotSpells
}

function sanitizeWeaponOptions(opts: WeaponOption[]): WeaponOption[] | null {
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
  const weaponOptions = sanitizeWeaponOptions(slot.weapon_options)
  // When multi-weapon is active, the fixed weapon columns are cleared — the
  // member's chosen weapon lands in assigned_weapon_* at assign time.
  const clearFixedWeapon = weaponOptions !== null
  return {
    party_id: partyId,
    slot_number: slot.slot_number,
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    weapon_options: weaponOptions,
    spells: sanitizeSpells(slot.spells),
    ...SLOT_KEYS.reduce((acc, k) => {
      if (k === 'weapon' && clearFixedWeapon) {
        return { ...acc, weapon_name: null, weapon_id: null }
      }
      return {
        ...acc,
        [`${k}_name`]: slot.items[k].name || null,
        [`${k}_id`]: slot.items[k].id || null,
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
  try {
    if (partyNumber < 1 || partyNumber > MAX_PARTIES) return { error: '파티 번호가 올바르지 않습니다.' }
    if (slots.length > MAX_SLOTS_PER_PARTY) return { error: `한 파티는 최대 ${MAX_SLOTS_PER_PARTY}명까지입니다.` }

    const db = await requireAdmin()

    // Validate event exists first — otherwise FK violation is obscure to the admin.
    const { data: eventRow, error: eventCheckError } = await db
      .from('events')
      .select('id')
      .eq('id', eventId)
      .maybeSingle()
    if (eventCheckError) return { error: eventCheckError.message }
    if (!eventRow) {
      return {
        error: '이벤트가 존재하지 않습니다. 스키마를 재실행했다면 새 이벤트를 먼저 만들어주세요.',
      }
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
          return { error: '이벤트가 존재하지 않아 파티를 생성할 수 없습니다. 이벤트 목록으로 돌아가서 새로 만들어주세요.' }
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

    // Update kept slots in ascending slot_number order so any shift-down moves don't
    // transiently collide with a still-higher slot_number on the UNIQUE(party_id, slot_number) index
    const keptSorted = [...slots].filter((s) => s.id).sort((a, b) => a.slot_number - b.slot_number)
    for (const slot of keptSorted) {
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
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}

export async function clearSlotAssignment(slotId: string): Promise<{ error?: string }> {
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
    return { error: e instanceof Error ? e.message : '서버 오류' }
  }
}
