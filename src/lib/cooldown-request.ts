import type { Slot, SlotKey } from '@/types'

const CDR_SLOT_KEYS = ['weapon', 'head', 'armor', 'shoes', 'offhand', 'food'] as const
type CdrSlotKey = (typeof CDR_SLOT_KEYS)[number]

export type CooldownSlotPayload = Partial<Slot>

export function createCooldownSlotPayload(slot: Slot): CooldownSlotPayload {
  const payload: Record<string, unknown> = {}
  for (const key of CDR_SLOT_KEYS) {
    const slotKey = key as SlotKey
    payload[`${key}_id`] = slot[`${slotKey}_id`]
    payload[`${key}_name`] = slot[`${slotKey}_name`]
    payload[`assigned_${key}_id`] = slot[`assigned_${slotKey}_id`]
    payload[`assigned_${key}_name`] = slot[`assigned_${slotKey}_name`]
    const options = slot[`${slotKey}_options`]
    payload[`${key}_options`] = Array.isArray(options) && options.length > 0 ? [{}] : []
  }
  return payload as CooldownSlotPayload
}

export function cooldownRequestCacheKey(slot: Slot, spellId: string): string {
  return JSON.stringify([spellId, createCooldownSlotPayload(slot)])
}

export { CDR_SLOT_KEYS }
export type { CdrSlotKey }
