import { describe, expect, it } from 'vitest'
import type { PartyWithSlots, Slot, SlotRole } from '@/types'
import {
  filterEventGridParties,
  getMobileSlotGridClass,
  parseMobileSlotColumns,
  summarizeEventRoleAvailability,
} from './event-party-grid'

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 'slot-1',
    role_name: 'BrawlerDps',
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
      { roleFilter: 'BrawlerDps' },
    )

    expect(result).toHaveLength(1)
    expect(result[0].slots).toEqual([])
  })

  it('treats pending requests as unavailable for the open-only filter', () => {
    const result = filter([
      party({
        slots: [
          slot({ id: 'open-slot' }),
          slot({ id: 'pending-slot', requested_discord_id: 'member-1' }),
          slot({ id: 'assigned-slot', assigned_discord_id: 'member-2' }),
        ],
      }),
    ], { openOnly: true })

    expect(result[0].slots.map((s) => s.id)).toEqual(['open-slot'])
  })
})

describe('summarizeEventRoleAvailability', () => {
  it('counts assigned and pending slots as applied per role', () => {
    const rows = summarizeEventRoleAvailability([
      party({
        slots: [
          slot({ id: 'healer-open', role_name: 'Healer' }),
          slot({ id: 'healer-pending', role_name: 'Healer', requested_discord_id: 'member-1' }),
          slot({ id: 'healer-assigned', role_name: 'Healer', assigned_discord_id: 'member-2' }),
          slot({ id: 'caller-open', role_name: 'Caller' }),
          slot({ id: 'no-role-open', role_name: null }),
        ],
      }),
    ])

    expect(rows).toMatchObject([
      {
        roleName: 'Caller',
        total: 1,
        applied: 0,
        remaining: 1,
        appliedRate: 0,
      },
      {
        roleName: 'Healer',
        total: 3,
        applied: 2,
        assigned: 1,
        pending: 1,
        remaining: 1,
        appliedRate: 67,
      },
      {
        roleName: null,
        total: 1,
        applied: 0,
        remaining: 1,
      },
    ])
  })
})

describe('mobile slot column helpers', () => {
  it('accepts only supported mobile slot column counts', () => {
    expect(parseMobileSlotColumns('1')).toBe(1)
    expect(parseMobileSlotColumns('2')).toBe(2)
    expect(parseMobileSlotColumns('4')).toBe(4)
    expect(parseMobileSlotColumns('3')).toBeNull()
    expect(parseMobileSlotColumns(null)).toBeNull()
  })

  it('maps mobile slot columns to base grid classes without changing sm+ classes', () => {
    expect(getMobileSlotGridClass(1)).toBe('grid-cols-1')
    expect(getMobileSlotGridClass(2)).toBe('grid-cols-2')
    expect(getMobileSlotGridClass(4)).toBe('grid-cols-4')
  })
})
