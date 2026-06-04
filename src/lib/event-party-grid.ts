import type { PartyWithSlots, SlotRole } from '@/types'

export interface EventGridPartyFilterOptions {
  currentDiscordId: string | null
  onlyMyRole: boolean
  myRoleName: string | null
  openOnly: boolean
  roleFilter: SlotRole | ''
  suggestedOnly: boolean
  suggestedRoles: readonly SlotRole[]
}

function isAssignedBombSquadCaller(
  party: PartyWithSlots,
  currentDiscordId: string | null,
): boolean {
  return Boolean(
    party.is_bomb_squad &&
      currentDiscordId &&
      party.caller_discord_id &&
      party.caller_discord_id === currentDiscordId,
  )
}

export function getEventGridMyRoleName(
  parties: readonly PartyWithSlots[],
  currentDiscordId: string | null,
): string | null {
  if (!currentDiscordId) return null
  for (const party of parties) {
    for (const slot of party.slots) {
      if (slot.assigned_discord_id === currentDiscordId && slot.role_name) {
        return slot.role_name
      }
    }
  }
  return null
}

export function filterEventGridParties(
  parties: readonly PartyWithSlots[],
  options: EventGridPartyFilterOptions,
): PartyWithSlots[] {
  const suggestedSet = new Set(options.suggestedRoles)
  return parties.flatMap((party) => {
    const slots = party.slots.filter((slot) => {
      if (options.onlyMyRole && options.myRoleName && slot.role_name !== options.myRoleName) {
        return false
      }
      if (options.openOnly && (slot.assigned_discord_id || slot.requested_discord_id)) {
        return false
      }
      if (options.roleFilter && slot.role_name !== options.roleFilter) return false
      if (
        options.suggestedOnly &&
        suggestedSet.size > 0 &&
        !suggestedSet.has(slot.role_name as SlotRole)
      ) {
        return false
      }
      return true
    })

    if (slots.length > 0) return [{ ...party, slots }]
    if (isAssignedBombSquadCaller(party, options.currentDiscordId)) {
      return [{ ...party, slots }]
    }
    return []
  })
}
