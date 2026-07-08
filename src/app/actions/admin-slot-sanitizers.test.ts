import { describe, expect, it } from 'vitest'
import { FREE_ITEM_NAME, MAX_GEAR_OPTIONS, SLOT_KEYS, type SlotKey } from '@/types'
import { slotToRow, type SlotPayload } from './admin-slot-sanitizers'

function emptyPerSlot<T>(fill: () => T): Record<SlotKey, T> {
  return SLOT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: fill() }),
    {} as Record<SlotKey, T>,
  )
}

function makeSlot(overrides: Partial<SlotPayload> = {}): SlotPayload {
  return {
    slot_number: 1,
    is_hidden: false,
    role_name: 'EngageDps',
    notes: '',
    items: emptyPerSlot(() => ({ name: '', id: '' })),
    options: emptyPerSlot(() => []),
    spells: {},
    ...overrides,
  }
}

describe('slotToRow', () => {
  it('drops malformed item ids at the server action boundary', () => {
    const row = slotToRow('party-1', makeSlot({
      items: {
        ...emptyPerSlot(() => ({ name: '', id: '' })),
        weapon: { name: 'Bad weapon', id: 'T8_MAIN_SWORD<script>' },
        head: { name: FREE_ITEM_NAME, id: '' },
        armor: { name: ' Elder Armor ', id: ' T8_ARMOR_PLATE_SET3 ' },
      },
      options: {
        ...emptyPerSlot(() => []),
        offhand: [
          { name: 'Torch', id: 'T8_OFF_TORCH', spells: ['PASSIVE_MAXLOAD', '<script>'] },
          { name: 'Bad', id: '../evil' },
          { name: 'Too long', id: 'A'.repeat(81) },
        ],
      },
    }))

    expect(row.weapon_name).toBeNull()
    expect(row.weapon_id).toBeNull()
    expect(row.head_name).toBe(FREE_ITEM_NAME)
    expect(row.head_id).toBeNull()
    expect(row.armor_name).toBe('Elder Armor')
    expect(row.armor_id).toBe('T8_ARMOR_PLATE_SET3')
    expect(row.offhand_options).toEqual([
      { name: 'Torch', id: 'T8_OFF_TORCH', spells: ['PASSIVE_MAXLOAD'] },
    ])
  })

  it('caps multi gear option payloads to the editor limit', () => {
    const options = Array.from({ length: MAX_GEAR_OPTIONS + 2 }, (_, index) => ({
      name: `Torch ${index}`,
      id: `T8_OFF_TORCH_${index}`,
    }))
    const row = slotToRow('party-1', makeSlot({
      options: {
        ...emptyPerSlot(() => []),
        offhand: options,
      },
    }))

    expect(row.offhand_options).toHaveLength(MAX_GEAR_OPTIONS)
    expect(row.offhand_options?.at(-1)?.id).toBe(`T8_OFF_TORCH_${MAX_GEAR_OPTIONS - 1}`)
  })

  it('keeps weapon-conditioned food, potion, and cape candidates', () => {
    const row = slotToRow('party-1', makeSlot({
      options: {
        ...emptyPerSlot(() => []),
        weapon: [
          { name: 'Elder Broadsword', id: 'T8_MAIN_SWORD' },
          { name: 'Elder Axe', id: 'T8_MAIN_AXE' },
        ],
        food: [
          { name: 'Elder Beef Stew', id: 'T8_MEAL_STEW' },
          { name: 'Elder Omelette', id: 'T8_MEAL_OMELETTE' },
        ],
        potion: [
          { name: 'Elder Healing Potion', id: 'T8_POTION_HEAL' },
          { name: 'Elder Resistance Potion', id: 'T8_POTION_RESISTANCE' },
        ],
        cape: [
          { name: 'Elder Morgana Cape', id: 'T8_CAPEITEM_MORGANA' },
          { name: 'Elder Lymhurst Cape', id: 'T8_CAPEITEM_LYMHURST' },
        ],
      },
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

    expect(row.conditional_options).toEqual({
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
})
