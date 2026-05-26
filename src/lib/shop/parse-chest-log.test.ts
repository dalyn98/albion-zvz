import { describe, expect, it } from 'vitest'
import { parseChestLog } from './parse-chest-log'

describe('parseChestLog', () => {
  it('skips localized chest log headers and parses English item rows', () => {
    const raw = [
      '"Date"\t"Player"\t"Item"\t"Enchantment"\t"Quality"\t"Quantity"',
      '"05/24/2026 14:05:00"\t"MonKKu"\t"Expert\'s Hellion Jacket"\t"3"\t"1"\t"2"',
    ].join('\n')

    const result = parseChestLog(raw)

    expect(result.errors).toEqual([])
    expect(result.entries).toEqual([
      expect.objectContaining({
        player: 'MonKKu',
        itemName: "Expert's Hellion Jacket",
        enchant: 3,
        quality: 1,
        quantity: 2,
      }),
    ])
    expect(result.entries[0].loggedAt.toISOString()).toBe('2026-05-24T05:05:00.000Z')
  })

  it('accepts ISO-like dates used by localized exports', () => {
    const raw = [
      '"日期"\t"玩家"\t"物品"\t"附魔"\t"质量"\t"数量"',
      '"2026-05-24 14:05:00"\t"MonKKu"\t"专家级喧嚣外套"\t"3"\t"1"\t"2"',
    ].join('\n')

    const result = parseChestLog(raw)

    expect(result.errors).toEqual([])
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].loggedAt.toISOString()).toBe('2026-05-24T05:05:00.000Z')
  })
})
