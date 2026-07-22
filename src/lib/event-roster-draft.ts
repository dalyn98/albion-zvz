import type { SlotInput } from '@/components/SlotEditor/slot-input'
import { buildDisplaySlot } from '@/components/BuildPreview'
import type { BombSquadKind, PartyWithSlots, Slot, SlotKey } from '@/types'
import { SLOT_KEYS } from '@/types'

export interface EventPartyDraft {
  partyNumber: number
  slots: SlotInput[]
  name: string
  isBombSquad: boolean
  bombSquadKind: BombSquadKind
  callerDiscordId: string
}

function buildAssignmentFields(original: Slot | undefined): Partial<Slot> {
  const gear = SLOT_KEYS.reduce((fields, key) => ({
    ...fields,
    [`assigned_${key}_name`]: original?.[`assigned_${key}_name` as `assigned_${SlotKey}_name`] ?? null,
    [`assigned_${key}_id`]: original?.[`assigned_${key}_id` as `assigned_${SlotKey}_id`] ?? null,
  }), {} as Partial<Slot>)
  return {
    ...gear,
    assigned_discord_id: original?.assigned_discord_id ?? null,
    assigned_username: original?.assigned_username ?? null,
    requested_discord_id: original?.requested_discord_id ?? null,
    requested_username: original?.requested_username ?? null,
    requested_picks: original?.requested_picks ?? null,
    requested_at: original?.requested_at ?? null,
  }
}

function mergeDraftSlots(
  partyId: string,
  partyNumber: number,
  initialSlots: readonly Slot[],
  drafts: readonly SlotInput[],
): Slot[] {
  const initialById = new Map(initialSlots.map((slot) => [slot.id, slot]))
  return drafts.map((draft, index) => {
    const original = draft.id ? initialById.get(draft.id) : undefined
    return {
      ...buildDisplaySlot(draft),
      ...buildAssignmentFields(original),
      id: draft.id ?? `draft-slot-${partyNumber}-${index + 1}`,
      party_id: partyId,
      slot_number: index + 1,
    }
  })
}

export function mergeEventPartyDrafts(
  initialParties: readonly PartyWithSlots[],
  drafts: readonly EventPartyDraft[],
  eventId: string,
): PartyWithSlots[] {
  const initialByNumber = new Map(initialParties.map((party) => [party.party_number, party]))
  const draftByNumber = new Map(drafts.map((draft) => [draft.partyNumber, draft]))
  const partyNumbers = new Set([...initialByNumber.keys(), ...draftByNumber.keys()])

  return Array.from(partyNumbers)
    .sort((a, b) => a - b)
    .flatMap((partyNumber) => {
      const initial = initialByNumber.get(partyNumber)
      const draft = draftByNumber.get(partyNumber)
      if (!draft) return initial ? [initial] : []
      if (!initial && draft.slots.length === 0 && !draft.isBombSquad) return []
      const partyId = initial?.id ?? `draft-party-${partyNumber}`
      return [{
        id: partyId,
        event_id: initial?.event_id ?? eventId,
        party_number: partyNumber,
        slots_version: initial?.slots_version ?? 0,
        name: draft.isBombSquad ? draft.name.trim() || null : null,
        is_bomb_squad: draft.isBombSquad,
        bomb_squad_kind: draft.isBombSquad ? draft.bombSquadKind : null,
        caller_discord_id: draft.isBombSquad ? draft.callerDiscordId.trim() || null : null,
        slots: mergeDraftSlots(partyId, partyNumber, initial?.slots ?? [], draft.slots),
      }]
    })
}
