import { describe, expect, it } from 'vitest'
import { buildOrderedStockReplayDeltas } from './stock-replay'
import type { AggregateRow } from './aggregate-stock'
import {
  reconcileShopOrderFulfillmentRows,
  type ShopOrderFulfillmentCandidate,
} from './order-fulfillment-reconciliation'

function row(input: {
  at: string
  quantity: number
  quality?: number
  resolved?: boolean
  blacklisted?: boolean
}): AggregateRow {
  return {
    entry: {
      loggedAt: new Date(input.at),
      player: 'Quartermaster',
      itemName: '테스트 장비',
      enchant: 0,
      quality: input.quality ?? 1,
      quantity: input.quantity,
    },
    resolved: input.resolved === false
      ? null
      : {
          uniqueName: 'T4_TEST_ITEM',
          nameKo: '테스트 장비',
          category: 'armor',
          tier: 4,
        },
    isBlacklisted: input.blacklisted === true,
  }
}

function candidate(
  input: Partial<ShopOrderFulfillmentCandidate> & { stockReservedAt?: Date } = {},
): ShopOrderFulfillmentCandidate {
  const base: ShopOrderFulfillmentCandidate = {
    orderId: input.orderId ?? 'order-1',
    orderItemId: input.orderItemId ?? 'order-item-1',
    uniqueName: input.uniqueName ?? 'T4_TEST_ITEM',
    enchant: input.enchant ?? 0,
    quality: input.quality ?? 1,
    quantity: input.quantity ?? 1,
    fulfilledQuantity: input.fulfilledQuantity ?? 0,
    createdAt: input.createdAt ?? new Date('2026-05-01T00:00:00.000Z'),
    stockReservedAt: input.stockReservedAt ?? null,
    resolvedAt: input.resolvedAt ?? new Date('2026-05-01T01:00:00.000Z'),
  }
  return base
}

describe('shop order fulfillment reconciliation', () => {
  it('excludes an approved order withdrawal from stock replay while keeping the raw quantity', () => {
    const [reconciled] = reconcileShopOrderFulfillmentRows(
      [row({ at: '2026-05-01T02:00:00.000Z', quantity: -1 })],
      [candidate()],
    )

    expect(reconciled.entry.quantity).toBe(-1)
    expect(reconciled.appliedQuantity).toBe(0)
    expect(reconciled.ignoredQuantity).toBe(-1)
    expect(reconciled.ignoredReason).toBe('shop_order_fulfillment')
    expect(reconciled.matchedOrderId).toBe('order-1')
    expect(reconciled.matchedOrderItemId).toBe('order-item-1')
    expect(reconciled.matchedOrderItems).toEqual([
      {
        orderId: 'order-1',
        orderItemId: 'order-item-1',
        quantity: 1,
      },
    ])
    expect(buildOrderedStockReplayDeltas([reconciled])).toEqual([])
  })

  it('keeps the unmatched part of a larger withdrawal as an inventory delta', () => {
    const [reconciled] = reconcileShopOrderFulfillmentRows(
      [row({ at: '2026-05-01T02:00:00.000Z', quantity: -3 })],
      [candidate({ quantity: 1 })],
    )

    expect(reconciled.appliedQuantity).toBe(-2)
    expect(reconciled.ignoredQuantity).toBe(-1)
    expect(buildOrderedStockReplayDeltas([reconciled]).map((delta) => delta.delta)).toEqual([-2])
  })

  it('matches withdrawals after stock reservation even when approval happens later', () => {
    const [reconciled] = reconcileShopOrderFulfillmentRows(
      [row({ at: '2026-05-01T00:30:00.000Z', quantity: -1 })],
      [
        candidate({
          stockReservedAt: new Date('2026-05-01T00:00:00.000Z'),
          resolvedAt: new Date('2026-05-01T01:00:00.000Z'),
        }),
      ],
    )

    expect(reconciled.appliedQuantity).toBe(0)
    expect(reconciled.ignoredReason).toBe('shop_order_fulfillment')
    expect(buildOrderedStockReplayDeltas([reconciled])).toEqual([])
  })

  it('does not match withdrawals that happened before reservation', () => {
    const [reconciled] = reconcileShopOrderFulfillmentRows(
      [row({ at: '2026-05-01T00:30:00.000Z', quantity: -1 })],
      [
        candidate({
          stockReservedAt: new Date('2026-05-01T01:00:00.000Z'),
          resolvedAt: new Date('2026-05-01T02:00:00.000Z'),
        }),
      ],
    )

    expect(reconciled.appliedQuantity).toBeUndefined()
    expect(reconciled.ignoredReason).toBeUndefined()
    expect(buildOrderedStockReplayDeltas([reconciled]).map((delta) => delta.delta)).toEqual([-1])
  })

  it('matches order fulfillment regardless of item quality', () => {
    const [reconciled] = reconcileShopOrderFulfillmentRows(
      [row({ at: '2026-05-01T02:00:00.000Z', quantity: -1, quality: 5 })],
      [candidate({ quality: 1 })],
    )

    expect(reconciled.appliedQuantity).toBe(0)
    expect(reconciled.ignoredReason).toBe('shop_order_fulfillment')
  })

  it('does not over-match order quantities already fulfilled by earlier logs', () => {
    const [first, second] = reconcileShopOrderFulfillmentRows(
      [
        row({ at: '2026-05-01T02:00:00.000Z', quantity: -1 }),
        row({ at: '2026-05-01T03:00:00.000Z', quantity: -1 }),
      ],
      [candidate({ quantity: 2, fulfilledQuantity: 1 })],
    )

    expect(first.appliedQuantity).toBe(0)
    expect(second.appliedQuantity).toBeUndefined()
    expect(buildOrderedStockReplayDeltas([first, second]).map((delta) => delta.delta)).toEqual([-1])
  })
})
