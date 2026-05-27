import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { AlbionKillbotEvent } from './killbot'

const { fetchAodpPricesMock, loadAodpOptionsMock } = vi.hoisted(() => ({
  fetchAodpPricesMock: vi.fn(),
  loadAodpOptionsMock: vi.fn(),
}))

vi.mock('@/lib/shop/aodp', () => ({
  fetchAodpPrices: fetchAodpPricesMock,
  inventoryKey: (uniqueName: string, enchant: number, quality: number) =>
    `${uniqueName}|${enchant}|${quality}`,
  loadAodpOptions: loadAodpOptionsMock,
}))

import { estimateKillbotVictimValue } from './killbot-value'

const aodpOptions = {
  cities: ['Bridgewatch'],
  primaryCity: 'Bridgewatch',
  server: 'east',
  mode: 'spot',
  minQuality: 1,
  qualityAgnostic: true,
}

function event(overrides: Partial<AlbionKillbotEvent> = {}): AlbionKillbotEvent {
  return {
    EventId: 123,
    TimeStamp: '2026-05-26T12:00:00Z',
    TotalVictimKillFame: 1_000_000,
    Killer: { Name: 'Killer', GuildName: 'Menhera' },
    Victim: {
      Name: 'Victim',
      GuildName: 'Enemy',
      Equipment: {
        MainHand: { Type: 'T8_2H_CLAYMORE_AVALON@2', Quality: 3 },
        Armor: { Type: 'T8_ARMOR_PLATE_SET3', Quality: 2 },
      },
      Inventory: [
        { Type: 'T8_RUNE', Count: 12, Quality: 1 },
        null,
      ],
    },
    ...overrides,
  }
}

beforeEach(() => {
  fetchAodpPricesMock.mockReset()
  loadAodpOptionsMock.mockReset()
  loadAodpOptionsMock.mockResolvedValue(aodpOptions)
})

describe('estimateKillbotVictimValue', () => {
  it('estimates victim gear and inventory value from AODP prices', async () => {
    fetchAodpPricesMock.mockResolvedValue(
      new Map([
        [
          'T8_2H_CLAYMORE_AVALON|2|3',
          {
            price: 1_000_000,
            city: 'Bridgewatch',
            fallbackTier: 'exact',
            confidence: 'high',
          },
        ],
        [
          'T8_ARMOR_PLATE_SET3|0|2',
          {
            price: null,
            city: null,
            fallbackTier: 'none',
            confidence: 'none',
          },
        ],
        [
          'T8_RUNE|0|1',
          {
            price: 1_000,
            city: 'Bridgewatch',
            fallbackTier: 'exact',
            confidence: 'high',
          },
        ],
      ]),
    )

    const result = await estimateKillbotVictimValue(event(), 'guild-1')

    expect(loadAodpOptionsMock).toHaveBeenCalledWith('guild-1')
    expect(fetchAodpPricesMock).toHaveBeenCalledWith(
      [
        { uniqueName: 'T8_2H_CLAYMORE_AVALON', enchant: 2, quality: 3 },
        { uniqueName: 'T8_ARMOR_PLATE_SET3', enchant: 0, quality: 2 },
        { uniqueName: 'T8_RUNE', enchant: 0, quality: 1 },
      ],
      aodpOptions,
    )
    expect(result).toMatchObject({
      totalSilver: 1_012_000,
      gearSilver: 1_000_000,
      inventorySilver: 12_000,
      totalItems: 3,
      pricedItems: 2,
      missingItems: 1,
      isPartial: true,
    })
  })

  it('does not call AODP when the victim has no items', async () => {
    const result = await estimateKillbotVictimValue(
      event({
        Victim: {
          Name: 'Victim',
          Equipment: {},
          Inventory: [null],
        },
      }),
      'guild-1',
    )

    expect(loadAodpOptionsMock).not.toHaveBeenCalled()
    expect(fetchAodpPricesMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      totalSilver: 0,
      totalItems: 0,
      pricedItems: 0,
      missingItems: 0,
      isPartial: false,
    })
  })
})
