import { describe, expect, it } from 'vitest'
import {
  buildOrderedStockReplayDeltas,
  stockReplayKey,
  summarizeStockReplayChanges,
} from './stock-replay'
import type { AggregateRow } from './aggregate-stock'

function row(input: {
  at: string
  quantity: number
  sequenceName?: string
  resolved?: boolean
  blacklisted?: boolean
}): AggregateRow {
  return {
    entry: {
      loggedAt: new Date(input.at),
      player: 'Tester',
      itemName: input.sequenceName ?? '테스트 아이템',
      enchant: 1,
      quality: 2,
      quantity: input.quantity,
    },
    resolved: input.resolved === false
      ? null
      : {
          uniqueName: 'T6_MAIN_SPEAR',
          nameKo: '테스트 창',
          category: 'melee',
          tier: 6,
        },
    isBlacklisted: input.blacklisted === true,
  }
}

describe('stock replay helpers', () => {
  it('orders stock deltas chronologically and filters rows that should not affect stock', () => {
    const deltas = buildOrderedStockReplayDeltas([
      row({ at: '2026-05-02T02:00:00Z', quantity: -2 }),
      row({ at: '2026-05-02T00:00:00Z', quantity: -10 }),
      row({ at: '2026-05-02T01:00:00Z', quantity: 5 }),
      row({ at: '2026-05-02T03:00:00Z', quantity: 99, blacklisted: true }),
      row({ at: '2026-05-02T04:00:00Z', quantity: 99, resolved: false }),
    ])

    expect(deltas.map((d) => d.delta)).toEqual([-10, 5, -2])
  })

  it('keeps later deposits after a withdrawal-only start instead of collapsing by net sum', () => {
    const deltas = buildOrderedStockReplayDeltas([
      row({ at: '2026-05-02T00:00:00Z', quantity: -10 }),
      row({ at: '2026-05-02T01:00:00Z', quantity: 5 }),
      row({ at: '2026-05-02T02:00:00Z', quantity: -2 }),
    ])

    const changes = summarizeStockReplayChanges(new Map(), deltas)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      uniqueName: 'T6_MAIN_SPEAR',
      delta: 3,
      newStock: 3,
    })
  })

  it('reports the applied inventory effect relative to the starting stock', () => {
    const deltas = buildOrderedStockReplayDeltas([
      row({ at: '2026-05-02T00:00:00Z', quantity: -10 }),
      row({ at: '2026-05-02T01:00:00Z', quantity: 5 }),
    ])
    const key = stockReplayKey(deltas[0])

    const changes = summarizeStockReplayChanges(new Map([[key, 4]]), deltas)

    expect(changes[0]).toMatchObject({
      delta: 1,
      newStock: 5,
    })
  })
})
