'use server'

import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { EVENT_CATEGORIES, type EventCategory, type GearOption, type GearSpecs, type SlotSpells } from '@/types'

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

export interface SlotTemplateRecord {
  id: string
  name: string
  data: SlotTemplateData
  category: EventCategory
  created_at: string
}

const MAX_NAME_LENGTH = 80

export async function saveSlotAsTemplate(
  name: string,
  data: SlotTemplateData,
  category: EventCategory = '전투',
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { error: tErr('templateNameTooLong', { max: MAX_NAME_LENGTH }) }
    }
    const resolvedCategory: EventCategory = EVENT_CATEGORIES.includes(category) ? category : '전투'

    const db = await requireAdmin()
    const { error } = await db
      .from('slot_templates')
      .insert({ name: trimmed, data, category: resolvedCategory })
    if (error) return { error: error.message }
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
    const db = await requireAdmin()
    const { data, error } = await db
      .from('slot_templates')
      .select('id, name, category, created_at, role_name:data->>role_name')
      .order('created_at', { ascending: false })
    if (error) return { templates: [], error: error.message }
    return { templates: (data ?? []) as SlotTemplateSummary[] }
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
    const db = await requireAdmin()
    const { data, error } = await db
      .from('slot_templates')
      .select('id, name, data, category, created_at')
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
    const db = await requireAdmin()
    const { error } = await db.from('slot_templates').delete().eq('id', id)
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
