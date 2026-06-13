import { SLOT_KEYS, type GearOption, type SlotKey, type SlotSpells } from '@/types'

type SlotGearNameFields = {
  [K in SlotKey as `${K}_name`]?: string | null
}

type SlotGearIdFields = {
  [K in SlotKey as `${K}_id`]?: string | null
}

export type SlotSignupGearSummarySlot = SlotGearNameFields & SlotGearIdFields
type SlotGearOptionsFields = {
  [K in SlotKey as `${K}_options`]?: GearOption[] | null
}

export type SlotSignupSpellSummarySlot = SlotSignupGearSummarySlot
  & SlotGearOptionsFields
  & { spells?: SlotSpells | null }

export type SlotSignupPicks = Partial<Record<SlotKey, GearOption>> | null | undefined

export interface SlotSignupGearSummaryLine {
  kind: SlotKey
  name: string
  id: string | null
  selected: boolean
}

export interface SlotSignupSpellSummaryLine {
  kind: SlotKey
  gearName: string | null
  gearId: string | null
  spellIds: string[]
  selected: boolean
}

export function buildSlotSignupGearSummary(
  slot: SlotSignupGearSummarySlot,
  picks: SlotSignupPicks = null,
): SlotSignupGearSummaryLine[] {
  return SLOT_KEYS.flatMap((kind) => {
    const pick = picks?.[kind]
    const pickedName = cleanText(pick?.name)
    if (pickedName) {
      const line: SlotSignupGearSummaryLine = {
        kind,
        name: pickedName,
        id: cleanText(pick?.id),
        selected: true,
      }
      return [line]
    }

    const fixedName = cleanText(slot[`${kind}_name`])
    const fixedId = cleanText(slot[`${kind}_id`])
    const name = fixedName ?? fixedId
    if (!name) return []

    const line: SlotSignupGearSummaryLine = {
      kind,
      name,
      id: fixedId,
      selected: false,
    }
    return [line]
  })
}

export function buildSlotSignupSpellSummary(
  slot: SlotSignupSpellSummarySlot,
  picks: SlotSignupPicks = null,
): SlotSignupSpellSummaryLine[] {
  return SLOT_KEYS.flatMap((kind): SlotSignupSpellSummaryLine[] => {
    const pick = picks?.[kind]
    const options = slot[`${kind}_options`]

    if (pick) {
      const option = Array.isArray(options)
        ? options.find((candidate) => candidate.id === pick.id)
        : null
      const spellIds = cleanSpellIds(option?.spells ?? pick.spells ?? [])
      if (spellIds.length === 0) return []
      return [{
        kind,
        gearName: cleanText(pick.name) ?? cleanText(option?.name),
        gearId: cleanText(pick.id) ?? cleanText(option?.id),
        spellIds,
        selected: true,
      }]
    }

    if (Array.isArray(options) && options.length > 0) return []

    const spellIds = cleanSpellIds(slot.spells?.[kind] ?? [])
    if (spellIds.length === 0) return []
    const fixedName = cleanText(slot[`${kind}_name`])
    const fixedId = cleanText(slot[`${kind}_id`])
    return [{
      kind,
      gearName: fixedName ?? fixedId,
      gearId: fixedId,
      spellIds,
      selected: false,
    }]
  })
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function cleanSpellIds(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}
