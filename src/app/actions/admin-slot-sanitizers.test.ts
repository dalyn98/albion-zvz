import { describe, expect, it } from 'vitest'
import { FREE_ITEM_NAME, SLOT_KEYS, type SlotKey } from '@/types'
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
})
