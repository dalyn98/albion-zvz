'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import type { GearOption, GearSpecs, SlotSpells } from '@/types'

// Columns saved per slot: role + notes + all 8 gear slots + per-slot options
// + per-item spells, no assignment data (per product spec: templates store
// configuration only). Must be a string literal — the Supabase typegen parser
// can't narrow a dynamically joined column list.
const TEMPLATE_SLOT_COLUMNS =
  'slot_number, role_name, notes, spells, gear_specs, ' +
  'weapon_name, weapon_id, weapon_options, ' +
  'head_name, head_id, head_options, ' +
  'armor_name, armor_id, armor_options, ' +
  'shoes_name, shoes_id, shoes_options, ' +
  'offhand_name, offhand_id, offhand_options, ' +
  'potion_name, potion_id, potion_options, ' +
  'food_name, food_id, food_options, ' +
  'cape_name, cape_id, cape_options, ' +
  'mount_name, mount_id, mount_options'

interface TemplateSlot {
  slot_number: number
  role_name: string | null
  notes: string | null
  spells: SlotSpells | null
  gear_specs: GearSpecs | null
  weapon_name: string | null;  weapon_id: string | null;  weapon_options: GearOption[] | null
  head_name: string | null;    head_id: string | null;    head_options: GearOption[] | null
  armor_name: string | null;   armor_id: string | null;   armor_options: GearOption[] | null
  shoes_name: string | null;   shoes_id: string | null;   shoes_options: GearOption[] | null
  offhand_name: string | null; offhand_id: string | null; offhand_options: GearOption[] | null
  potion_name: string | null;  potion_id: string | null;  potion_options: GearOption[] | null
  food_name: string | null;    food_id: string | null;    food_options: GearOption[] | null
  cape_name: string | null;    cape_id: string | null;    cape_options: GearOption[] | null
  mount_name: string | null;   mount_id: string | null;   mount_options: GearOption[] | null
}

interface TemplateParty {
  party_number: number
  slots: TemplateSlot[]
}

export interface TemplateData {
  parties: TemplateParty[]
}

export interface TemplateSummary {
  id: string
  name: string
  created_at: string
}

export interface TemplateRecord {
  id: string
  name: string
  data: TemplateData
  created_at: string
}

// 호출 모드 두 가지:
//   1) overwriteId 지정 — 사용자가 목록에서 골라 명시적으로 덮어쓰기. 이름은
//      유지하고 data 만 교체. 이름 입력은 무시한다.
//   2) overwriteId 없음 — 새 이름으로 저장. 같은 이름이 이미 있으면
//      conflictId/conflictName 만 돌려주고 실제 저장은 미룬다 (UX 안전장치).
//      UI 가 confirm 후 overwrite=true 로 재호출하면 그때 실제 update.
export async function saveEventAsTemplate(
  eventId: string,
  name: string,
  options: { overwrite?: boolean; overwriteId?: string } = {},
): Promise<{ error?: string; conflictId?: string; conflictName?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: parties, error } = await db
      .from('parties')
      .select(`party_number, slots(${TEMPLATE_SLOT_COLUMNS})`)
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .order('party_number')
    if (error) return { error: error.message }
    if (!parties || parties.length === 0) {
      return { error: tErr('noPartiesToSave') }
    }

    const data: TemplateData = {
      parties: parties.map((p) => ({
        party_number: p.party_number,
        slots: ((p.slots ?? []) as TemplateSlot[])
          .slice()
          .sort((a, b) => a.slot_number - b.slot_number),
      })),
    }

    if (options.overwriteId) {
      // 명시적 덮어쓰기 — 이름은 손대지 않고 data 만 갱신.
      const { data: target, error: targetErr } = await db
        .from('event_templates')
        .select('id')
        .eq('guild_id', guildId)
        .eq('id', options.overwriteId)
        .maybeSingle()
      if (targetErr) return { error: targetErr.message }
      if (!target) return { error: tErr('templateNotFound') }
      const { error: updateError } = await db
        .from('event_templates')
        .update({ data })
        .eq('guild_id', guildId)
        .eq('id', options.overwriteId)
      if (updateError) return { error: updateError.message }
      revalidatePath('/admin/dashboard')
      return {}
    }

    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > 80) return { error: tErr('templateNameTooLong', { max: 80 }) }

    // name 컬럼에 UNIQUE 제약이 없어 이론상 중복 row 가 있을 수 있으나 평소엔
    // 같은 이름이 1개 이하다. 가장 최근 row 를 기준으로 충돌 검사.
    const { data: existingRows, error: existingErr } = await db
      .from('event_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .order('created_at', { ascending: false })
      .limit(1)
    if (existingErr) return { error: existingErr.message }
    const existing = existingRows?.[0]

    if (existing) {
      if (!options.overwrite) {
        return { conflictId: existing.id, conflictName: existing.name }
      }
      const { error: updateError } = await db
        .from('event_templates')
        .update({ data })
        .eq('guild_id', guildId)
        .eq('id', existing.id)
      if (updateError) return { error: updateError.message }
    } else {
      const { error: insertError } = await db
        .from('event_templates')
        .insert({ guild_id: guildId, name: trimmed, data })
      if (insertError) return { error: insertError.message }
    }

    revalidatePath('/admin/dashboard')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 빈 템플릿을 처음부터 생성. 이벤트 없이 템플릿만 만들고 싶은 경우용 — 생성
// 직후 편집 화면(`/admin/dashboard/templates/{id}`) 으로 보내 파티/슬롯을 채우게
// 한다. 같은 이름이 이미 있으면 conflict 처리 — saveEventAsTemplate 의 비-overwrite
// 분기와 동일한 시그니처를 유지해 클라이언트가 쉽게 confirm 흐름을 붙일 수 있다.
export async function createTemplate(
  name: string,
): Promise<{ id?: string; error?: string; conflictId?: string; conflictName?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > 80) return { error: tErr('templateNameTooLong', { max: 80 }) }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: existingRows, error: existingErr } = await db
      .from('event_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .order('created_at', { ascending: false })
      .limit(1)
    if (existingErr) return { error: existingErr.message }
    const existing = existingRows?.[0]
    if (existing) {
      return { conflictId: existing.id, conflictName: existing.name }
    }

    const emptyData: TemplateData = { parties: [] }
    const { data: inserted, error: insertError } = await db
      .from('event_templates')
      .insert({ guild_id: guildId, name: trimmed, data: emptyData })
      .select('id')
      .single()
    if (insertError) return { error: insertError.message }
    revalidatePath('/admin/dashboard')
    return { id: inserted.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listTemplates(): Promise<{
  templates: TemplateSummary[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { templates: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('event_templates')
      .select('id, name, created_at')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
    if (error) return { templates: [], error: error.message }
    return { templates: (data ?? []) as TemplateSummary[] }
  } catch (e) {
    return { templates: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function getTemplate(id: string): Promise<{
  template?: TemplateRecord
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('event_templates')
      .select('id, name, data, created_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .single()
    if (error) return { error: error.message }
    return { template: data as TemplateRecord }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateTemplate(
  id: string,
  name: string,
  data: TemplateData,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > 80) return { error: tErr('templateNameTooLong', { max: 80 }) }
    if (!data?.parties) return { error: tErr('invalidTemplateData') }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('event_templates')
      .update({ name: trimmed, data })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/dashboard')
    revalidatePath(`/admin/dashboard/templates/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('event_templates')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Apply template to an event. By default refuses to overwrite non-empty events
// — slots may carry live signups, so admin should opt-in. With overwrite=true
// we delete existing parties first (slots cascade via FK), then apply.
export async function applyTemplate(
  eventId: string,
  templateId: string,
  options: { overwrite?: boolean } = {},
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { count, error: countError } = await db
      .from('parties')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    if (countError) return { error: countError.message }
    if ((count ?? 0) > 0) {
      if (!options.overwrite) {
        return { error: tErr('eventHasParties') }
      }
      // Slots cascade on party delete (FK ON DELETE CASCADE in schema.sql).
      const { error: deleteError } = await db
        .from('parties')
        .delete()
        .eq('guild_id', guildId)
        .eq('event_id', eventId)
      if (deleteError) return { error: deleteError.message }
    }

    const { data: template, error: templateError } = await db
      .from('event_templates')
      .select('data')
      .eq('guild_id', guildId)
      .eq('id', templateId)
      .single()
    if (templateError) return { error: templateError.message }

    const data = template.data as TemplateData
    if (!data?.parties?.length) return { error: tErr('templateHasNoParties') }

    // Batch-insert all parties, then batch-insert all slots in one shot —
    // collapses O(N) roundtrips into 2 regardless of party count.
    const { data: insertedParties, error: partiesError } = await db
      .from('parties')
      .insert(
        data.parties.map((p) => ({
          guild_id: guildId,
          event_id: eventId,
          party_number: p.party_number,
        })),
      )
      .select('id, party_number')
    if (partiesError) return { error: partiesError.message }

    const partyIdByNumber = new Map(
      (insertedParties ?? []).map((p) => [p.party_number, p.id as string]),
    )

    const slotRows = data.parties.flatMap((party) => {
      const partyId = partyIdByNumber.get(party.party_number)
      if (!partyId) return []
      return party.slots.map((s) => ({
        guild_id: guildId,
        party_id: partyId,
        slot_number: s.slot_number,
        role_name: s.role_name,
        notes: s.notes,
        spells: s.spells ?? null,
        gear_specs: s.gear_specs ?? null,
        weapon_name: s.weapon_name,   weapon_id: s.weapon_id,   weapon_options: s.weapon_options ?? null,
        head_name: s.head_name,       head_id: s.head_id,       head_options: s.head_options ?? null,
        armor_name: s.armor_name,     armor_id: s.armor_id,     armor_options: s.armor_options ?? null,
        shoes_name: s.shoes_name,     shoes_id: s.shoes_id,     shoes_options: s.shoes_options ?? null,
        offhand_name: s.offhand_name, offhand_id: s.offhand_id, offhand_options: s.offhand_options ?? null,
        potion_name: s.potion_name,   potion_id: s.potion_id,   potion_options: s.potion_options ?? null,
        food_name: s.food_name,       food_id: s.food_id,       food_options: s.food_options ?? null,
        cape_name: s.cape_name,       cape_id: s.cape_id,       cape_options: s.cape_options ?? null,
        mount_name: s.mount_name,     mount_id: s.mount_id,     mount_options: s.mount_options ?? null,
      }))
    })

    if (slotRows.length > 0) {
      const { error: slotsError } = await db.from('slots').insert(slotRows)
      if (slotsError) return { error: slotsError.message }
    }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
