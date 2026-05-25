import type { AggregateRow, StockDelta } from './aggregate-stock'

export interface StockReplayDelta extends StockDelta {
  loggedAt: Date
  sequence: number
}

export interface StockReplayChange extends StockDelta {
  newStock: number
}

export function stockReplayKey(row: {
  uniqueName: string
  enchant: number
  quality: number
}): string {
  return `${row.uniqueName}|${row.enchant}|${row.quality}`
}

export function buildOrderedStockReplayDeltas(rows: AggregateRow[]): StockReplayDelta[] {
  return rows
    .map((row, sequence): StockReplayDelta | null => {
      if (row.isBlacklisted || !row.resolved) return null
      return {
        uniqueName: row.resolved.uniqueName,
        enchant: row.entry.enchant,
        quality: row.entry.quality,
        delta: row.entry.quantity,
        nameKo: row.resolved.nameKo || row.entry.itemName,
        category: row.resolved.category ?? null,
        tier: row.resolved.tier,
        loggedAt: row.entry.loggedAt,
        sequence,
      }
    })
    .filter((row): row is StockReplayDelta => row !== null)
    .sort((a, b) => {
      const byTime = a.loggedAt.getTime() - b.loggedAt.getTime()
      return byTime !== 0 ? byTime : a.sequence - b.sequence
    })
}

export function summarizeStockReplayChanges(
  initialStockByKey: Map<string, number>,
  deltas: readonly StockReplayDelta[],
): StockReplayChange[] {
  const current = new Map(initialStockByKey)
  const metaByKey = new Map<string, StockReplayDelta>()

  for (const delta of deltas) {
    const key = stockReplayKey(delta)
    const currentStock = current.get(key) ?? 0
    let nextStock = currentStock + delta.delta
    if (currentStock <= 0 && delta.delta <= 0) nextStock = 0
    if (nextStock <= 0) current.delete(key)
    else current.set(key, nextStock)
    metaByKey.set(key, delta)
  }

  return Array.from(metaByKey.entries())
    .map(([key, meta]) => {
      const startStock = initialStockByKey.get(key) ?? 0
      const newStock = current.get(key) ?? 0
      return {
        uniqueName: meta.uniqueName,
        nameKo: meta.nameKo,
        enchant: meta.enchant,
        quality: meta.quality,
        delta: newStock - startStock,
        newStock,
        category: meta.category,
        tier: meta.tier,
      }
    })
    .filter((change) => change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.uniqueName.localeCompare(b.uniqueName))
}
