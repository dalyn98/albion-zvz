import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/discord-personal-locale', () => ({
  resolveDiscordPersonalLocale: vi.fn(async (payload: DiscordInteractionPayload) => {
    if (payload.locale === 'zh-CN') return 'zh'
    return 'en'
  }),
}))
import {
  buildDiscordEventBrowseFilterComponents,
  buildDiscordEventGearSelectionComponents,
  buildDiscordEventSignupConfirmationComponents,
  buildDiscordEventBrowseNavRow,
  buildDiscordEventSignupComponents,
  buildDiscordEventSlotButtonRows,
  formatDiscordEventEmptySlotLine,
  formatDiscordEventSignupConfirmationContent,
  handleDiscordEventInteraction,
  resolveDiscordGearSelectionPlan,
  shouldDeferDiscordEventInteraction,
  shouldUpdateDiscordEventInteractionMessage,
} from './discord-event-signups'
import {
  INTERACTION_RESPONSE_TYPE_MODAL,
  type DiscordInteractionPayload,
} from './discord-interactions'
import { SLOT_ROLES } from '@/types'

describe('buildDiscordEventSignupComponents', () => {
  it('builds a compact event signup panel without enumerating every slot', () => {
    const components = buildDiscordEventSignupComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      labels: {
        intentButton: 'Intent',
        codeButton: 'Code',
        browseButton: 'Browse',
        statusButton: 'Status',
        openButton: 'Open',
      },
    })

    expect(components).toHaveLength(1)
    expect(components[0].components).toHaveLength(5)
    expect(components[0].components[0]).toMatchObject({
      type: 2,
      style: 1,
      custom_id: 'agm_evt:v1:intent:11111111-1111-4111-8111-111111111111',
    })
    expect(components[0].components[4]).toMatchObject({
      type: 2,
      style: 5,
      url: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
    })
  })
})

describe('buildDiscordEventSlotButtonRows', () => {
  it('uses slot IDs for button custom IDs even when visible slot codes are duplicated', () => {
    const rows = buildDiscordEventSlotButtonRows('11111111-1111-4111-8111-111111111111', [
      {
        id: '22222222-2222-4222-8222-222222222222',
        slot_number: 1,
        parties: { party_number: 1, name: null, is_bomb_squad: false },
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        slot_number: 1,
        parties: { party_number: 1, name: null, is_bomb_squad: false },
      },
    ])

    expect(rows).toHaveLength(1)
    expect(rows[0].components).toHaveLength(2)
    expect(rows[0].components[0]).toMatchObject({
      label: 'A01',
      custom_id: 'agm_evt:v1:slot:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
    })
    expect(rows[0].components[1]).toMatchObject({
      label: 'A01',
      custom_id: 'agm_evt:v1:slot:11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333',
    })
  })
})

describe('buildDiscordEventBrowseNavRow', () => {
  it('keeps previous and next custom IDs unique on a single-page result', () => {
    const row = buildDiscordEventBrowseNavRow(
      '11111111-1111-4111-8111-111111111111',
      [],
      0,
      1,
      {
        previousButton: 'Previous',
        nextButton: 'Next',
        openButton: 'Open',
      },
      'https://guild.example/events/11111111-1111-4111-8111-111111111111',
    )

    expect(row.components[0]).toMatchObject({
      disabled: true,
      custom_id: 'agm_evt:v1:browse_page:11111111-1111-4111-8111-111111111111:all:0:prev',
    })
    expect(row.components[1]).toMatchObject({
      disabled: true,
      custom_id: 'agm_evt:v1:browse_page:11111111-1111-4111-8111-111111111111:all:0:next',
    })
    expect(row.components[0].custom_id).not.toBe(row.components[1].custom_id)
  })

  it('keeps multi-role page filters compact enough for Discord custom IDs', () => {
    const row = buildDiscordEventBrowseNavRow(
      '11111111-1111-4111-8111-111111111111',
      ['Sup', 'Healer'],
      0,
      2,
      {
        previousButton: 'Previous',
        nextButton: 'Next',
        openButton: 'Open',
      },
      'https://guild.example/events/11111111-1111-4111-8111-111111111111',
    )

    expect(row.components[1]).toMatchObject({
      disabled: false,
      custom_id: 'agm_evt:v1:browse_page:11111111-1111-4111-8111-111111111111:mo:1:next',
    })
    expect(row.components[1].custom_id?.length).toBeLessThanOrEqual(100)
  })
})

describe('buildDiscordEventBrowseFilterComponents', () => {
  it('keeps All as a separate reset button so role multi-select stays valid', () => {
    const components = buildDiscordEventBrowseFilterComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      roleFilter: ['Caller'],
      messages: {
        browseSelectPlaceholder: 'Filter',
        browseAllButton: 'All',
      },
    })

    expect(components).toHaveLength(2)
    const roleSelect = components[0].components[0] as {
      type: number
      max_values?: number
      options: { value: string }[]
    }
    expect(roleSelect).toMatchObject({
      type: 3,
      max_values: SLOT_ROLES.length,
    })
    expect(roleSelect.options).toHaveLength(SLOT_ROLES.length)
    expect(roleSelect.options.some((option) => option.value === 'all')).toBe(false)
    expect(components[1].components[0]).toMatchObject({
      type: 2,
      label: 'All',
      custom_id: 'agm_evt:v1:browse_page:11111111-1111-4111-8111-111111111111:all:0:all',
    })
  })
})

describe('formatDiscordEventEmptySlotLine', () => {
  it('shows mount names for BM slots', () => {
    expect(
      formatDiscordEventEmptySlotLine({
        id: '22222222-2222-4222-8222-222222222222',
        slot_number: 3,
        role_name: 'BM',
        weapon_name: 'Should not show',
        mount_name: 'Behemoth',
        parties: { party_number: 2, name: null, is_bomb_squad: false },
      }),
    ).toBe('`B03` · P2 · Battle Mount · Behemoth')
  })

  it('summarizes multiple weapon options as the first weapon plus the remaining count', () => {
    expect(
      formatDiscordEventEmptySlotLine({
        id: '22222222-2222-4222-8222-222222222222',
        slot_number: 1,
        role_name: 'Dps',
        weapon_name: null,
        weapon_options: [
          { id: 'T8_MAIN_SWORD', name: 'Elder Sword' },
          { id: 'T8_MAIN_AXE', name: 'Elder Axe' },
          { id: 'T8_MAIN_SPEAR', name: 'Elder Spear' },
        ],
        parties: { party_number: 1, name: 'Main', is_bomb_squad: false },
      }),
    ).toBe('`A01` · Main · Engage DPS · Elder Sword +2')
  })
})

describe('buildDiscordEventGearSelectionComponents', () => {
  it('keeps weapon and armor selection state in compact custom IDs', () => {
    const components = buildDiscordEventGearSelectionComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      slotId: '22222222-2222-4222-8222-222222222222',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      weaponOptions: [
        { id: 'T8_MAIN_SWORD', name: 'Elder Sword' },
        { id: 'T8_MAIN_AXE', name: 'Elder Axe' },
      ],
      armorOptions: [
        { id: 'T8_ARMOR_PLATE_SET1', name: 'Elder Soldier Armor' },
        { id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' },
      ],
      selectedWeaponIndex: 1,
      selectedArmorIndex: 0,
      messages: {
        gearWeaponPlaceholder: 'Choose weapon',
        gearArmorPlaceholder: 'Choose armor',
        gearApplyButton: 'Apply',
        openButton: 'Open',
      },
    })

    expect(components).toHaveLength(3)
    expect(components[0].components[0]).toMatchObject({
      type: 3,
      custom_id: 'agm_evt:v1:gp:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:w:1:0',
    })
    expect(components[1].components[0]).toMatchObject({
      type: 3,
      custom_id: 'agm_evt:v1:gp:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:a:1:0',
    })
    expect(components[2].components[0]).toMatchObject({
      disabled: false,
      custom_id: 'agm_evt:v1:ga:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:1:0',
    })
    for (const row of components) {
      for (const component of row.components) {
        expect(component.custom_id?.length ?? 0).toBeLessThanOrEqual(100)
      }
    }
  })

  it('keeps apply disabled until required gear picks are complete', () => {
    const components = buildDiscordEventGearSelectionComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      slotId: '22222222-2222-4222-8222-222222222222',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      weaponOptions: [{ id: 'T8_MAIN_SWORD', name: 'Elder Sword' }],
      armorOptions: [{ id: 'T8_ARMOR_PLATE_SET1', name: 'Elder Soldier Armor' }],
      selectedWeaponIndex: 0,
      selectedArmorIndex: null,
      messages: {
        gearWeaponPlaceholder: 'Choose weapon',
        gearArmorPlaceholder: 'Choose armor',
        gearApplyButton: 'Apply',
        openButton: 'Open',
      },
    })

    expect(components[2].components[0]).toMatchObject({
      disabled: true,
      custom_id: 'agm_evt:v1:ga:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:0:-',
    })
  })

  it('narrows armor options after a conditional weapon pick', () => {
    const components = buildDiscordEventGearSelectionComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      slotId: '22222222-2222-4222-8222-222222222222',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      weaponOptions: [
        { id: 'T8_MAIN_SWORD', name: 'Elder Sword' },
        { id: 'T8_MAIN_AXE', name: 'Elder Axe' },
      ],
      armorOptions: [
        { id: 'T8_ARMOR_PLATE_SET1', name: 'Elder Soldier Armor' },
        { id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' },
      ],
      armorOptionsByWeaponId: {
        T8_MAIN_AXE: [{ id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' }],
      },
      selectedWeaponIndex: 1,
      selectedArmorIndex: null,
      messages: {
        gearWeaponPlaceholder: 'Choose weapon',
        gearArmorPlaceholder: 'Choose armor',
        gearApplyButton: 'Apply',
        openButton: 'Open',
      },
    })

    expect(components[1].components[0]).toMatchObject({
      type: 3,
      disabled: false,
      options: [
        {
          label: 'Elder Scholar Robe',
          value: '0',
        },
      ],
    })
    expect(components[2].components[0]).toMatchObject({
      disabled: true,
      custom_id: 'agm_evt:v1:ga:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:1:-',
    })
  })

  it('waits for a weapon pick before showing conditional armor options', () => {
    const components = buildDiscordEventGearSelectionComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      slotId: '22222222-2222-4222-8222-222222222222',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      weaponOptions: [{ id: 'T8_MAIN_SWORD', name: 'Elder Sword' }],
      armorOptions: [{ id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' }],
      armorOptionsByWeaponId: {
        T8_MAIN_SWORD: [{ id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' }],
      },
      selectedWeaponIndex: null,
      selectedArmorIndex: null,
      messages: {
        gearWeaponPlaceholder: 'Choose weapon',
        gearArmorPlaceholder: 'Choose armor',
        gearApplyButton: 'Apply',
        openButton: 'Open',
      },
    })

    expect(components[1].components[0]).toMatchObject({
      type: 3,
      disabled: true,
      options: [{ label: 'Choose armor', value: '-' }],
    })
    expect(components[2].components[0]).toMatchObject({
      disabled: true,
      custom_id: 'agm_evt:v1:ga:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:-:-',
    })
  })
})

describe('resolveDiscordGearSelectionPlan', () => {
  const baseSlot = {
    id: '22222222-2222-4222-8222-222222222222',
    slot_number: 1,
    role_name: 'EngageDps',
    notes: null,
    weapon_name: null,
    weapon_id: null,
    head_name: null,
    head_id: null,
    armor_name: null,
    armor_id: null,
    shoes_name: null,
    shoes_id: null,
    offhand_name: null,
    offhand_id: null,
    potion_name: null,
    potion_id: null,
    food_name: null,
    food_id: null,
    cape_name: null,
    cape_id: null,
    mount_name: null,
    mount_id: null,
    weapon_options: [
      { id: 'T8_MAIN_SWORD', name: 'Elder Sword' },
      { id: 'T8_MAIN_AXE', name: 'Elder Axe' },
    ],
    head_options: null,
    armor_options: [
      { id: 'T8_ARMOR_PLATE_SET1', name: 'Elder Soldier Armor' },
      { id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' },
    ],
    shoes_options: null,
    offhand_options: null,
    potion_options: null,
    food_options: null,
    cape_options: null,
    mount_options: null,
    assigned_discord_id: null,
    requested_discord_id: null,
    is_hidden: false,
    is_solo_bomb: false,
    parties: { party_number: 1, name: null, is_bomb_squad: false },
  }

  it('supports conditional armor choices in Discord', () => {
    const plan = resolveDiscordGearSelectionPlan({
      ...baseSlot,
      conditional_options: {
        armor: {
          T8_MAIN_SWORD: [{ id: 'T8_ARMOR_PLATE_SET1', name: 'Elder Soldier Armor' }],
          T8_MAIN_AXE: [{ id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' }],
        },
      },
    })

    expect(plan).toMatchObject({
      kind: 'select',
      plan: {
        requiredKinds: ['weapon', 'armor'],
        armorOptionsByWeaponId: {
          T8_MAIN_AXE: [{ id: 'T8_ARMOR_CLOTH_SET1', name: 'Elder Scholar Robe' }],
        },
      },
    })
  })

  it('keeps unsupported conditional gear on the web flow', () => {
    const plan = resolveDiscordGearSelectionPlan({
      ...baseSlot,
      shoes_options: [{ id: 'T8_SHOES_PLATE_SET1', name: 'Elder Soldier Boots' }],
      conditional_options: {
        shoes: {
          T8_MAIN_SWORD: [{ id: 'T8_SHOES_PLATE_SET1', name: 'Elder Soldier Boots' }],
        },
      },
    })

    expect(plan).toEqual({ kind: 'web' })
  })
})

describe('buildDiscordEventSignupConfirmationComponents', () => {
  it('keeps confirm custom IDs compact enough for Discord', () => {
    const components = buildDiscordEventSignupConfirmationComponents({
      eventId: '11111111-1111-4111-8111-111111111111',
      slotId: '22222222-2222-4222-8222-222222222222',
      eventUrl: 'https://guild.example/events/11111111-1111-4111-8111-111111111111',
      selection: {
        weaponIndex: 12,
        armorIndex: 3,
      },
      messages: {
        confirmApplyButton: 'Confirm',
        confirmCancelButton: 'Cancel',
        openButton: 'Open',
      },
    })

    expect(components).toHaveLength(1)
    expect(components[0].components[0]).toMatchObject({
      type: 2,
      custom_id: 'agm_evt:v1:confirm:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:c:3',
    })
    for (const component of components[0].components) {
      expect(component.custom_id?.length ?? 0).toBeLessThanOrEqual(100)
    }
  })
})

describe('formatDiscordEventSignupConfirmationContent', () => {
  it('summarizes notes and selected gear before final signup', () => {
    expect(
      formatDiscordEventSignupConfirmationContent({
        title: 'Reset Day',
        code: 'A01',
        slot: {
          id: '22222222-2222-4222-8222-222222222222',
          slot_number: 1,
          role_name: 'Dps',
          notes: 'Bring swaps',
          weapon_name: 'Fixed Sword',
          weapon_id: 'T8_MAIN_SWORD',
          weapon_options: [
            { id: 'T8_MAIN_AXE', name: 'Picked Axe', spells: ['AXE_Q', 'AXE_W'] },
          ],
          armor_name: 'Cleric Robe',
          armor_id: 'T8_ARMOR_CLOTH_SET1',
          spells: {
            armor: ['ROBE_R'],
          },
          assigned_discord_id: null,
          requested_discord_id: null,
          is_hidden: false,
          is_solo_bomb: false,
          parties: { party_number: 1, name: null, is_bomb_squad: false },
        },
        picks: {
          weapon: { id: 'T8_MAIN_AXE', name: 'Picked Axe' },
        },
        messages: {
          confirmTitle: '**{title}** `{code}` confirmation',
          confirmRoleLabel: 'Role',
          confirmMemoLabel: 'Notes',
          confirmMemoEmpty: 'No notes',
          confirmGearLabel: 'Gear',
          confirmGearEmpty: 'No gear',
          confirmSpellLabel: 'Spells',
          confirmSpellEmpty: 'No spells',
          confirmHint: 'Press confirm.',
          gearLabels: {
            weapon: 'Weapon',
            head: 'Head',
            armor: 'Armor',
            shoes: 'Shoes',
            offhand: 'Offhand',
            potion: 'Potion',
            food: 'Food',
            cape: 'Cape',
            mount: 'Mount',
          },
        },
      }),
    ).toBe([
      '**Reset Day** `A01` confirmation',
      'Role: Engage DPS',
      '**Notes:**',
      '> Bring swaps',
      'Gear:',
      '- Weapon: Picked Axe',
      '- Armor: Cleric Robe',
      'Spells:',
      '- Weapon (Picked Axe): AXE_Q, AXE_W',
      '- Armor (Cleric Robe): ROBE_R',
      '',
      'Press confirm.',
    ].join('\n'))
  })
})

describe('handleDiscordEventInteraction', () => {
  it('opens a slot-code modal in the invoking Discord locale without enumerating slots', async () => {
    const response = await handleDiscordEventInteraction({
      id: 'interaction-1',
      type: 3,
      locale: 'zh-CN',
      data: {
        custom_id: 'agm_evt:v1:code:11111111-1111-4111-8111-111111111111',
      },
    } as DiscordInteractionPayload)

    expect(response.type).toBe(INTERACTION_RESPONSE_TYPE_MODAL)
    expect(response.data).toMatchObject({
      custom_id: 'agm_evt:v1:code_submit:11111111-1111-4111-8111-111111111111',
      title: '用槽位代码报名',
    })
    expect(response.data?.components?.[0]?.components?.[0]).toMatchObject({
      type: 4,
      custom_id: 'slot_code',
      placeholder: '例: A01',
    })
  })

  it('rejects unknown component IDs before any guild lookup', async () => {
    const response = await handleDiscordEventInteraction({
      id: 'interaction-1',
      type: 3,
      locale: 'en-US',
      data: {
        custom_id: 'other:v1:code:11111111-1111-4111-8111-111111111111',
      },
    } as DiscordInteractionPayload)

    expect(response.data?.content).toBe(
      'Something went wrong while handling this event action. Please try again later.',
    )
  })
})

describe('shouldDeferDiscordEventInteraction', () => {
  it('defers database-backed component and modal-submit actions when a follow-up token is present', () => {
    expect(
      shouldDeferDiscordEventInteraction({
        id: 'interaction-1',
        application_id: 'app-1',
        token: 'token-1',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:browse:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(true)

    expect(
      shouldDeferDiscordEventInteraction({
        id: 'interaction-2',
        application_id: 'app-1',
        token: 'token-1',
        type: 5,
        data: {
          custom_id: 'agm_evt:v1:code_submit:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(true)
  })

  it('does not defer code buttons because Discord requires an immediate modal response', () => {
    expect(
      shouldDeferDiscordEventInteraction({
        id: 'interaction-1',
        application_id: 'app-1',
        token: 'token-1',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:code:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(false)
  })
})

describe('shouldUpdateDiscordEventInteractionMessage', () => {
  it('updates private flow component messages instead of creating new ephemeral messages', () => {
    expect(
      shouldUpdateDiscordEventInteractionMessage({
        id: 'interaction-1',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:browse_page:11111111-1111-4111-8111-111111111111:all:0:next',
        },
      } as DiscordInteractionPayload),
    ).toBe(true)

    expect(
      shouldUpdateDiscordEventInteractionMessage({
        id: 'interaction-3',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:confirm:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222:-:-',
        },
      } as DiscordInteractionPayload),
    ).toBe(true)

    expect(
      shouldUpdateDiscordEventInteractionMessage({
        id: 'interaction-2',
        type: 3,
        data: {
          custom_id: 'agm_evt:v1:browse:11111111-1111-4111-8111-111111111111',
        },
      } as DiscordInteractionPayload),
    ).toBe(false)
  })
})
