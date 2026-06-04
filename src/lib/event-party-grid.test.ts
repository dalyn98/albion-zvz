import { describe, expect, it } from 'vitest'
import type { PartyWithSlots, Slot, SlotRole } from '@/types'
import { filterEventGridParties } from './event-party-grid'

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 'slot-1',
    role_name: 'Dps',
    assigned_discord_id: null,
    requested_discord_id: null,
    ...overrides,
  } as Slot
}

function party(overrides: Partial<PartyWithSlots> = {}): PartyWithSlots {
  return {
    id: 'party-1',
    event_id: 'event-1',
    party_number: 1,
    name: null,
    is_bomb_squad: true,
    bomb_squad_kind: 'melee',
    caller_discord_id: 'caller-1',
    slots: [],
    ...overrides,
  }
}

function filter(
  parties: PartyWithSlots[],
  overrides: Partial<Parameters<typeof filterEventGridParties>[1]> = {},
): PartyWithSlots[] {
  return filterEventGridParties(parties, {
    currentDiscordId: 'caller-1',
    onlyMyRole: false,
    myRoleName: null,
    openOnly: false,
    roleFilter: '' as SlotRole | '',
    suggestedOnly: false,
    suggestedRoles: [],
    ...overrides,
  })
}

describe('filterEventGridParties', () => {
  it('keeps an empty bomb-squad party visible for its assigned caller', () => {
    expect(filter([party()])).toHaveLength(1)
  })

  it('hides an empty bomb-squad party from non-callers', () => {
    expect(filter([party()], { currentDiscordId: 'member-1' })).toEqual([])
  })

  it('keeps the caller edit entry visible even when slot filters remove every slot', () => {
    const result = filter(
      [party({ slots: [slot({ role_name: 'Healer' })] })],
      { roleFilter: 'Dps' },
    )

    expect(result).toHaveLength(1)
    expect(result[0].slots).toEqual([])
  })
})
