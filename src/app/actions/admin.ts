'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  requireEventCreator,
  requireEventCreatorForEvent,
  requireEventCreatorForSlot,
} from '@/lib/auth'
import { getSession } from '@/lib/session'
import { sendEventNotification } from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import type { BombSquadKind, SlotKey, SlotSpells, GearOption, GearSpec, GearSpecs } from '@/types'
import {
  BOMB_SQUAD_KINDS,
  SLOT_KEYS,
  GEAR_TIER_MIN,
  GEAR_TIER_MAX,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  isTierlessSlot,
  isSpecLessSlot,
} from '@/types'

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
  // 이벤트 생성/편집 시 관리자가 고른 Discord 역할 ID. notifyEvent 가
  // 채널 공지 시 이 역할만 @멘션한다. NULL/미지정이면 멘션 없이 조용히 공지.
  // optional 로 둬서 role picker UI 를 아직 안 쓰는 호출부도 호환되게 한다.
  notify_role_id?: string | null
  // 편집 화면에서 관리자가 고른 Discord 채널 ID. NULL 이면 env 기반 기본
  // 채널(DISCORD_EVENT_CHANNEL_ID) 로 fallback. 생성 폼은 이 필드를 보내지
  // 않으며 편집 단계에서만 채널을 고른다.
  notify_channel_id?: string | null
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
    const session = await getSession()
    if (!session?.canCreateEvents) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const { data, error } = await db
      .from('events')
      .insert({ ...payload, created_by: session.discordId })
      .select('id')
      .single()
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
    const db = await requireEventCreatorForEvent(id)
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
    const db = await requireEventCreatorForEvent(id)
    const { data, error } = await db
      .from('events')
      .select('id, title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id')
      .eq('id', id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('eventNotFound') }
    const content = await getAppSetting(
      'event_notification_message',
      DEFAULT_EVENT_NOTIFICATION_MESSAGE,
    )
    await sendEventNotification(data, {
      content,
      notifyRoleId: data.notify_role_id,
      channelId: data.notify_channel_id,
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function cloneEvent(id: string): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDash = await getTranslations('adminDashboard')
  try {
    const session = await getSession()
    if (!session?.canCreateEvents) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()

    const { data: source, error: sourceErr } = await db
      .from('events')
      .select('title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id')
      .eq('id', id)
      .maybeSingle()
    if (sourceErr) return { error: sourceErr.message }
    if (!source) return { error: tErr('eventNotFound') }

    // Shift gather_at forward by 7 days so the copy lands on the same weekday
    // at the same hour. Admin can still edit if needed.
    let shiftedGatherAt = source.gather_at as string | null
    if (shiftedGatherAt) {
      const d = new Date(shiftedGatherAt)
      d.setUTCDate(d.getUTCDate() + 7)
      shiftedGatherAt = d.toISOString()
    }

    const { data: newEvent, error: insErr } = await db
      .from('events')
      .insert({
        title: `${source.title}${tDash('duplicateSuffix')}`,
        gather_time: source.gather_time,
        gather_at: shiftedGatherAt,
        gather_location: source.gather_location,
        special_notes: source.special_notes,
        notify_role_id: source.notify_role_id,
        notify_channel_id: source.notify_channel_id,
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (insErr) return { error: insErr.message }
    const newId = newEvent.id

    const { data: parties, error: partyErr } = await db
      .from('parties')
      .select('id, party_number')
      .eq('event_id', id)
      .order('party_number')
    if (partyErr) {
      await db.from('events').delete().eq('id', newId)
      return { error: partyErr.message }
    }

    if (!parties || parties.length === 0) {
      revalidatePath('/admin/dashboard')
      return { id: newId }
    }

    const newPartyRows = parties.map((p) => ({ event_id: newId, party_number: p.party_number }))
    const { data: newParties, error: newPartyErr } = await db
      .from('parties')
      .insert(newPartyRows)
      .select('id, party_number')
    if (newPartyErr || !newParties) {
      await db.from('events').delete().eq('id', newId)
      return { error: newPartyErr?.message ?? tErr('serverError') }
    }

    const oldToNewPartyId = new Map<string, string>()
    for (const oldParty of parties) {
      const match = newParties.find((np) => np.party_number === oldParty.party_number)
      if (match) oldToNewPartyId.set(oldParty.id, match.id)
    }

    // Copy build config only — strip id/assigned_* so the clone starts with
    // empty signup slots. Callers usually duplicate a proven event to re-run it.
    const { data: slots, error: slotErr } = await db
      .from('slots')
      .select('*')
      .in('party_id', parties.map((p) => p.id))
    if (slotErr) {
      await db.from('events').delete().eq('id', newId)
      return { error: slotErr.message }
    }

    if (slots && slots.length > 0) {
      const newSlotRows = slots.map((slot) => {
        const row: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(slot)) {
          if (key === 'id') continue
          if (key.startsWith('assigned_')) continue
          if (key === 'party_id') continue
          row[key] = value
        }
        row.party_id = oldToNewPartyId.get(slot.party_id)
        return row
      })
      const { error: insSlotErr } = await db.from('slots').insert(newSlotRows)
      if (insSlotErr) {
        await db.from('events').delete().eq('id', newId)
        return { error: insSlotErr.message }
      }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    return { id: newId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreatorForEvent(id)
    // regear_requests keeps history via SET NULL (migration 005).
    const { error } = await db.from('events').delete().eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    revalidatePath('/me')
    revalidatePath('/members')
    revalidatePath('/members/[discordId]', 'page')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function startBattle(id: string): Promise<{ startedAt?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreatorForEvent(id)
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
    const db = await requireEventCreatorForEvent(id)
    const { error } = await db.from('events').update({ battle_started_at: null }).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
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
  specs?: Partial<Record<SlotKey, GearSpec>>
}

// Migration 041: party-level bomb-squad metadata. All fields optional on input
// so older callers (templates, tests) can omit. sanitizePartyMeta enforces the
// "kind required when flag is on, name/caller only when flag is on" rules.
export interface PartyMetaPayload {
  is_bomb_squad?: boolean
  bomb_squad_kind?: BombSquadKind | null
  name?: string | null
  caller_discord_id?: string | null
}

const MAX_PARTY_NAME_LENGTH = 40

function sanitizePartyMeta(
  meta: PartyMetaPayload | undefined,
  tErr: AdminErrorTranslator,
): { row: {
  name: string | null
  is_bomb_squad: boolean
  bomb_squad_kind: BombSquadKind | null
  caller_discord_id: string | null
} } | { error: string } {
  const isBomb = meta?.is_bomb_squad === true
  if (!isBomb) {
    return {
      row: {
        name: null,
        is_bomb_squad: false,
        bomb_squad_kind: null,
        caller_discord_id: null,
      },
    }
  }
  const kind = meta?.bomb_squad_kind
  if (!kind || !BOMB_SQUAD_KINDS.includes(kind)) {
    return { error: tErr('bombSquadKindRequired') }
  }
  const rawName = typeof meta?.name === 'string' ? meta.name.trim() : ''
  if (rawName.length > MAX_PARTY_NAME_LENGTH) {
    return { error: tErr('partyNameTooLong', { max: MAX_PARTY_NAME_LENGTH }) }
  }
  const rawCaller = typeof meta?.caller_discord_id === 'string' ? meta.caller_discord_id.trim() : ''
  return {
    row: {
      name: rawName || null,
      is_bomb_squad: true,
      bomb_squad_kind: kind,
      caller_discord_id: rawCaller || null,
    },
  }
}

function sanitizeOptionSpells(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out.length > 0 ? out : undefined
}

function sanitizeGearOptions(opts: GearOption[]): GearOption[] | null {
  const clean = opts
    .filter((o) => o && typeof o.id === 'string' && typeof o.name === 'string' && o.id && o.name)
    .map((o) => {
      const spells = sanitizeOptionSpells(o.spells)
      // spells 가 비어있으면 필드 자체를 빼서 jsonb 용량을 아낀다. 누락은
      // undefined/[] 동등 취급 (viewer 가 `opt.spells ?? []` 로 읽는다).
      return spells ? { name: o.name, id: o.id, spells } : { name: o.name, id: o.id }
    })
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

// Drops undefined/out-of-range entries so the stored jsonb stays minimal and
// well-formed. Returns null when no slot has any spec configured.
function sanitizeGearSpecs(specs: Partial<Record<SlotKey, GearSpec>> | null | undefined): GearSpecs | null {
  if (!specs || typeof specs !== 'object') return null
  const out: GearSpecs = {}
  for (const key of SLOT_KEYS) {
    if (isSpecLessSlot(key)) continue
    const raw = specs[key]
    if (!raw || typeof raw !== 'object') continue
    const clean: GearSpec = {}
    if (
      !isTierlessSlot(key) &&
      typeof raw.tier === 'number' &&
      raw.tier >= GEAR_TIER_MIN &&
      raw.tier <= GEAR_TIER_MAX
    ) {
      clean.tier = raw.tier
    }
    if (
      typeof raw.enchant === 'number' &&
      raw.enchant >= GEAR_ENCHANT_MIN &&
      raw.enchant <= GEAR_ENCHANT_MAX
    ) {
      clean.enchant = raw.enchant
    }
    if (clean.tier != null || clean.enchant != null) out[key] = clean
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
    gear_specs: sanitizeGearSpecs(slot.specs),
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
  partyMeta?: PartyMetaPayload,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (partyNumber < 1 || partyNumber > MAX_PARTIES) return { error: tErr('invalidPartyNumber') }
    if (slots.length > MAX_SLOTS_PER_PARTY) return { error: tErr('tooManySlots', { max: MAX_SLOTS_PER_PARTY }) }

    const metaResult = sanitizePartyMeta(partyMeta, tErr)
    if ('error' in metaResult) return { error: metaResult.error }
    const metaRow = metaResult.row

    const db = await requireEventCreatorForEvent(eventId)

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
      const { error: metaUpdErr } = await db
        .from('parties')
        .update(metaRow)
        .eq('id', partyId)
      if (metaUpdErr) return { error: metaUpdErr.message }
    } else {
      const { data, error } = await db
        .from('parties')
        .insert({ event_id: eventId, party_number: partyNumber, ...metaRow })
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
    const db = await requireEventCreatorForSlot(slotId)
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
