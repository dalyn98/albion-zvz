import { SLOT_KEYS, type GearOption, type SlotKey } from '@/types'

type SlotGearNameFields = {
  [K in SlotKey as `${K}_name`]?: string | null
}

type SlotGearIdFields = {
  [K in SlotKey as `${K}_id`]?: string | null
}

export type SlotSignupGearSummarySlot = SlotGearNameFields & SlotGearIdFields

export type SlotSignupPicks = Partial<Record<SlotKey, GearOption>> | null | undefined

export interface SlotSignupGearSummaryLine {
  kind: SlotKey
  name: string
  id: string | null
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

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}
