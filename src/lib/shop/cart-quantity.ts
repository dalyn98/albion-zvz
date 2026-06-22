const QUANTITY_GROUP_SEPARATOR = /,/g

function normalizeStockLimit(stock: number): number {
  if (!Number.isFinite(stock)) return 0
  return Math.max(0, Math.floor(stock))
}

export function normalizeShopCartQuantityInput(
  value: string,
  stock: number,
): number | null {
  const max = normalizeStockLimit(stock)
  if (max <= 0) return null

  const trimmed = value.trim().replace(QUANTITY_GROUP_SEPARATOR, '')
  if (!trimmed) return null

  const quantity = Number(trimmed)
  if (!Number.isInteger(quantity) || quantity <= 0) return null

  return Math.min(quantity, max)
}

export function applyShopCartQuantityDelta(
  currentQuantity: number,
  delta: number,
  stock: number,
): number {
  const max = normalizeStockLimit(stock)
  if (max <= 0) return 0
  if (!Number.isFinite(currentQuantity) || !Number.isFinite(delta)) return 0

  const nextQuantity = Math.floor(currentQuantity) + Math.floor(delta)
  return Math.max(0, Math.min(max, nextQuantity))
}
