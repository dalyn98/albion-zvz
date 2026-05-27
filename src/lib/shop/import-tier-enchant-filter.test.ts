import { describe, expect, it } from 'vitest'
import type { AggregateRow } from './aggregate-stock'
import {
  applyTierEnchantSumFilter,
  parseTierEnchantSumFilter,
  tierEnchantSum,
} from './import-tier-enchant-filter'

function row(input: {
  name: string
  tier?: number | null
  enchant: number
  resolved?: boolean
  blacklisted?: boolean
}): AggregateRow {
  const tier = input.tier === undefined ? 4 : input.tier
  return {
    entry: {
      loggedAt: new Date('2026-05-27T00:00:00Z'),
      player: 'Tester',
      itemName: input.name,
      enchant: input.enchant,
      quality: 1,
      quantity: 1,
    },
    resolved: input.resolved === false
      ? null
      : {
          uniqueName: tier == null ? 'TEST_ITEM' : `T${tier}_TEST_ITEM`,
          nameKo: input.name,
          category: 'weapon',
          tier,
        },
    isBlacklisted: input.blacklisted === true,
  }
}

describe('tier/enchant import filter', () => {
  it('calculates tier plus enchant from resolved rows', () => {
    expect(tierEnchantSum(row({ name: '장로의 메이스', tier: 8, enchant: 2 }))).toBe(10)
    expect(tierEnchantSum(row({ name: '미해결', enchant: 2, resolved: false }))).toBeNull()
  })

  it('excludes rows at or below and at or above the configured inclusive bounds', () => {
    const filter = parseTierEnchantSumFilter({
      excludeAtOrBelow: '4',
      excludeAtOrAbove: '10',
    })
    const result = applyTierEnchantSumFilter(
      [
        row({ name: 'T4 flat', tier: 4, enchant: 0 }),
        row({ name: 'T5.1', tier: 5, enchant: 1 }),
        row({ name: 'T8.2', tier: 8, enchant: 2 }),
        row({ name: 'T8.3', tier: 8, enchant: 3 }),
      ],
      filter,
    )

    expect(result.excludedRows).toBe(3)
    expect(result.rows.map((r) => r.entry.itemName)).toEqual(['T5.1'])
  })

  it('keeps unresolved or no-tier rows because their sum cannot be evaluated', () => {
    const result = applyTierEnchantSumFilter(
      [
        row({ name: '미해결', enchant: 0, resolved: false }),
        row({ name: '티어 없음', tier: null, enchant: 4 }),
      ],
      { excludeAtOrBelow: 12, excludeAtOrAbove: null },
    )

    expect(result.excludedRows).toBe(0)
    expect(result.rows).toHaveLength(2)
  })

  it('leaves rows untouched when both bounds are disabled', () => {
    const rows = [
      row({ name: 'T4 flat', tier: 4, enchant: 0 }),
      row({ name: 'T8.4', tier: 8, enchant: 4 }),
    ]

    expect(
      applyTierEnchantSumFilter(rows, {
        excludeAtOrBelow: null,
        excludeAtOrAbove: null,
      }),
    ).toEqual({ rows, excludedRows: 0 })
  })
})
