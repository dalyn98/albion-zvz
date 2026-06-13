import { describe, expect, it } from 'vitest'
import {
  buildDiscordEventGearSelectionComponents,
  buildDiscordEventBrowseNavRow,
  buildDiscordEventSignupComponents,
  buildDiscordEventSlotButtonRows,
  handleDiscordEventInteraction,
  shouldDeferDiscordEventInteraction,
} from './discord-event-signups'
import {
  INTERACTION_RESPONSE_TYPE_MODAL,
  type DiscordInteractionPayload,
} from './discord-interactions'

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
})

describe('handleDiscordEventInteraction', () => {
  it('opens a localized slot-code modal without enumerating slots', async () => {
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
