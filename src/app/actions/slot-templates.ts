'use server'

import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import type { GearOption, SlotSpells } from '@/types'

async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
  return getAdminClient()
}

// Slot-level template data: role + notes + 8 gear slots + per-slot multi-option
// lists + per-item spells. No slot_number (templates are position-agnostic) and
// no assignment data (templates carry configuration only, per product spec).
export interface SlotTemplateData {
  role_name: string | null
  notes: string | null
  spells: SlotSpells | null
  weapon_name: string | null;  weapon_id: string | null;  weapon_options: GearOption[] | null
  head_name: string | null;    head_id: string | null;    head_options: GearOption[] | null
  armor_name: string | null;   armor_id: string | null;   armor_options: GearOption[] | null
  shoes_name: string | null;   shoes_id: string | null;   shoes_options: GearOption[] | null
  offhand_name: string | null; offhand_id: string | null; offhand_options: GearOption[] | null
  potion_name: string | null;  potion_id: string | null;  potion_options: GearOption[] | null
  food_name: string | null;    food_id: string | null;    food_options: GearOption[] | null
  cape_name: string | null;    cape_id: string | null;    cape_options: GearOption[] | null
}

export interface SlotTemplateSummary {
  id: string
  name: string
  created_at: string
}

export interface SlotTemplateRecord {
  id: string
  name: string
  data: SlotTemplateData
  created_at: string
}

const MAX_NAME_LENGTH = 80

export async function saveSlotAsTemplate(
  name: string,
  data: SlotTemplateData,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('templateNameRequired') }
    if (trimmed.length > MAX_NAME_LENGTH) {
      return { error: tErr('templateNameTooLong', { max: MAX_NAME_LENGTH }) }
    }

    const db = await requireAdmin()
    const { error } = await db
      .from('slot_templates')
      .insert({ name: trimmed, data })
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
      .select('id, name, created_at')
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
      .select('id, name, data, created_at')
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
