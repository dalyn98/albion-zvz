export interface ShopCartDraftLine {
  inventoryId: string
  quantity: number
  quotedUnitPoints: number | null
  quoteUnitSilver?: string
  quoteCity?: string
  quoteNote?: string
  quoteOpen?: boolean
}

export interface ShopCartDraft {
  version: 1
  lines: ShopCartDraftLine[]
}

export interface ShopCartInventorySnapshot {
  id: string
  stock: number
  pointPrice: number | null
}

export interface RestoredShopCartDraft {
  lines: ShopCartDraftLine[]
  changes: {
    removedIds: string[]
    clampedIds: string[]
    repricedIds: string[]
  }
}

export function restoreShopCartDraft(
  draft: ShopCartDraft,
  inventory: ShopCartInventorySnapshot[],
): RestoredShopCartDraft {
  const inventoryById = new Map(inventory.map((item) => [item.id, item]))
  const lines: ShopCartDraftLine[] = []
  const removedIds: string[] = []
  const clampedIds: string[] = []
  const repricedIds: string[] = []

  for (const line of draft.lines) {
    const current = inventoryById.get(line.inventoryId)
    if (!current || current.stock <= 0) {
      removedIds.push(line.inventoryId)
      continue
    }
    const quantity = Math.min(Math.max(1, Math.trunc(line.quantity)), current.stock)
    if (quantity !== line.quantity) clampedIds.push(line.inventoryId)
    if (line.quotedUnitPoints !== current.pointPrice) repricedIds.push(line.inventoryId)
    lines.push({ ...line, quantity, quotedUnitPoints: current.pointPrice })
  }

  return {
    lines,
    changes: { removedIds, clampedIds, repricedIds },
  }
}

export function parseShopCartDraft(value: string | null): ShopCartDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ShopCartDraft>
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) return null
    const lines = parsed.lines.filter((line): line is ShopCartDraftLine => {
      if (!line || typeof line !== 'object') return false
      return (
        typeof line.inventoryId === 'string' &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0 &&
        (line.quotedUnitPoints === null || typeof line.quotedUnitPoints === 'number')
      )
    })
    return { version: 1, lines }
  } catch {
    return null
  }
}
