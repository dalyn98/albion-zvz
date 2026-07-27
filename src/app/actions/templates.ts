'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireEventCreator, requireEventCreatorForEvent } from '@/lib/auth'
import { sessionCanCreateEventCategory } from '@/lib/event-permissions'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sanitizeTemplateData } from './template-slot-sanitizers'
import {
  EVENT_CATEGORIES,
  type ConditionalSlotOptions,
  type EventCategory,
  type GearOption,
  type GearSpecs,
  type SlotSpells,
} from '@/types'

// Columns saved per slot: role + notes + all 8 gear slots + per-slot options
// + per-item spells, no assignment data (per product spec: templates store
// configuration only). Must be a string literal — the Supabase typegen parser
// can't narrow a dynamically joined column list.
const TEMPLATE_SLOT_COLUMNS =
  'slot_number, role_name, notes, spells, gear_specs, conditional_options, ' +
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
  // Migration 139: 무기 픽이 다른 종류 후보를 좁히는 룰. 누락/null 가능 (기존
  // 템플릿 호환).
  conditional_options?: ConditionalSlotOptions | null
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

type TemplateDb = Awaited<ReturnType<typeof requireEventCreator>>
type TemplateErrorTranslator = Awaited<ReturnType<typeof getTranslations<'adminActionError'>>>

async function insertTemplateParties(
  db: TemplateDb,
  guildId: string,
  eventId: string,
  data: TemplateData,
  tErr: TemplateErrorTranslator,
): Promise<{ error?: string }> {
  const templateData = sanitizeTemplateData(data)
  if (!templateData?.parties?.length) return { error: tErr('templateHasNoParties') }

  // Batch-insert all parties, then batch-insert all slots in one shot —
  // collapses O(N) roundtrips into 2 regardless of party count.
  const { data: insertedParties, error: partiesError } = await db
    .from('parties')
    .insert(
      templateData.parties.map((p) => ({
        guild_id: guildId,
        event_id: eventId,
        party_number: p.party_number,
      })),
    )
    .select('id, party_number')
  if (partiesError) return { error: await publicActionError(partiesError, 'actions/templates') }

  const partyIdByNumber = new Map(
    (insertedParties ?? []).map((p) => [p.party_number, p.id as string]),
  )

  const slotRows = templateData.parties.flatMap((party) => {
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
      conditional_options: s.conditional_options ?? null,
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
    if (slotsError) return { error: await publicActionError(slotsError, 'actions/templates') }
  }
  return {}
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
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(eventId)
    const guildId = await getSessionGuildId(session)

    const { data: parties, error } = await db
      .from('parties')
      .select(`party_number, slots(${TEMPLATE_SLOT_COLUMNS})`)
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
      .order('party_number')
    if (error) return { error: await publicActionError(error, 'actions/templates') }
    if (!parties || parties.length === 0) {
      return { error: tErr('noPartiesToSave') }
    }

    const data: TemplateData = sanitizeTemplateData({
      parties: parties.map((p) => ({
        party_number: p.party_number,
        slots: ((p.slots ?? []) as TemplateSlot[])
          .slice()
          .sort((a, b) => a.slot_number - b.slot_number),
      })),
    })

    if (options.overwriteId) {
      // 명시적 덮어쓰기 — 이름은 손대지 않고 data 만 갱신.
      const { data: target, error: targetErr } = await db
        .from('event_templates')
        .select('id')
        .eq('guild_id', guildId)
        .eq('id', options.overwriteId)
        .maybeSingle()
      if (targetErr) return { error: await publicActionError(targetErr, 'actions/templates') }
      if (!target) return { error: tErr('templateNotFound') }
      const { error: updateError } = await db
        .from('event_templates')
        .update({ data })
        .eq('guild_id', guildId)
        .eq('id', options.overwriteId)
      if (updateError) return { error: await publicActionError(updateError, 'actions/templates') }
      revalidatePath('/admin/dashboard')
      revalidatePath('/admin/dashboard/events')
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
    if (existingErr) return { error: await publicActionError(existingErr, 'actions/templates') }
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
      if (updateError) return { error: await publicActionError(updateError, 'actions/templates') }
    } else {
      const { error: insertError } = await db
        .from('event_templates')
        .insert({ guild_id: guildId, name: trimmed, data })
      if (insertError) return { error: await publicActionError(insertError, 'actions/templates') }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
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

    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: existingRows, error: existingErr } = await db
      .from('event_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .order('created_at', { ascending: false })
      .limit(1)
    if (existingErr) return { error: await publicActionError(existingErr, 'actions/templates') }
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
    if (insertError) return { error: await publicActionError(insertError, 'actions/templates') }
    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
    return { id: inserted.id as string }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
  }
}

export async function listTemplates(): Promise<{
  templates: TemplateSummary[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { templates: [], error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('event_templates')
      .select('id, name, created_at')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
    if (error) return { templates: [], error: await publicActionError(error, 'actions/templates') }
    return { templates: (data ?? []) as TemplateSummary[] }
  } catch (e) {
    return { templates: [], error: await publicActionError(e, 'actions/templates') }
  }
}

export async function createEventFromTemplate(
  templateId: string,
  payload: { title: string; category?: EventCategory },
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const title = payload.title.trim()
    if (!title) return { error: tErr('missingTitle') }
    const category = payload.category ?? '전투'
    if (!EVENT_CATEGORIES.includes(category)) return { error: tErr('serverError') }

    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    if (!sessionCanCreateEventCategory(session, category)) {
      return { error: tErr('unauthorized') }
    }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: template, error: templateError } = await db
      .from('event_templates')
      .select('data')
      .eq('guild_id', guildId)
      .eq('id', templateId)
      .maybeSingle()
    if (templateError) return { error: await publicActionError(templateError, 'actions/templates') }
    if (!template) return { error: tErr('templateNotFound') }
    const templateData = sanitizeTemplateData(template.data as TemplateData)
    if (!templateData?.parties?.length) return { error: tErr('templateHasNoParties') }

    const { data: event, error: eventError } = await db
      .from('events')
      .insert({
        guild_id: guildId,
        title,
        gather_time: '',
        gather_at: null,
        gather_location: '',
        special_notes: null,
        status: 'draft',
        category,
        regear_policy: 'role',
        regear_silver_cap: null,
        regear_max_deaths_per_member: null,
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (eventError) return { error: await publicActionError(eventError, 'actions/templates') }

    const inserted = await insertTemplateParties(db, guildId, event.id as string, templateData, tErr)
    if (inserted.error) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', event.id)
      return { error: inserted.error }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
    revalidatePath(`/admin/dashboard/events/${event.id}`)
    return { id: event.id as string }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
  }
}

export async function getTemplate(id: string): Promise<{
  template?: TemplateRecord
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('event_templates')
      .select('id, name, data, created_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .single()
    if (error) return { error: await publicActionError(error, 'actions/templates') }
    return { template: data as TemplateRecord }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
  }
}

// 빌드 템플릿 편집기 저장. 다른 템플릿이 같은 이름을 점유하면 conflictId/
// conflictName 을 돌려 client 가 confirm 흐름을 띄우게 한다. overwrite=true 로
// 재호출되면 충돌 row 를 먼저 삭제한 뒤 현재 row 를 갱신해 같은 이름의 템플릿이
// 한 개만 남게 한다.
export async function updateTemplate(
  id: string,
  name: string,
  data: TemplateData,
  options: { overwrite?: boolean } = {},
): Promise<{ error?: string; conflictId?: string; conflictName?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > 80) return { error: tErr('templateNameTooLong', { max: 80 }) }
    if (!Array.isArray(data?.parties)) return { error: tErr('invalidTemplateData') }
    const sanitizedData = sanitizeTemplateData(data)

    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: conflictRows, error: conflictErr } = await db
      .from('event_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (conflictErr) return { error: await publicActionError(conflictErr, 'actions/templates') }
    const conflict = conflictRows?.[0]
    if (conflict) {
      if (!options.overwrite) {
        return { conflictId: conflict.id, conflictName: conflict.name }
      }
      const { error: deleteErr } = await db
        .from('event_templates')
        .delete()
        .eq('guild_id', guildId)
        .eq('id', conflict.id)
      if (deleteErr) return { error: await publicActionError(deleteErr, 'actions/templates') }
    }

    const { error } = await db
      .from('event_templates')
      .update({ name: trimmed, data: sanitizedData })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: await publicActionError(error, 'actions/templates') }

    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
    revalidatePath(`/admin/dashboard/templates/${id}`)
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
  }
}

// 기존 템플릿을 통째로 복제. data 는 그대로 복사하고 이름은 "{원본} {suffix}"
// 로 시작해 같은 이름이 이미 있으면 "{원본} {suffix} 2", "{원본} {suffix} 3"
// 식으로 비어 있는 슬롯을 찾아 채운다. UNIQUE 제약은 없지만 사용자가 목록에서
// 같은 이름을 보지 않게 하는 UX 차원의 충돌 회피다. 80자 한도는 잘라서 강제.
const DUPLICATE_NAME_MAX_TRIES = 50

export async function duplicateTemplate(
  id: string,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tTpl = await getTranslations('adminTemplates')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: source, error: fetchErr } = await db
      .from('event_templates')
      .select('name, data')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (fetchErr) return { error: await publicActionError(fetchErr, 'actions/templates') }
    if (!source) return { error: tErr('templateNotFound') }

    const suffix = tTpl('duplicateSuffix')
    const baseName = `${source.name} ${suffix}`.trim()
    const truncate = (s: string) => (s.length > 80 ? s.slice(0, 80) : s)
    let candidate = truncate(baseName)
    for (let n = 2; n <= DUPLICATE_NAME_MAX_TRIES; n++) {
      const { count, error: countErr } = await db
        .from('event_templates')
        .select('id', { count: 'exact', head: true })
        .eq('guild_id', guildId)
        .eq('name', candidate)
      if (countErr) return { error: await publicActionError(countErr, 'actions/templates') }
      if ((count ?? 0) === 0) break
      candidate = truncate(`${baseName} ${n}`)
    }

    const { data: inserted, error: insertErr } = await db
      .from('event_templates')
      .insert({
        guild_id: guildId,
        name: candidate,
        data: sanitizeTemplateData(source.data as TemplateData),
      })
      .select('id')
      .single()
    if (insertErr) return { error: await publicActionError(insertErr, 'actions/templates') }
    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
    return { id: inserted.id as string }
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
  }
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('event_templates')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: await publicActionError(error, 'actions/templates') }
    revalidatePath('/admin/dashboard')
    revalidatePath('/admin/dashboard/events')
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
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
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(eventId)
    const guildId = await getSessionGuildId(session)

    const { count, error: countError } = await db
      .from('parties')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('event_id', eventId)
    if (countError) return { error: await publicActionError(countError, 'actions/templates') }
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
      if (deleteError) return { error: await publicActionError(deleteError, 'actions/templates') }
    }

    const { data: template, error: templateError } = await db
      .from('event_templates')
      .select('data')
      .eq('guild_id', guildId)
      .eq('id', templateId)
      .single()
    if (templateError) return { error: await publicActionError(templateError, 'actions/templates') }

    const inserted = await insertTemplateParties(
      db,
      guildId,
      eventId,
      sanitizeTemplateData(template.data as TemplateData),
      tErr,
    )
    if (inserted.error) return { error: inserted.error }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/templates') }
  }
}
