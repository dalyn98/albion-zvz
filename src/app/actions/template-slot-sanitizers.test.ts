import { describe, expect, it } from 'vitest'
import {
  FREE_ITEM_NAME,
  NO_OFFHAND_OPTION_ID,
  NO_OFFHAND_OPTION_NAME,
  SLOT_KEYS,
  type GearOption,
} from '@/types'
import type { SlotTemplateData } from './slot-templates'
import type { TemplateData } from './templates'
import { sanitizeSlotTemplateData, sanitizeTemplateData } from './template-slot-sanitizers'

function emptyGearColumns(): Record<string, null> {
  return SLOT_KEYS.reduce(
    (acc, key) => ({
      ...acc,
      [`${key}_name`]: null,
      [`${key}_id`]: null,
      [`${key}_options`]: null,
    }),
    {} as Record<string, null>,
  )
}

function makeSlotTemplateData(overrides: Partial<SlotTemplateData> = {}): SlotTemplateData {
  return {
    role_name: null,
    notes: null,
    spells: null,
    gear_specs: null,
    conditional_options: null,
    ...emptyGearColumns(),
    ...overrides,
  } as SlotTemplateData
}

function makeTemplateSlot(
  overrides: Partial<TemplateData['parties'][number]['slots'][number]> = {},
): TemplateData['parties'][number]['slots'][number] {
  return {
    slot_number: 1,
    ...makeSlotTemplateData(),
    gear_specs: null,
    mount_name: null,
    mount_id: null,
    mount_options: null,
    ...overrides,
  }
}

describe('template slot sanitizers', () => {
  it('sanitizes flat slot template gear, spells, and free markers', () => {
    const data = sanitizeSlotTemplateData(makeSlotTemplateData({
      role_name: ' EngageDps ',
      notes: ' Notes ',
      weapon_name: 'Bad weapon',
      weapon_id: 'T8_MAIN_SWORD<script>',
      head_name: FREE_ITEM_NAME,
      head_id: null,
      armor_name: ' Elder Armor ',
      armor_id: ' T8_ARMOR_PLATE_SET3 ',
      offhand_options: [
        { name: ' Torch ', id: ' T8_OFF_TORCH ', spells: ['PASSIVE_MAXLOAD', '<script>'] },
        { name: 'Bad', id: '../evil' },
      ] as GearOption[],
      spells: {
        weapon: [' SLOT_SPELL ', 'SLOT_SPELL', '<script>'],
      },
    }))

    expect(data.role_name).toBe('EngageDps')
    expect(data.notes).toBe('Notes')
    expect(data.weapon_name).toBeNull()
    expect(data.weapon_id).toBeNull()
    expect(data.head_name).toBe(FREE_ITEM_NAME)
    expect(data.head_id).toBeNull()
    expect(data.armor_name).toBe('Elder Armor')
    expect(data.armor_id).toBe('T8_ARMOR_PLATE_SET3')
    expect(data.offhand_options).toEqual([
      { name: 'Torch', id: 'T8_OFF_TORCH', spells: ['PASSIVE_MAXLOAD'] },
    ])
    expect(data.spells).toEqual({ weapon: ['SLOT_SPELL'] })
  })

  it('sanitizes event template parties before they are applied to slots', () => {
    const data = sanitizeTemplateData({
      parties: [{
        party_number: -1,
        slots: [
          makeTemplateSlot({
            slot_number: 0,
            weapon_options: [{ name: 'Sword', id: 'T8_MAIN_SWORD' }],
            weapon_name: 'Stale fixed weapon',
            weapon_id: 'T8_STALE',
          }),
        ],
      }],
    })

    expect(data.parties[0].party_number).toBe(1)
    expect(data.parties[0].slots[0].slot_number).toBe(1)
    expect(data.parties[0].slots[0].weapon_options).toEqual([
      { name: 'Sword', id: 'T8_MAIN_SWORD' },
    ])
    expect(data.parties[0].slots[0].weapon_name).toBeNull()
    expect(data.parties[0].slots[0].weapon_id).toBeNull()
  })

  it('renumbers template slots by party order before database insert', () => {
    const data = sanitizeTemplateData({
      parties: [{
        party_number: 21,
        slots: [
          makeTemplateSlot({ slot_number: 1, role_name: 'EngageDps' }),
          makeTemplateSlot({ slot_number: 1, role_name: 'PierceDps' }),
        ],
      }],
    })

    expect(data.parties[0].party_number).toBe(21)
    expect(data.parties[0].slots.map((slot) => slot.slot_number)).toEqual([1, 2])
  })

  it('keeps weapon-conditioned food, potion, and cape candidates in templates', () => {
    const data = sanitizeSlotTemplateData(makeSlotTemplateData({
      weapon_options: [
        { name: 'Elder Broadsword', id: 'T8_MAIN_SWORD' },
        { name: 'Elder Axe', id: 'T8_MAIN_AXE' },
      ],
      food_options: [
        { name: 'Elder Beef Stew', id: 'T8_MEAL_STEW' },
        { name: 'Elder Omelette', id: 'T8_MEAL_OMELETTE' },
      ],
      potion_options: [
        { name: 'Elder Healing Potion', id: 'T8_POTION_HEAL' },
        { name: 'Elder Resistance Potion', id: 'T8_POTION_RESISTANCE' },
      ],
      cape_options: [
        { name: 'Elder Morgana Cape', id: 'T8_CAPEITEM_MORGANA' },
        { name: 'Elder Lymhurst Cape', id: 'T8_CAPEITEM_LYMHURST' },
      ],
      conditional_options: {
        food: {
          T8_MAIN_SWORD: [{ name: 'Elder Beef Stew', id: 'T8_MEAL_STEW' }],
        },
        potion: {
          T8_MAIN_SWORD: [{ name: 'Elder Healing Potion', id: 'T8_POTION_HEAL' }],
        },
        cape: {
          T8_MAIN_SWORD: [{ name: 'Elder Morgana Cape', id: 'T8_CAPEITEM_MORGANA' }],
        },
      },
    }))

    expect(data.conditional_options).toEqual({
      food: {
        T8_MAIN_SWORD: [{ name: 'Elder Beef Stew', id: 'T8_MEAL_STEW' }],
      },
      potion: {
        T8_MAIN_SWORD: [{ name: 'Elder Healing Potion', id: 'T8_POTION_HEAL' }],
      },
      cape: {
        T8_MAIN_SWORD: [{ name: 'Elder Morgana Cape', id: 'T8_CAPEITEM_MORGANA' }],
      },
    })
  })

  it('keeps no-offhand conditional candidates in templates', () => {
    const data = sanitizeSlotTemplateData(makeSlotTemplateData({
      weapon_options: [
        { name: 'Elder Broadsword', id: 'T8_MAIN_SWORD' },
        { name: 'Elder Great Axe', id: 'T8_2H_AXE' },
      ],
      offhand_options: [
        { name: 'Elder Torch', id: 'T8_OFF_TORCH' },
      ],
      conditional_options: {
        offhand: {
          T8_2H_AXE: [{ name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }],
        },
      },
    }))

    expect(data.conditional_options).toEqual({
      offhand: {
        T8_2H_AXE: [{ name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }],
      },
    })
  })
})
