// 상자 로그 행들을 (item × enchant × quality) 단위로 합산해 재고 델타를 만든다.
// 블랙리스트/미해결 행은 원본 보존용 삽입 목록에는 남지만 재고 합산에선 제외.

import type { ChestLogEntry } from './parse-chest-log'
import type { ResolvedItem } from './resolve-item'
import type { MatchedShopOrderFulfillment } from './order-fulfillment-reconciliation'

export interface StockDelta {
  uniqueName: string
  enchant: number
  quality: number
  delta: number
  nameKo: string
  category: string | null
  tier: number | null
}

export interface AggregateRow {
  entry: ChestLogEntry
  resolved: ResolvedItem | null
  isBlacklisted: boolean
  appliedQuantity?: number
  ignoredQuantity?: number
  ignoredReason?: 'shop_order_fulfillment'
  matchedOrderId?: string
  matchedOrderItemId?: string
  matchedOrderItems?: MatchedShopOrderFulfillment[]
}

export interface ChestLogInsert {
  loggedAt: Date
  importSequence: number
  player: string
  itemNameRaw: string
  enchant: number
  quality: number
  quantity: number
  appliedQuantity: number
  ignoredQuantity: number
  ignoredReason: 'shop_order_fulfillment' | null
  matchedOrderId: string | null
  matchedOrderItemId: string | null
  matchedOrderItems: MatchedShopOrderFulfillment[]
  uniqueName: string | null
}

export interface AggregateResult {
  toInsert: ChestLogInsert[]
  stockDeltas: StockDelta[]
  unresolvedNames: string[]
}

export function aggregateStock(rows: AggregateRow[]): AggregateResult {
  const toInsert: ChestLogInsert[] = []
  const bucket = new Map<string, StockDelta>()
  const unresolved = new Set<string>()

  for (let importSequence = 0; importSequence < rows.length; importSequence++) {
    const row = rows[importSequence]
    const { entry, resolved, isBlacklisted } = row
    const appliedQuantity = row.appliedQuantity ?? entry.quantity
    toInsert.push({
      loggedAt: entry.loggedAt,
      importSequence,
      player: entry.player,
      itemNameRaw: entry.itemName,
      enchant: entry.enchant,
      quality: entry.quality,
      quantity: entry.quantity,
      appliedQuantity,
      ignoredQuantity: row.ignoredQuantity ?? 0,
      ignoredReason: row.ignoredReason ?? null,
      matchedOrderId: row.matchedOrderId ?? null,
      matchedOrderItemId: row.matchedOrderItemId ?? null,
      matchedOrderItems: row.matchedOrderItems ?? [],
      uniqueName: resolved?.uniqueName ?? null,
    })

    if (isBlacklisted) continue
    if (!resolved) {
      unresolved.add(entry.itemName)
      continue
    }

    const key = `${resolved.uniqueName}|${entry.enchant}|${entry.quality}`
    const existing = bucket.get(key)
    if (existing) {
      existing.delta += appliedQuantity
      continue
    }
    bucket.set(key, {
      uniqueName: resolved.uniqueName,
      enchant: entry.enchant,
      quality: entry.quality,
      delta: appliedQuantity,
      nameKo: resolved.nameKo || entry.itemName,
      category: resolved.category ?? null,
      tier: resolved.tier,
    })
  }

  return {
    toInsert,
    stockDeltas: [...bucket.values()],
    unresolvedNames: [...unresolved],
  }
}
