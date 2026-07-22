export interface ShopCartDraftLine {
  inventoryId: string
  quantity: number
  quotedUnitPoints: number | null
  itemSnapshot?: ShopCartItemSnapshot
  quoteUnitSilver?: string
  quoteCity?: string
  quoteNote?: string
  quoteOpen?: boolean
}

export interface ShopCartItemSnapshot {
  id: string
  uniqueName: string
  enchant: number
  quality: number
  stock: number
  nameKo: string
  category: string | null
  tier: number | null
  pointPrice: number | null
  priceWarning: 'quality' | 'window' | 'bluezone' | 'redzone' | null
  displayName: string
  localizedName: string
  originalName: string
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
  options: { preserveMissingWithSnapshot?: boolean } = {},
): RestoredShopCartDraft {
  const inventoryById = new Map(inventory.map((item) => [item.id, item]))
  const lines: ShopCartDraftLine[] = []
  const removedIds: string[] = []
  const clampedIds: string[] = []
  const repricedIds: string[] = []

  for (const line of draft.lines) {
    const current = inventoryById.get(line.inventoryId)
    if (!current) {
      const snapshot = line.itemSnapshot
      if (
        options.preserveMissingWithSnapshot === true &&
        snapshot?.id === line.inventoryId &&
        snapshot.stock > 0
      ) {
        lines.push({
          ...line,
          quantity: Math.min(Math.max(1, Math.trunc(line.quantity)), snapshot.stock),
        })
        continue
      }
      removedIds.push(line.inventoryId)
      continue
    }
    if (current.stock <= 0) {
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

const PRICE_WARNINGS = new Set(['quality', 'window', 'bluezone', 'redzone'])

function parseItemSnapshot(value: unknown, inventoryId: string): ShopCartItemSnapshot | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const item = value as Record<string, unknown>
  if (
    item.id !== inventoryId ||
    typeof item.uniqueName !== 'string' ||
    !Number.isInteger(item.enchant) ||
    !Number.isInteger(item.quality) ||
    !Number.isInteger(item.stock) ||
    Number(item.stock) <= 0 ||
    typeof item.nameKo !== 'string' ||
    (item.category !== null && typeof item.category !== 'string') ||
    (item.tier !== null && !Number.isInteger(item.tier)) ||
    (item.pointPrice !== null && typeof item.pointPrice !== 'number') ||
    (item.priceWarning !== null && !PRICE_WARNINGS.has(String(item.priceWarning))) ||
    typeof item.displayName !== 'string' ||
    typeof item.localizedName !== 'string' ||
    typeof item.originalName !== 'string'
  ) {
    return undefined
  }
  return item as unknown as ShopCartItemSnapshot
}

export function parseShopCartDraft(value: string | null): ShopCartDraft | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<ShopCartDraft>
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) return null
    const lines = parsed.lines.flatMap((line): ShopCartDraftLine[] => {
      if (!line || typeof line !== 'object') return []
      if (
        typeof line.inventoryId !== 'string' ||
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0 ||
        (line.quotedUnitPoints !== null && typeof line.quotedUnitPoints !== 'number')
      ) return []
      const itemSnapshot = parseItemSnapshot(line.itemSnapshot, line.inventoryId)
      return [{
        inventoryId: line.inventoryId,
        quantity: line.quantity,
        quotedUnitPoints: line.quotedUnitPoints,
        ...(itemSnapshot ? { itemSnapshot } : {}),
        ...(typeof line.quoteUnitSilver === 'string' ? { quoteUnitSilver: line.quoteUnitSilver } : {}),
        ...(typeof line.quoteCity === 'string' ? { quoteCity: line.quoteCity } : {}),
        ...(typeof line.quoteNote === 'string' ? { quoteNote: line.quoteNote } : {}),
        ...(typeof line.quoteOpen === 'boolean' ? { quoteOpen: line.quoteOpen } : {}),
      }]
    })
    return { version: 1, lines }
  } catch {
    return null
  }
}
