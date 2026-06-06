import { stockReplayKey } from './stock-replay'
import type { AggregateRow } from './aggregate-stock'

export interface MatchedShopOrderFulfillment {
  orderId: string
  orderItemId: string
  quantity: number
}

export interface ShopOrderFulfillmentCandidate {
  orderId: string
  orderItemId: string
  uniqueName: string
  enchant: number
  quality: number
  quantity: number
  fulfilledQuantity: number
  createdAt: Date
  stockReservedAt: Date | null
  resolvedAt: Date
}

interface MutableCandidate extends ShopOrderFulfillmentCandidate {
  remainingQuantity: number
}

function candidateMatchAvailableAt(candidate: ShopOrderFulfillmentCandidate): Date {
  return candidate.stockReservedAt ?? candidate.resolvedAt
}

export function reconcileShopOrderFulfillmentRows<T extends AggregateRow>(
  rows: readonly T[],
  candidates: readonly ShopOrderFulfillmentCandidate[],
): T[] {
  if (rows.length === 0 || candidates.length === 0) return [...rows]

  const candidatesByKey = new Map<string, MutableCandidate[]>()
  for (const candidate of candidates) {
    const remainingQuantity = Math.max(0, candidate.quantity - candidate.fulfilledQuantity)
    if (remainingQuantity <= 0) continue
    const key = stockReplayKey(candidate)
    const bucket = candidatesByKey.get(key) ?? []
    bucket.push({ ...candidate, remainingQuantity })
    candidatesByKey.set(key, bucket)
  }

  for (const bucket of candidatesByKey.values()) {
    bucket.sort((a, b) => {
      const byAvailable =
        candidateMatchAvailableAt(a).getTime() - candidateMatchAvailableAt(b).getTime()
      if (byAvailable !== 0) return byAvailable
      const byResolved = a.resolvedAt.getTime() - b.resolvedAt.getTime()
      if (byResolved !== 0) return byResolved
      const byCreated = a.createdAt.getTime() - b.createdAt.getTime()
      return byCreated !== 0 ? byCreated : a.orderItemId.localeCompare(b.orderItemId)
    })
  }

  return rows.map((row) => {
    if (row.entry.quantity >= 0 || row.isBlacklisted || !row.resolved) return row

    const key = stockReplayKey({
      uniqueName: row.resolved.uniqueName,
      enchant: row.entry.enchant,
    })
    const candidatesForItem = candidatesByKey.get(key)
    if (!candidatesForItem) return row

    let remainingWithdrawal = Math.abs(row.entry.quantity)
    const matches: MatchedShopOrderFulfillment[] = []
    for (const candidate of candidatesForItem) {
      if (remainingWithdrawal <= 0) break
      if (candidate.remainingQuantity <= 0) continue
      if (candidateMatchAvailableAt(candidate).getTime() > row.entry.loggedAt.getTime()) continue

      const matchedQuantity = Math.min(remainingWithdrawal, candidate.remainingQuantity)
      candidate.remainingQuantity -= matchedQuantity
      remainingWithdrawal -= matchedQuantity
      matches.push({
        orderId: candidate.orderId,
        orderItemId: candidate.orderItemId,
        quantity: matchedQuantity,
      })
    }

    if (matches.length === 0) return row

    const ignoredQuantity = -matches.reduce((sum, match) => sum + match.quantity, 0)
    const primaryMatch = matches[0]
    return {
      ...row,
      appliedQuantity: row.entry.quantity - ignoredQuantity,
      ignoredQuantity,
      ignoredReason: 'shop_order_fulfillment',
      matchedOrderId: primaryMatch.orderId,
      matchedOrderItemId: primaryMatch.orderItemId,
      matchedOrderItems: matches,
    }
  })
}
