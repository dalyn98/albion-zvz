'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireEventCreator } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { EVENT_CATEGORIES, type ConditionalSlotOptions, type EventCategory, type GearOption, type GearSpecs, type SlotSpells } from '@/types'

// Slot-level template data: role + notes + 8 gear slots + per-slot multi-option
// lists + per-item spells. No slot_number (templates are position-agnostic) and
// no assignment data (templates carry configuration only, per product spec).
export interface SlotTemplateData {
  role_name: string | null
  notes: string | null
  spells: SlotSpells | null
  // Migration 035: per-slot target tier/enchant. Optional so existing
  // templates loaded without this field still work — applyTemplate defaults
  // to empty specs when absent.
  gear_specs?: GearSpecs | null
  weapon_name: string | null;  weapon_id: string | null;  weapon_options: GearOption[] | null
  head_name: string | null;    head_id: string | null;    head_options: GearOption[] | null
  armor_name: string | null;   armor_id: string | null;   armor_options: GearOption[] | null
  shoes_name: string | null;   shoes_id: string | null;   shoes_options: GearOption[] | null
  offhand_name: string | null; offhand_id: string | null; offhand_options: GearOption[] | null
  potion_name: string | null;  potion_id: string | null;  potion_options: GearOption[] | null
  food_name: string | null;    food_id: string | null;    food_options: GearOption[] | null
  cape_name: string | null;    cape_id: string | null;    cape_options: GearOption[] | null
  // Mount is optional so templates saved before migration 036 still load.
  // Missing → applyTemplateToSlotInput defaults to empty.
  mount_name?: string | null;  mount_id?: string | null;  mount_options?: GearOption[] | null
  // Migration 139: 무기 픽이 다른 종류 후보를 좁히는 룰. 기존 템플릿은 누락
  // 가능 (applyTemplateToSlotInput 이 빈 객체로 폴백).
  conditional_options?: ConditionalSlotOptions | null
}

export interface SlotTemplateSummary {
  id: string
  name: string
  // Projected from data->>'role_name' so the load dialog can filter by role
  // without loading every template's full gear payload up front.
  role_name: string | null
  // Migration 064: 템플릿 카테고리. 저장 시 선택하고, 로드 다이얼로그에서
  // 필터에 쓴다. 기존 템플릿은 전부 '전투' 로 backfill.
  category: EventCategory
  created_at: string
}

export interface SlotTemplateCard extends SlotTemplateSummary {
  data: SlotTemplateData
}

export interface SlotTemplateRecord {
  id: string
  name: string
  data: SlotTemplateData
  category: EventCategory
  created_at: string
}

const MAX_NAME_LENGTH = 80

function emptySlotTemplateData(): SlotTemplateData {
  return {
    role_name: null,
    notes: null,
    spells: null,
    gear_specs: null,
    conditional_options: null,
    weapon_name: null, weapon_id: null, weapon_options: null,
    head_name: null, head_id: null, head_options: null,
    armor_name: null, armor_id: null, armor_options: null,
    shoes_name: null, shoes_id: null, shoes_options: null,
    offhand_name: null, offhand_id: null, offhand_options: null,
    potion_name: null, potion_id: null, potion_options: null,
    food_name: null, food_id: null, food_options: null,
    cape_name: null, cape_id: null, cape_options: null,
    mount_name: null, mount_id: null, mount_options: null,
  }
}

function normalizeCategory(category: EventCategory | string | null | undefined): EventCategory {
  return EVENT_CATEGORIES.includes(category as EventCategory) ? (category as EventCategory) : '전투'
}

export async function createSlotTemplate(
  name: string,
  category: EventCategory = '전투',
): Promise<{ id?: string; error?: string; conflictId?: string; conflictName?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { error: tErr('templateNameTooLong', { max: MAX_NAME_LENGTH }) }
    }

    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const resolvedCategory = normalizeCategory(category)

    const { data: existing, error: lookupError } = await db
      .from('slot_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .maybeSingle()
    if (lookupError) return { error: lookupError.message }
    if (existing) return { conflictId: existing.id, conflictName: existing.name }

    const { data: inserted, error: insertError } = await db
      .from('slot_templates')
      .insert({
        guild_id: guildId,
        name: trimmed,
        category: resolvedCategory,
        data: emptySlotTemplateData(),
      })
      .select('id')
      .single()
    if (insertError) return { error: insertError.message }

    revalidatePath('/admin/dashboard/builds')
    return { id: inserted.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 호출 모드 두 가지 (saveEventAsTemplate 와 동일 패턴):
//   1) overwriteId 지정 — 사용자가 목록에서 골라 명시적으로 덮어쓰기. 이름·카테고리는
//      유지하고 data 만 교체. name/category 입력은 무시.
//   2) overwriteId 없음 — 새 이름으로 저장. 같은 이름이 이미 있으면 conflictId/
//      conflictName 만 돌려주고 실제 저장은 미룬다 (UX 안전장치). UI 가 confirm 후
//      overwrite=true 로 재호출하면 그때 실제 update.
//
// 같은 이름 + overwrite=true 의 의도: 이름 input 으로 들어온 값과 같은 행을 in-place
// update. 1) 와 다른 점은 1) 가 id 로 고정해 이름 변경에 강하다는 것.
export async function saveSlotAsTemplate(
  name: string,
  data: SlotTemplateData,
  category: EventCategory = '전투',
  options: { overwrite?: boolean; overwriteId?: string } = {},
): Promise<{ error?: string; conflictId?: string; conflictName?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    if (options.overwriteId) {
      // 명시적 덮어쓰기 — 이름·카테고리는 손대지 않고 data 만 갱신.
      const { data: target, error: targetErr } = await db
        .from('slot_templates')
        .select('id')
        .eq('guild_id', guildId)
        .eq('id', options.overwriteId)
        .maybeSingle()
      if (targetErr) return { error: targetErr.message }
      if (!target) return { error: tErr('templateNotFound') }
      const { error: updateError } = await db
        .from('slot_templates')
        .update({ data })
        .eq('guild_id', guildId)
        .eq('id', options.overwriteId)
      if (updateError) return { error: updateError.message }
      revalidatePath('/admin/dashboard/builds')
      revalidatePath(`/admin/dashboard/builds/${options.overwriteId}`)
      return {}
    }

    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { error: tErr('templateNameTooLong', { max: MAX_NAME_LENGTH }) }
    }
    const resolvedCategory = normalizeCategory(category)

    const { data: existing, error: lookupError } = await db
      .from('slot_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .maybeSingle()
    if (lookupError) return { error: lookupError.message }

    if (existing) {
      if (!options.overwrite) {
        return { conflictId: existing.id, conflictName: existing.name }
      }
      const { error: updateError } = await db
        .from('slot_templates')
        .update({ data, category: resolvedCategory })
        .eq('guild_id', guildId)
        .eq('id', existing.id)
      if (updateError) return { error: updateError.message }
      revalidatePath('/admin/dashboard/builds')
      revalidatePath(`/admin/dashboard/builds/${existing.id}`)
      return {}
    }

    const { error: insertError } = await db
      .from('slot_templates')
      .insert({ guild_id: guildId, name: trimmed, data, category: resolvedCategory })
    if (insertError) return { error: insertError.message }
    revalidatePath('/admin/dashboard/builds')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateSlotTemplate(
  id: string,
  payload: { name: string; category: EventCategory; data: SlotTemplateData },
  options: { overwrite?: boolean } = {},
): Promise<{ error?: string; conflictId?: string; conflictName?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = payload.name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { error: tErr('templateNameTooLong', { max: MAX_NAME_LENGTH }) }
    }

    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const resolvedCategory = normalizeCategory(payload.category)

    const { data: target, error: targetErr } = await db
      .from('slot_templates')
      .select('id')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (targetErr) return { error: targetErr.message }
    if (!target) return { error: tErr('templateNotFound') }

    const { data: conflictRows, error: conflictErr } = await db
      .from('slot_templates')
      .select('id, name')
      .eq('guild_id', guildId)
      .eq('name', trimmed)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(1)
    if (conflictErr) return { error: conflictErr.message }
    const conflict = conflictRows?.[0]
    if (conflict) {
      if (!options.overwrite) {
        return { conflictId: conflict.id, conflictName: conflict.name }
      }
      const { error: deleteErr } = await db
        .from('slot_templates')
        .delete()
        .eq('guild_id', guildId)
        .eq('id', conflict.id)
      if (deleteErr) return { error: deleteErr.message }
    }

    const { error } = await db
      .from('slot_templates')
      .update({
        name: trimmed,
        category: resolvedCategory,
        data: payload.data,
      })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/dashboard/builds')
    revalidatePath(`/admin/dashboard/builds/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listSlotTemplates(): Promise<{
  templates: SlotTemplateSummary[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { templates: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('slot_templates')
      .select('id, name, category, created_at, role_name:data->>role_name')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
    if (error) return { templates: [], error: error.message }
    return { templates: (data ?? []) as SlotTemplateSummary[] }
  } catch (e) {
    return { templates: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listSlotTemplateCards(): Promise<{
  templates: SlotTemplateCard[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { templates: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('slot_templates')
      .select('id, name, category, created_at, data, role_name:data->>role_name')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
    if (error) return { templates: [], error: error.message }
    return { templates: (data ?? []) as SlotTemplateCard[] }
  } catch (e) {
    return { templates: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// Fetch a single template's full data. Used when the user picks one in the
// load dialog — the caller merges `data` into its local editor state.
export async function getSlotTemplate(id: string): Promise<{
  template?: SlotTemplateRecord
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('slot_templates')
      .select('id, name, data, category, created_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .single()
    if (error) return { error: error.message }
    return { template: data as SlotTemplateRecord }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteSlotTemplate(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireEventCreator()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('slot_templates')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/builds')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
