import { describe, expect, it } from 'vitest'
import type { PartyWithSlots, Slot, SlotRole } from '@/types'
import {
  filterEventGridParties,
  getMobileSlotGridClass,
  parseMobileSlotColumns,
  summarizeEventArmorShare,
  summarizeEventRoleAvailability,
} from './event-party-grid'

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 'slot-1',
    role_name: 'EngageDps',
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
    slots_version: 0,
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
      { roleFilter: 'EngageDps' },
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

describe('summarizeEventArmorShare', () => {
  it('counts confirmed fixed armor slots over all visible fixed armor slots', () => {
    const result = summarizeEventArmorShare([
      party({
        slots: [
          slot({ id: 'open-judicator', armor_name: 'Judicator Armor' }),
          slot({
            id: 'assigned-judicator',
            assigned_discord_id: 'member-1',
            armor_name: 'Judicator Armor',
          }),
          slot({
            id: 'assigned-knight',
            assigned_discord_id: 'member-2',
            armor_name: 'Knight Armor',
          }),
          slot({
            id: 'assigned-empty',
            assigned_discord_id: 'member-3',
            armor_name: null,
          }),
          slot({
            id: 'hidden-judicator',
            is_hidden: true,
            assigned_discord_id: 'member-4',
            armor_name: 'Judicator Armor',
          }),
        ],
      }),
    ], ['judicator'])

    expect(result).toEqual({ confirmedArmorSlotCount: 1, totalArmorSlotCount: 2 })
  })

  it('counts assigned multi armor picks as confirmed armor outcomes', () => {
    const result = summarizeEventArmorShare([
      party({
        slots: [
          slot({
            id: 'open-multi-judicator-option',
            armor_name: null,
            armor_options: [{ name: 'Judicator Armor', id: 'T8_ARMOR_PLATE_KEEPER' }],
          }),
          slot({
            id: 'assigned-multi-judicator',
            assigned_discord_id: 'member-1',
            armor_name: null,
            armor_options: [
              { name: 'Judicator Armor', id: 'T8_ARMOR_PLATE_KEEPER' },
              { name: 'Knight Armor', id: 'T8_ARMOR_PLATE_SET2' },
            ],
            assigned_armor_name: 'Judicator Armor',
            assigned_armor_id: 'T8_ARMOR_PLATE_KEEPER',
          }),
          slot({
            id: 'assigned-multi-knight',
            assigned_discord_id: 'member-2',
            armor_name: null,
            armor_options: [
              { name: 'Judicator Armor', id: 'T8_ARMOR_PLATE_KEEPER' },
              { name: 'Knight Armor', id: 'T8_ARMOR_PLATE_SET2' },
            ],
            assigned_armor_name: 'Knight Armor',
            assigned_armor_id: 'T8_ARMOR_PLATE_SET2',
          }),
        ],
      }),
    ], ['judicator'])

    expect(result).toEqual({ confirmedArmorSlotCount: 1, totalArmorSlotCount: 1 })
  })

  it('uses the single planned armor instead of applicant-picked armor', () => {
    const result = summarizeEventArmorShare([
      party({
        slots: [
          slot({
            assigned_discord_id: 'member-1',
            armor_name: 'Knight Armor',
            assigned_armor_name: 'Judicator Armor',
          }),
        ],
      }),
    ], ['judicator'])

    expect(result).toEqual({ confirmedArmorSlotCount: 0, totalArmorSlotCount: 0 })
  })
})

describe('mobile slot column helpers', () => {
  it('accepts readable mobile slot column counts and downgrades legacy 4-column preference', () => {
    expect(parseMobileSlotColumns('1')).toBe(1)
    expect(parseMobileSlotColumns('2')).toBe(2)
    expect(parseMobileSlotColumns('4')).toBe(2)
    expect(parseMobileSlotColumns('3')).toBeNull()
    expect(parseMobileSlotColumns(null)).toBeNull()
  })

  it('maps compact mobile slots to a readable two-column breakpoint', () => {
    expect(getMobileSlotGridClass(1)).toBe('grid-cols-1')
    expect(getMobileSlotGridClass(2)).toBe('grid-cols-1 min-[360px]:grid-cols-2')
  })
})
