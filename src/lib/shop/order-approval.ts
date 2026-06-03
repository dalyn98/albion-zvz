export interface ShopOrderApprovalStockLine {
  stockAvailable: number
  quantity: number
}

export function isShopOrderStockReserved(stockReservedAt: string | null): boolean {
  return stockReservedAt !== null
}

export function hasBlockingShopOrderStockShortage(input: {
  stockReservedAt: string | null
  items: readonly ShopOrderApprovalStockLine[]
}): boolean {
  if (isShopOrderStockReserved(input.stockReservedAt)) return false
  return input.items.some((item) => item.stockAvailable < item.quantity)
}

export function hasBlockingShopOrderLineStockShortage(input: {
  stockReservedAt: string | null
  item: ShopOrderApprovalStockLine
}): boolean {
  if (isShopOrderStockReserved(input.stockReservedAt)) return false
  return input.item.stockAvailable < input.item.quantity
}
